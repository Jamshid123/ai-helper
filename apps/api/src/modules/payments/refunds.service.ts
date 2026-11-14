import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { Clock } from '../../common/clock'
import { AuditService, type AuditEntry } from '../staff/audit.service'
import { AdmissionError } from './admission.errors'
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
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly audit: AuditService,
    private readonly clock: Clock
  ) {}

  /**
   * Снять один допуск до открытия торгов (выход участника или решение сотрудника) и вернуть деньги.
   * Лот блокируется FOR UPDATE — гонка с открытием в 09:00 исключена.
   */
  async revokeOneBeforeStart(
    lotId: string,
    userId: string,
    audit: Pick<AuditEntry, 'actorType' | 'actorId' | 'action' | 'reason' | 'ip'>
  ): Promise<{ refunded: boolean }> {
    const orderIds = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Lot" WHERE id = ${lotId}::uuid FOR UPDATE`
      const lot = await tx.lot.findUnique({ where: { id: lotId }, select: { status: true, opensAt: true } })
      const admission = await tx.admission.findUnique({ where: { lotId_userId: { lotId, userId } } })
      if (!lot || !admission) throw new AdmissionError('NOT_ADMITTED')
      if (!['DRAFT', 'SCHEDULED'].includes(lot.status) || lot.opensAt <= this.clock.now()) {
        throw new AdmissionError('LOT_STARTED')
      }
      const ids = await this.revokeAdmissionsInTx(tx, lotId, [userId])
      await this.audit.log({ ...audit, entityType: 'admission', entityId: admission.id, meta: { lotId, userId } }, tx)
      return ids
    })
    return { refunded: (await this.settle(orderIds)) === orderIds.length }
  }

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
