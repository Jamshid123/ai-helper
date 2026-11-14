import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider'

/**
 * Снятие допуска с возвратом 100% (решения 14.11.2026): выход участника до начала, отмена допуска сотрудником,
 * отмена лота. В транзакции (лот уже заблокирован вызывающим FOR UPDATE): допуск удаляется (можно оформить заново),
 * автопредложение выключается, счётчик уменьшается, заказ → REFUND_PENDING + событие. Деньги возвращает провайдер
 * ПОСЛЕ коммита (`settle`): внешний вызов внутри транзакции держал бы блокировку лота.
 */
@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider
  ) {}

  /** Возвращает id заказов, ушедших на возврат. */
  async revokeAdmissionsInTx(tx: Prisma.TransactionClient, lotId: string, userIds?: string[]): Promise<string[]> {
    const admissions = await tx.admission.findMany({
      where: { lotId, ...(userIds ? { userId: { in: userIds } } : {}) },
      select: { id: true, userId: true, orderId: true },
    })
    if (!admissions.length) return []
    const users = admissions.map((a) => a.userId)
    await tx.admission.deleteMany({ where: { id: { in: admissions.map((a) => a.id) } } })
    await tx.autoBid.updateMany({ where: { lotId, userId: { in: users } }, data: { active: false } })
    await tx.lot.update({ where: { id: lotId }, data: { admittedCount: { decrement: admissions.length } } })
    const orderIds = admissions.map((a) => a.orderId)
    await tx.order.updateMany({ where: { id: { in: orderIds }, status: 'PAID' }, data: { status: 'REFUND_PENDING' } })
    await tx.outboxEvent.createMany({
      data: admissions.map((a) => ({
        type: 'admission.revoked',
        aggregateId: lotId,
        payload: { lotId, userId: a.userId, orderId: a.orderId },
      })),
    })
    return orderIds
  }

  /** Провести возвраты у провайдера (после коммита). Возвращает число проведённых сразу. */
  async settle(orderIds: string[]): Promise<number> {
    let done = 0
    for (const id of orderIds) {
      const order = await this.prisma.order.findUnique({ where: { id } })
      if (!order || order.status !== 'REFUND_PENDING') continue
      const r = await this.provider.refund({ id: order.id, amount: order.amount, providerTxId: order.providerTxId })
      if (r === 'REFUNDED') {
        await this.prisma.order.updateMany({ where: { id, status: 'REFUND_PENDING' }, data: { status: 'REFUNDED' } })
        done++
      }
    }
    return done
  }
}
