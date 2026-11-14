import { Inject, Injectable } from '@nestjs/common'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'
import { AdmissionError } from './admission.errors'
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider'
import { RefundsService } from './refunds.service'

/** Версия правил торгов, которую принимает покупатель (меняется вместе с публичной офертой). */
export const RULES_VERSION = '2026-11-13'

export { AdmissionError } from './admission.errors'

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
   * Начать оформление допуска: условия приняты → заказ ADMISSION на сумму взноса (считает сервер) → оплата у провайдера.
   * Уже есть допуск — возвращаем его; есть неоплаченный заказ — переиспользуем.
   */
  async start(userId: string, lotId: string, acceptRules: boolean) {
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
