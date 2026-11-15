import { Inject, Injectable } from '@nestjs/common'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'
import { DEVICE } from '../auth/buyer-session.service'
import { AdmissionError } from './admission.errors'
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider'
import { RefundsService } from './refunds.service'

/** Версия правил торгов, которую принимает покупатель (меняется вместе с публичной офертой). */
export const RULES_VERSION = '2026-11-13'

export { AdmissionError } from './admission.errors'

/** Неоплаченный заказ другого аккаунта считается участием столько времени (две оплаты одновременно). */
const PENDING_CLASH_MS = 30 * 60_000

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly refunds: RefundsService
  ) {}

  /** Выход из лота до начала торгов с возвратом 100% (решение 14.11.2026); после выхода можно вернуться. */
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
   * Начать оформление допуска: условия приняты → заказ ADMISSION на сумму взноса (считает сервер) → оплата у провайдера.
   * Уже есть допуск — возвращаем его; есть неоплаченный заказ — переиспользуем.
   */
  async start(userId: string, lotId: string, acceptRules: boolean, deviceHash: string | null = null) {
    if (!acceptRules) throw new AdmissionError('RULES_NOT_ACCEPTED')
    const now = this.clock.now()
    const lot = await this.prisma.lot.findUnique({ where: { id: lotId } })
    if (!lot || !['SCHEDULED', 'LIVE'].includes(lot.status)) throw new AdmissionError('LOT_NOT_FOUND')
    if (now >= lot.closesAt) throw new AdmissionError('LOT_CLOSED')
    // ограниченный участник не может торговаться — деньги за допуск не берём (ТЗ «Неоплата и возвраты»)
    const restricted = await this.prisma.restriction.findFirst({
      where: { userId, liftedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true },
    })
    if (restricted) throw new AdmissionError('RESTRICTED')

    const admission = await this.prisma.admission.findUnique({ where: { lotId_userId: { lotId, userId } } })
    if (admission) return { status: 'ADMITTED' as const, orderId: admission.orderId, checkoutUrl: null }
    // мест нет — заказ не создаём (решение заказчика 14.11.2026: максимум участников)
    if (lot.maxParticipants !== null && lot.admittedCount >= lot.maxParticipants) throw new AdmissionError('LOT_FULL')
    if (deviceHash) await this.assertDeviceFree(userId, lotId, deviceHash, now)

    await this.prisma.user.update({
      where: { id: userId },
      data: { rulesVersion: RULES_VERSION, rulesAcceptedAt: now },
    })
    const order =
      (await this.prisma.order.findFirst({ where: { userId, lotId, purpose: 'ADMISSION', status: 'PENDING' } })) ??
      (await this.prisma.order.create({
        data: { userId, lotId, purpose: 'ADMISSION', amount: lot.fee, provider: this.provider.name },
      }))
    const checkout = await this.provider.createCheckout({
      id: order.id,
      amount: order.amount,
      description: `Допуск к лоту: ${lot.title}`,
    })
    return {
      status: 'PAYMENT_REQUIRED' as const,
      orderId: order.id,
      amount: order.amount.toString(),
      checkoutUrl: checkout.checkoutUrl,
      provider: checkout.provider,
    }
  }
}
