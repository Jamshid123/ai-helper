import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
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
  constructor(private readonly prisma: PrismaService) {}

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
