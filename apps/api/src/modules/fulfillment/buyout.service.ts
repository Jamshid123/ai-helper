import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { Obligation, Prisma } from '@prisma/client'
import { RULES } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { pickupCode, pickupCodeMatches } from '../../common/pickup-code'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'
import { PAYMENT_PROVIDER, type PaymentProvider } from '../payments/payment-provider'
import { RefundsService } from '../payments/refunds.service'
import { AuditService } from '../staff/audit.service'

/** Сотрудник, выполняющий действие (для журнала). */
export type StaffActor = { staffId: string; ip: string | null }
type Part = 'prepayment' | 'remainder'
type ExpireReason = 'PREPAYMENT_MISSED' | 'PICKUP_MISSED'

const conflict = (code: string, message: string) => new ConflictException({ code, message })

/**
 * Выкуп (решения 14.11 и 16.11.2026):
 * торги закрылись → победитель за 15 минут оплачивает 10% своей цены → получает код выдачи и 24 часа,
 * чтобы оплатить остаток 90% (онлайн или на месте) и забрать товар. Сотрудник выдаёт товар по коду.
 * Не оплатил 10% — ограничение на 7 дней и повторные торги; не забрал — победа аннулируется, судьбу 10%
 * решают финансы вручную, повторные торги. Повторные торги — черновик лота для оператора, допуск остальных
 * участников переносится. Ставки и победителя никто не правит: аннулирование выполняет только сервер по сроку.
 */
@Injectable()
export class BuyoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly refunds: RefundsService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(ENV) private readonly env: Env
  ) {}

  // ───────────── Покупатель ─────────────

  async mine(userId: string) {
    const list = await this.prisma.obligation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { lot: { select: { title: true } } },
    })
    const paidRemainder = await this.paidRemainderLots(list.map((o) => o.lotId), userId)
    return list.map((o) => this.buyerDto(o, o.lot.title, paidRemainder.has(o.lotId)))
  }

  /** Начать оплату 10% или остатка: заказ на сумму, которую считает сервер, → оплата у провайдера. */
  async startPayment(userId: string, obligationId: string, part: Part) {
    const o = await this.prisma.obligation.findUnique({ where: { id: obligationId }, include: { lot: true } })
    if (!o) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Покупка не найдена' })
    if (o.userId !== userId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Это не ваша покупка' })
    const now = this.clock.now()
    const purpose = part === 'prepayment' ? 'PREPAYMENT' : 'REMAINDER'
    if (part === 'prepayment') {
      if (o.status !== 'AWAITING_PREPAYMENT' || !o.prepaymentDeadline || now >= o.prepaymentDeadline) {
        throw conflict('PAYMENT_CLOSED', 'Срок оплаты 10% истёк')
      }
    } else {
      if (o.status !== 'AWAITING_PICKUP' || !o.remainderDeadline || now >= o.remainderDeadline) {
        throw conflict('PAYMENT_CLOSED', 'Оплатить остаток уже нельзя')
      }
      const paid = await this.prisma.order.findFirst({
        where: { lotId: o.lotId, userId, purpose: 'REMAINDER', status: 'PAID' },
        select: { id: true },
      })
      if (paid) throw conflict('ALREADY_PAID', 'Остаток уже оплачен')
    }
    const amount = part === 'prepayment' ? o.prepaymentAmount : o.amount - o.prepaymentAmount
    const order =
      (await this.prisma.order.findFirst({ where: { userId, lotId: o.lotId, purpose, status: 'PENDING' } })) ??
      (await this.prisma.order.create({
        data: { userId, lotId: o.lotId, purpose, amount, provider: this.provider.name },
      }))
    const checkout = await this.provider.createCheckout({
      id: order.id,
      amount: order.amount,
      description: `${part === 'prepayment' ? 'Предоплата 10%' : 'Остаток'}: ${o.lot.title}`,
    })
    return {
      orderId: order.id,
      amount: order.amount.toString(),
      provider: checkout.provider,
      checkoutUrl: checkout.checkoutUrl,
    }
  }

  // ───────────── Сроки (вызывает sweep расписания) ─────────────

  /** Аннулировать просроченные выкупы. Идемпотентно: каждое обязательство переводится под FOR UPDATE ровно один раз. */
  async expireDue(): Promise<number> {
    const now = this.clock.now()
    const due = await this.prisma.obligation.findMany({
      where: {
        OR: [
          { status: 'AWAITING_PREPAYMENT', prepaymentDeadline: { lte: now } },
          { status: 'AWAITING_PICKUP', remainderDeadline: { lte: now } },
        ],
      },
      select: { id: true },
    })
    let n = 0
    for (const { id } of due) if (await this.expire(id)) n++
    return n
  }

  private async expire(id: string): Promise<boolean> {
    const now = this.clock.now()
    const refundIds: string[] = []
    const done = await this.prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Obligation" WHERE id = ${id}::uuid FOR UPDATE`
      if (!locked) return false
      const o = await tx.obligation.findUniqueOrThrow({ where: { id } })
      let reason: ExpireReason
      if (o.status === 'AWAITING_PREPAYMENT' && o.prepaymentDeadline && o.prepaymentDeadline <= now) {
        reason = 'PREPAYMENT_MISSED'
      } else if (o.status === 'AWAITING_PICKUP' && o.remainderDeadline && o.remainderDeadline <= now) {
        reason = 'PICKUP_MISSED'
      } else return false

      await tx.obligation.update({
        where: { id },
        data: {
          status: 'EXPIRED',
          expiredReason: reason,
          ...(reason === 'PICKUP_MISSED' && { prepaymentDecision: 'PENDING' }),
        },
      })
      // Неоплаченные заказы выкупа закрываем: оплата после аннулирования уйдёт на возврат.
      await tx.order.updateMany({
        where: { lotId: o.lotId, userId: o.userId, purpose: { in: ['PREPAYMENT', 'REMAINDER'] }, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      })
      if (reason === 'PREPAYMENT_MISSED') {
        await tx.restriction.create({
          data: {
            userId: o.userId,
            reason: 'Не оплачены 10% за выигранный лот в течение 15 минут',
            obligationId: o.id,
            startsAt: now,
            endsAt: new Date(now.getTime() + RULES.NO_BUYOUT_BAN_DAYS * 86_400_000),
          },
        })
      } else {
        // Остаток, оплаченный онлайн за товар, который не выдан, возвращаем; 10% — решение финансов.
        const remainder = await tx.order.findMany({
          where: { lotId: o.lotId, userId: o.userId, purpose: 'REMAINDER', status: 'PAID', provider: { not: 'onsite' } },
          select: { id: true },
        })
        if (remainder.length) {
          await tx.order.updateMany({
            where: { id: { in: remainder.map((r) => r.id) } },
            data: { status: 'REFUND_PENDING' },
          })
          refundIds.push(...remainder.map((r) => r.id))
        }
      }
      await tx.lot.update({ where: { id: o.lotId }, data: { status: 'CLOSED_UNSOLD' } })
      const relistId = await this.relist(tx, o.lotId, o.userId, now)
      await this.audit.log(
        {
          actorType: 'system',
          action: 'obligation.expired',
          entityType: 'lot',
          entityId: o.lotId,
          reason: reason === 'PREPAYMENT_MISSED' ? 'Победитель не оплатил 10% за 15 минут' : 'Товар не забран за 24 часа',
          meta: { obligationId: o.id, userId: o.userId, relistLotId: relistId },
        },
        tx
      )
      await tx.outboxEvent.create({
        data: {
          type: 'obligation.expired',
          aggregateId: o.lotId,
          payload: { obligationId: o.id, userId: o.userId, reason, relistLotId: relistId },
        },
      })
      return true
    })
    if (refundIds.length) await this.refunds.settle(refundIds)
    return done
  }

  /**
   * Повторные торги: черновик лота с тем же товаром и параметрами; дату выбирает и публикует оператор.
   * Допуск участников переносится без оплаты (решение 16.11.2026), кроме победителя, который не выкупил.
   */
  private async relist(tx: Prisma.TransactionClient, lotId: string, excludeUserId: string, now: Date) {
    const existing = await tx.lot.findUnique({ where: { relistOfId: lotId }, select: { id: true } })
    if (existing) return existing.id
    const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId } })
    const duration = lot.closesAt.getTime() - lot.opensAt.getTime()
    const opensAt = new Date(now.getTime() + 86_400_000) // заглушка: оператор выберет время перед публикацией
    const admissions = await tx.admission.findMany({
      where: { lotId, userId: { not: excludeUserId } },
      select: { userId: true },
    })
    const relist = await tx.lot.create({
      data: {
        title: lot.title,
        categoryId: lot.categoryId,
        productId: lot.productId,
        condition: lot.condition,
        sellerType: lot.sellerType,
        description: lot.description,
        inspection: lot.inspection as Prisma.InputJsonValue,
        startPrice: lot.startPrice,
        step: lot.step,
        fee: lot.fee,
        maxParticipants: lot.maxParticipants,
        minParticipants: lot.minParticipants,
        bidTimeoutSec: lot.bidTimeoutSec,
        status: 'DRAFT',
        opensAt,
        closesAt: new Date(opensAt.getTime() + duration),
        relistOfId: lotId,
        admittedCount: admissions.length,
      },
    })
    if (admissions.length) {
      await tx.admission.createMany({
        data: admissions.map((a) => ({ lotId: relist.id, userId: a.userId, carriedFromLotId: lotId })),
      })
    }
    return relist.id
  }

  // ───────────── Сотрудник выдачи / финансы ─────────────

  async list(filter: 'active' | 'decisions' | 'all') {
    const where: Prisma.ObligationWhereInput =
      filter === 'active'
        ? { status: { in: ['AWAITING_PREPAYMENT', 'AWAITING_PICKUP'] } }
        : filter === 'decisions'
          ? { prepaymentDecision: 'PENDING' }
          : {}
    const list = await this.prisma.obligation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        lot: { select: { title: true, relist: { select: { id: true, status: true } } } },
        user: { select: { publicName: true, firstName: true, phone: true } },
      },
    })
    const remainder = await this.prisma.order.findMany({
      where: { purpose: 'REMAINDER', status: 'PAID', lotId: { in: list.map((o) => o.lotId) } },
      select: { lotId: true, userId: true, provider: true },
    })
    return list.map((o) => {
      const r = remainder.find((x) => x.lotId === o.lotId && x.userId === o.userId)
      return {
        id: o.id,
        lotId: o.lotId,
        lotTitle: o.lot.title,
        buyer: { name: o.user.publicName, firstName: o.user.firstName, phone: o.user.phone },
        status: o.status,
        amount: o.amount.toString(),
        prepaymentAmount: o.prepaymentAmount.toString(),
        remainderAmount: (o.amount - o.prepaymentAmount).toString(),
        prepaymentDeadline: o.prepaymentDeadline?.toISOString() ?? null,
        remainderDeadline: o.remainderDeadline?.toISOString() ?? null,
        remainderPaid: r ? (r.provider === 'onsite' ? 'onsite' : 'online') : null,
        expiredReason: o.expiredReason,
        prepaymentDecision: o.prepaymentDecision,
        decisionReason: o.decisionReason,
        completedAt: o.completedAt?.toISOString() ?? null,
        relist: o.lot.relist ? { id: o.lot.relist.id, status: o.lot.relist.status } : null,
      }
    })
  }

  /** Остаток получен в пункте выдачи (наличные или терминал) — отмечает сотрудник. */
  async markRemainderOnSite(id: string, method: 'cash' | 'card', actor: StaffActor) {
    return this.prisma.$transaction(async (tx) => {
      const o = await this.lockActive(tx, id)
      const paid = await tx.order.findFirst({
        where: { lotId: o.lotId, userId: o.userId, purpose: 'REMAINDER', status: 'PAID' },
        select: { id: true },
      })
      if (paid) throw conflict('ALREADY_PAID', 'Остаток уже оплачен')
      const now = this.clock.now()
      await tx.order.updateMany({
        where: { lotId: o.lotId, userId: o.userId, purpose: 'REMAINDER', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      })
      const order = await tx.order.create({
        data: {
          userId: o.userId,
          lotId: o.lotId,
          purpose: 'REMAINDER',
          amount: o.amount - o.prepaymentAmount,
          provider: 'onsite',
          providerTxId: `onsite-${o.id}`,
          status: 'PAID',
          paidAt: now,
        },
      })
      await this.audit.log(
        {
          actorType: 'staff',
          actorId: actor.staffId,
          action: 'obligation.remainder_onsite',
          entityType: 'lot',
          entityId: o.lotId,
          meta: { obligationId: o.id, orderId: order.id, method, amount: order.amount.toString() },
          ip: actor.ip,
        },
        tx
      )
      return { ok: true }
    })
  }

  /** Выдача товара по коду покупателя: только после полной оплаты и до конца срока получения. */
  async issue(id: string, code: string, actor: StaffActor) {
    const result = await this.prisma.$transaction(async (tx) => {
      const o = await this.lockActive(tx, id)
      if (!o.pickupCodeHash || !pickupCodeMatches(this.env.JWT_SECRET, o.id, o.pickupCodeHash, code)) {
        return { badCode: true as const, lotId: o.lotId }
      }
      const paid = await tx.order.findFirst({
        where: { lotId: o.lotId, userId: o.userId, purpose: 'REMAINDER', status: 'PAID' },
        select: { id: true },
      })
      if (!paid) throw conflict('REMAINDER_UNPAID', 'Остаток не оплачен — сначала примите оплату')
      const now = this.clock.now()
      await tx.obligation.update({ where: { id }, data: { status: 'COMPLETED', completedAt: now, issuedBy: actor.staffId } })
      const lot = await tx.lot.findUniqueOrThrow({ where: { id: o.lotId }, select: { productId: true } })
      if (lot.productId) await tx.product.update({ where: { id: lot.productId }, data: { status: 'SOLD' } })
      await this.audit.log(
        {
          actorType: 'staff',
          actorId: actor.staffId,
          action: 'obligation.issued',
          entityType: 'lot',
          entityId: o.lotId,
          meta: { obligationId: o.id, userId: o.userId },
          ip: actor.ip,
        },
        tx
      )
      await tx.outboxEvent.create({
        data: { type: 'obligation.completed', aggregateId: o.lotId, payload: { obligationId: o.id, userId: o.userId } },
      })
      return { badCode: false as const, lotId: o.lotId }
    })
    if (result.badCode) {
      // неверный код пишем в журнал отдельно от транзакции — попытка должна остаться в журнале
      await this.audit.log({
        actorType: 'staff',
        actorId: actor.staffId,
        action: 'obligation.issue_bad_code',
        entityType: 'lot',
        entityId: result.lotId,
        meta: { obligationId: id },
        ip: actor.ip,
      })
      throw conflict('BAD_CODE', 'Код не подходит — проверьте код у покупателя')
    }
    return { ok: true }
  }

  /** Решение финансов по 10%, если товар не забран: вернуть покупателю или удержать — всегда с причиной. */
  async decidePrepayment(id: string, decision: 'REFUNDED' | 'RETAINED', reason: string, actor: StaffActor) {
    const refundIds = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Obligation" WHERE id = ${id}::uuid FOR UPDATE`
      const o = await tx.obligation.findUnique({ where: { id } })
      if (!o) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Выкуп не найден' })
      if (o.prepaymentDecision !== 'PENDING') throw conflict('NO_DECISION_NEEDED', 'Решение уже принято или не требуется')
      await tx.obligation.update({
        where: { id },
        data: { prepaymentDecision: decision, decisionReason: reason, decidedBy: actor.staffId },
      })
      const ids: string[] = []
      if (decision === 'REFUNDED') {
        const orders = await tx.order.findMany({
          where: { lotId: o.lotId, userId: o.userId, purpose: 'PREPAYMENT', status: 'PAID' },
          select: { id: true },
        })
        await tx.order.updateMany({ where: { id: { in: orders.map((x) => x.id) } }, data: { status: 'REFUND_PENDING' } })
        ids.push(...orders.map((x) => x.id))
      }
      await this.audit.log(
        {
          actorType: 'staff',
          actorId: actor.staffId,
          action: decision === 'REFUNDED' ? 'obligation.prepayment_refunded' : 'obligation.prepayment_retained',
          entityType: 'lot',
          entityId: o.lotId,
          reason,
          meta: { obligationId: o.id, userId: o.userId },
          ip: actor.ip,
        },
        tx
      )
      return ids
    })
    if (refundIds.length) await this.refunds.settle(refundIds)
    return { ok: true }
  }

  private async lockActive(tx: Prisma.TransactionClient, id: string): Promise<Obligation> {
    await tx.$queryRaw`SELECT id FROM "Obligation" WHERE id = ${id}::uuid FOR UPDATE`
    const o = await tx.obligation.findUnique({ where: { id } })
    if (!o) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Выкуп не найден' })
    if (o.status !== 'AWAITING_PICKUP') throw conflict('NOT_AWAITING_PICKUP', 'Товар сейчас не ждёт выдачи')
    if (!o.remainderDeadline || this.clock.now() >= o.remainderDeadline) {
      throw conflict('PICKUP_EXPIRED', 'Срок получения истёк')
    }
    return o
  }

  private async paidRemainderLots(lotIds: string[], userId: string): Promise<Set<string>> {
    const rows = await this.prisma.order.findMany({
      where: { userId, lotId: { in: lotIds }, purpose: 'REMAINDER', status: 'PAID' },
      select: { lotId: true },
    })
    return new Set(rows.map((r) => r.lotId))
  }

  private buyerDto(o: Obligation, lotTitle: string, remainderPaid: boolean) {
    return {
      id: o.id,
      lotId: o.lotId,
      lotTitle,
      status: o.status,
      amount: o.amount.toString(),
      prepaymentAmount: o.prepaymentAmount.toString(),
      remainderAmount: (o.amount - o.prepaymentAmount).toString(),
      prepaymentDeadline: o.prepaymentDeadline?.toISOString() ?? null,
      remainderDeadline: o.remainderDeadline?.toISOString() ?? null,
      remainderPaid,
      // код показываем только покупателю и только пока товар ждёт выдачи
      pickupCode: o.status === 'AWAITING_PICKUP' ? pickupCode(this.env.JWT_SECRET, o.id) : null,
      expiredReason: o.expiredReason,
      completedAt: o.completedAt?.toISOString() ?? null,
    }
  }
}
