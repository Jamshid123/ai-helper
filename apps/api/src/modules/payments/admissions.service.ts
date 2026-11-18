import { Injectable } from '@nestjs/common'
import { RULES } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'
import { DEVICE } from '../auth/buyer-session.service'
import { AdmissionError } from './admission.errors'
import { RefundsService } from './refunds.service'

/** Версия правил торгов, которую принимает покупатель (меняется вместе с публичной офертой). */
export const RULES_VERSION = '2026-11-18'

export { AdmissionError } from './admission.errors'

/** Неоплаченный заказ другого аккаунта считается участием столько времени (две оплаты одновременно). */
const PENDING_CLASH_MS = 30 * 60_000

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly refunds: RefundsService
  ) {}

  /** Выход из лота до начала торгов с возвратом 100% (решение 14.11.2026); после выхода можно вернуться. */
  /**
   * Мои допуски («Мои лоты», решение 18.11.2026): состояние торгов, итог и судьба взноса считает сервер.
   * Возвращённые взносы показываем, хотя допуска уже нет (при возврате допуск удаляется).
   * Только свои данные: ни победителя, ни других участников.
   */
  async mine(userId: string) {
    const lotSelect = { title: true, status: true, opensAt: true, closesAt: true, admittedCount: true } as const
    const [admissions, refunds, won] = await Promise.all([
      this.prisma.admission.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          lotId: true,
          createdAt: true,
          orderId: true,
          carriedFromLotId: true,
          confirmedAt: true,
          lot: { select: lotSelect },
        },
      }),
      this.prisma.order.findMany({
        where: { userId, purpose: 'ADMISSION', status: { in: ['REFUND_PENDING', 'REFUNDED'] } },
        orderBy: { createdAt: 'desc' },
        select: { lotId: true, status: true, createdAt: true, lot: { select: lotSelect } },
      }),
      this.prisma.obligation.findMany({ where: { userId }, select: { lotId: true } }),
    ])
    const wonLots = new Set(won.map((o) => o.lotId))
    const orderStatus = new Map(
      (
        await this.prisma.order.findMany({
          where: { id: { in: admissions.map((a) => a.orderId).filter((id): id is string => id !== null) } },
          select: { id: true, status: true },
        })
      ).map((o) => [o.id, o.status])
    )
    const outcome = (lotId: string, status: string) =>
      wonLots.has(lotId) ? 'WON' : ['CLOSED_SOLD', 'CLOSED_UNSOLD'].includes(status) ? 'NOT_WON' : null
    type Lot = { title: string; status: string; opensAt: Date; closesAt: Date; admittedCount: number }
    const base = (lotId: string, lot: Lot) => ({
      lotId,
      title: lot.title,
      status: lot.status,
      opensAt: lot.opensAt.toISOString(),
      closesAt: lot.closesAt.toISOString(),
    })
    const admitted = admissions.map((a) => ({
      ...base(a.lotId, a.lot),
      admitted: true,
      admittedAt: a.createdAt.toISOString(),
      // число участников лота видно только допущенным (решение 14.11.2026)
      admittedCount: a.lot.admittedCount,
      outcome: outcome(a.lotId, a.lot.status),
      // допуск бесплатный с 18.11.2026; статус взноса — только у старых оплаченных допусков
      feeStatus: a.carriedFromLotId !== null ? 'CARRIED' : a.orderId ? (orderStatus.get(a.orderId) ?? 'PAID') : null,
      // повторные торги: допуск перенесён без нового взноса; нужно подтвердить участие
      carried: a.carriedFromLotId !== null,
      confirmed: a.carriedFromLotId === null || a.confirmedAt !== null,
    }))
    const have = new Set(admitted.map((a) => a.lotId))
    const refunded = refunds
      .filter((r) => !have.has(r.lotId))
      .map((r) => ({
        ...base(r.lotId, r.lot),
        admitted: false,
        admittedAt: r.createdAt.toISOString(),
        outcome: null,
        feeStatus: r.status,
        carried: false,
        confirmed: true,
      }))
    return [...admitted, ...refunded]
  }

  async leave(userId: string, lotId: string): Promise<{ refunded: boolean }> {
    return this.refunds.revokeOneBeforeStart(lotId, userId, {
      actorType: 'buyer',
      actorId: userId,
      action: 'admission.left',
    })
  }

  /**
   * Два аккаунта с одного устройства не участвуют в одном лоте (решение 15.11.2026):
   * если с этого устройства за 30 дней входил другой покупатель, у которого в этом лоте есть допуск
   * или только что начатая оплата, — отказ до оплаты; попытка пишется в журнал для проверки.
   */
  private async assertDeviceFree(userId: string, lotId: string, deviceHash: string, now: Date) {
    const since = new Date(now.getTime() - DEVICE.WINDOW_DAYS * 86_400_000)
    const others = await this.prisma.buyerSession.findMany({
      where: { deviceHash, userId: { not: userId }, createdAt: { gte: since } },
      select: { userId: true },
      distinct: ['userId'],
    })
    if (others.length === 0) return
    const ids = others.map((o) => o.userId)
    const clash =
      (await this.prisma.admission.findFirst({ where: { lotId, userId: { in: ids } }, select: { userId: true } })) ??
      (await this.prisma.order.findFirst({
        where: {
          lotId,
          userId: { in: ids },
          purpose: 'ADMISSION',
          status: 'PENDING',
          createdAt: { gte: new Date(now.getTime() - PENDING_CLASH_MS) },
        },
        select: { userId: true },
      }))
    if (!clash) return
    await this.prisma.auditLog.create({
      data: {
        actorType: 'buyer',
        actorId: userId,
        action: 'admission.device_shared',
        entityType: 'lot',
        entityId: lotId,
        reason: 'Допуск отклонён: с этого устройства в лоте уже участвует другой аккаунт',
        meta: { otherUserId: clash.userId },
      },
    })
    throw new AdmissionError('DEVICE_SHARED')
  }

  /**
   * Допуск к лоту — бесплатный (решение 18.11.2026: уходим от взноса). Условия приняты → допуск сразу, без оплаты.
   * Место и лимит проверяются под блокировкой лота и покупателя: одновременные заявки не переполнят лот.
   */
  async start(userId: string, lotId: string, acceptRules: boolean, deviceHash: string | null = null) {
    if (!acceptRules) throw new AdmissionError('RULES_NOT_ACCEPTED')
    const now = this.clock.now()
    const lot = await this.prisma.lot.findUnique({ where: { id: lotId } })
    if (!lot || !['SCHEDULED', 'LIVE'].includes(lot.status)) throw new AdmissionError('LOT_NOT_FOUND')
    if (now >= lot.closesAt) throw new AdmissionError('LOT_CLOSED')
    // ограниченный участник не может торговаться (ТЗ «Неоплата и возвраты»)
    const restricted = await this.prisma.restriction.findFirst({
      where: { userId, liftedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true },
    })
    if (restricted) throw new AdmissionError('RESTRICTED')
    // Сорвавший выкуп не участвует в торгах того же товара (решение 16.11.2026).
    if (lot.productId) {
      const defaulted = await this.prisma.obligation.findFirst({
        where: { userId, status: 'EXPIRED', lot: { productId: lot.productId } },
        select: { id: true },
      })
      if (defaulted) throw new AdmissionError('PRODUCT_BLOCKED')
    }
    const already = await this.prisma.admission.findUnique({ where: { lotId_userId: { lotId, userId } } })
    if (already) return { status: 'ADMITTED' as const }
    if (deviceHash) await this.assertDeviceFree(userId, lotId, deviceHash, now)

    await this.prisma.$transaction(async (tx) => {
      // покупатель — по одной заявке за раз (лимит), лот — точный счётчик мест
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`
      const [locked] = await tx.$queryRaw<{ admitted: number; max: number | null; status: string; closes_at: Date }[]>`
        SELECT "admittedCount" AS admitted, "maxParticipants" AS max, status::text AS status, "closesAt" AS closes_at
        FROM "Lot" WHERE id = ${lotId}::uuid FOR UPDATE`
      if (!locked || !['SCHEDULED', 'LIVE'].includes(locked.status)) throw new AdmissionError('LOT_NOT_FOUND')
      if (now >= locked.closes_at) throw new AdmissionError('LOT_CLOSED')
      if (await tx.admission.findUnique({ where: { lotId_userId: { lotId, userId } }, select: { id: true } })) return
      // мест нет (решение заказчика 14.11.2026: максимум участников)
      if (locked.max !== null && locked.admitted >= locked.max) throw new AdmissionError('LOT_FULL')
      const active = await tx.admission.count({
        where: { userId, lot: { status: { in: ['SCHEDULED', 'LIVE'] }, closesAt: { gt: now } } },
      })
      if (active >= RULES.MAX_ACTIVE_ADMISSIONS) throw new AdmissionError('ADMISSION_LIMIT')
      await tx.user.update({ where: { id: userId }, data: { rulesVersion: RULES_VERSION, rulesAcceptedAt: now } })
      await tx.admission.create({ data: { lotId, userId } })
      await tx.lot.update({ where: { id: lotId }, data: { admittedCount: { increment: 1 } } })
      await tx.outboxEvent.create({ data: { type: 'admission.granted', aggregateId: lotId, payload: { lotId, userId } } })
    })
    return { status: 'ADMITTED' as const }
  }
}
