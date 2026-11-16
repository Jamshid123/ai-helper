import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { RULES } from '@auksion/shared'
import { pickupCode, pickupCodeHash } from '../../common/pickup-code'
import { ENV } from '../../config/config.module'
import type { Env } from '../../config/env'
import { PrismaService } from '../../prisma/prisma.service'

export type PaymentConfirmation = {
  orderId: string
  providerTxId: string
  amount: bigint
  /** Подтверждённое партнёром время операции. */
  paidAt: Date
}

export type ConfirmOutcome =
  | 'ADMITTED'
  | 'PREPAYMENT_PAID'
  | 'REMAINDER_PAID'
  | 'REFUND_EXPIRED'
  | 'ALREADY_PROCESSED'
  | 'REFUND_LATE'
  | 'REFUND_DUPLICATE'
  | 'REFUND_FULL'
  | 'AMOUNT_MISMATCH'

type LockedOrder = { id: string; status: string; amount: bigint; purpose: string; user_id: string; lot_id: string }

/**
 * Подтверждение оплаты допуска (ТЗ «Подтверждение оплаты»): сверка суммы и идентификатора,
 * повторные события не создают второй допуск или возврат, поздняя оплата после закрытия → возврат.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env
  ) {}

  /** Единая точка подтверждения оплаты (событие партнёра / запрос статуса): допуск, 10% или остаток. */
  async confirmPayment(c: PaymentConfirmation): Promise<ConfirmOutcome> {
    const order = await this.prisma.order.findUnique({ where: { id: c.orderId }, select: { purpose: true } })
    if (!order) throw new Error('ORDER_NOT_FOUND')
    return order.purpose === 'ADMISSION' ? this.confirmAdmissionPayment(c) : this.confirmBuyoutPayment(c)
  }

  /**
   * Оплата выкупа (решения 14.11 и 16.11.2026): 10% за 15 минут после торгов → код выдачи и 24 часа на остаток
   * и получение; остаток — онлайн (здесь) или на месте (отмечает сотрудник). Оплата после аннулирования — на возврат.
   */
  async confirmBuyoutPayment(c: PaymentConfirmation): Promise<ConfirmOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<LockedOrder[]>`
        SELECT id, status::text AS status, amount, purpose::text AS purpose, "userId" AS user_id, "lotId" AS lot_id
        FROM "Order" WHERE id = ${c.orderId}::uuid FOR UPDATE`
      if (!order || !['PREPAYMENT', 'REMAINDER'].includes(order.purpose)) throw new Error('ORDER_NOT_FOUND')
      if (order.status !== 'PENDING' && order.status !== 'CANCELLED') return 'ALREADY_PROCESSED'
      if (order.amount !== c.amount) {
        await this.audit(tx, order.id, 'payment.amount_mismatch', {
          expected: order.amount.toString(),
          got: c.amount.toString(),
        })
        return 'AMOUNT_MISMATCH'
      }
      const [o] = await tx.$queryRaw<
        { id: string; status: string; prepayment_deadline: Date | null; remainder_deadline: Date | null }[]
      >`
        SELECT id, status::text AS status, "prepaymentDeadline" AS prepayment_deadline, "remainderDeadline" AS remainder_deadline
        FROM "Obligation" WHERE "lotId" = ${order.lot_id}::uuid AND "userId" = ${order.user_id}::uuid
        ORDER BY rank LIMIT 1 FOR UPDATE`
      const paid = { status: 'PAID' as const, providerTxId: c.providerTxId, paidAt: c.paidAt }
      const refund = async () => {
        await tx.order.update({ where: { id: order.id }, data: { ...paid, status: 'REFUND_PENDING' } })
        await this.audit(tx, order.id, 'payment.refund_expired', {})
        return 'REFUND_EXPIRED' as const
      }

      if (order.purpose === 'PREPAYMENT') {
        if (!o || o.status !== 'AWAITING_PREPAYMENT' || !o.prepayment_deadline || c.paidAt >= o.prepayment_deadline) {
          return refund()
        }
        await tx.order.update({ where: { id: order.id }, data: paid })
        const code = pickupCode(this.env.JWT_SECRET, o.id)
        const remainderDeadline = new Date(c.paidAt.getTime() + RULES.REMAINDER_WINDOW_H * 3_600_000)
        await tx.obligation.update({
          where: { id: o.id },
          data: {
            status: 'AWAITING_PICKUP',
            remainderDeadline,
            pickupCodeHash: pickupCodeHash(this.env.JWT_SECRET, o.id, code),
          },
        })
        await tx.outboxEvent.create({
          data: {
            type: 'obligation.prepaid',
            aggregateId: order.lot_id,
            payload: { obligationId: o.id, userId: order.user_id, remainderDeadline: remainderDeadline.toISOString() },
          },
        })
        return 'PREPAYMENT_PAID'
      }

      // Остаток: только пока победа действует и срок получения не прошёл; второй оплаченный остаток — на возврат.
      if (!o || o.status !== 'AWAITING_PICKUP' || !o.remainder_deadline || c.paidAt >= o.remainder_deadline) {
        return refund()
      }
      const already = await tx.order.findFirst({
        where: { lotId: order.lot_id, userId: order.user_id, purpose: 'REMAINDER', status: 'PAID' },
        select: { id: true },
      })
      if (already) {
        await tx.order.update({ where: { id: order.id }, data: { ...paid, status: 'REFUND_PENDING' } })
        await this.audit(tx, order.id, 'payment.refund_duplicate', {})
        return 'REFUND_DUPLICATE'
      }
      await tx.order.update({ where: { id: order.id }, data: paid })
      await tx.outboxEvent.create({
        data: {
          type: 'obligation.remainder_paid',
          aggregateId: order.lot_id,
          payload: { obligationId: o.id, userId: order.user_id },
        },
      })
      return 'REMAINDER_PAID'
    })
  }

  async confirmAdmissionPayment(c: PaymentConfirmation): Promise<ConfirmOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<LockedOrder[]>`
        SELECT id, status::text AS status, amount, purpose::text AS purpose, "userId" AS user_id, "lotId" AS lot_id
        FROM "Order" WHERE id = ${c.orderId}::uuid FOR UPDATE`
      if (!order || order.purpose !== 'ADMISSION') throw new Error('ORDER_NOT_FOUND')
      if (order.status !== 'PENDING') return 'ALREADY_PROCESSED'
      if (order.amount !== c.amount) {
        await this.audit(tx, order.id, 'payment.amount_mismatch', {
          expected: order.amount.toString(),
          got: c.amount.toString(),
        })
        return 'AMOUNT_MISMATCH'
      }

      const [lot] = await tx.$queryRaw<{ closes_at: Date; status: string; admitted: number; max: number | null }[]>`
        SELECT "closesAt" AS closes_at, status::text AS status, "admittedCount" AS admitted, "maxParticipants" AS max
        FROM "Lot" WHERE id = ${order.lot_id}::uuid FOR UPDATE`
      const paid = { status: 'PAID' as const, providerTxId: c.providerTxId, paidAt: c.paidAt }

      // Поздняя оплата (по подтверждённому времени операции) → на возврат, допуск не выдаётся.
      if (!lot || c.paidAt >= lot.closes_at || !['SCHEDULED', 'LIVE'].includes(lot.status)) {
        await tx.order.update({ where: { id: order.id }, data: { ...paid, status: 'REFUND_PENDING' } })
        await this.audit(tx, order.id, 'payment.refund_late', {})
        return 'REFUND_LATE'
      }

      // Уже есть допуск (оплатил дважды разными заказами) → второй платёж на возврат.
      const existing = await tx.admission.findUnique({
        where: { lotId_userId: { lotId: order.lot_id, userId: order.user_id } },
        select: { id: true },
      })
      if (existing) {
        await tx.order.update({ where: { id: order.id }, data: { ...paid, status: 'REFUND_PENDING' } })
        await this.audit(tx, order.id, 'payment.refund_duplicate', {})
        return 'REFUND_DUPLICATE'
      }

      // Места кончились, пока шла оплата → на возврат (лот заблокирован, счётчик точный).
      if (lot.max !== null && lot.admitted >= lot.max) {
        await tx.order.update({ where: { id: order.id }, data: { ...paid, status: 'REFUND_PENDING' } })
        await this.audit(tx, order.id, 'payment.refund_full', {})
        return 'REFUND_FULL'
      }

      await tx.order.update({ where: { id: order.id }, data: paid })
      await tx.admission.create({ data: { lotId: order.lot_id, userId: order.user_id, orderId: order.id } })
      await tx.lot.update({ where: { id: order.lot_id }, data: { admittedCount: { increment: 1 } } })
      await tx.outboxEvent.create({
        data: {
          type: 'admission.granted',
          aggregateId: order.lot_id,
          payload: { lotId: order.lot_id, userId: order.user_id },
        },
      })
      return 'ADMITTED'
    })
  }

  private audit(tx: Prisma.TransactionClient, orderId: string, action: string, meta: Prisma.InputJsonObject) {
    return tx.auditLog.create({ data: { actorType: 'SYSTEM', action, entityType: 'Order', entityId: orderId, meta } })
  }
}
