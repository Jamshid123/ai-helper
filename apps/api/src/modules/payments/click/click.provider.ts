import { Logger } from '@nestjs/common'
import type { PrismaService } from '../../../prisma/prisma.service'
import type { CheckoutOrder, CheckoutSession, PaymentProvider, RefundOrder } from '../payment-provider'
import { clickAuthHeader } from './click-sign'

export type ClickConfig = {
  serviceId: number
  merchantId: number
  merchantUserId: number
  secretKey: string
  siteUrl: string
}

export const CLICK_PAY_URL = 'https://my.click.uz/services/pay/'
export const CLICK_API_URL = 'https://api.click.uz/v2/merchant'

type Fetch = typeof fetch

/**
 * Click (решение 17.11.2026): оплата — переход на страницу Click (кнопка «с переходом»),
 * подтверждение — запросы Click к нам (SHOP API Prepare/Complete, см. ClickService),
 * возврат — Merchant API payment/reversal. Ограничения Click: только полный возврат, только платежи текущего
 * месяца и только по карте онлайн — иначе возврат остаётся финансам (заказ REFUND_PENDING).
 */
export class ClickProvider implements PaymentProvider {
  readonly name = 'click'
  private readonly log = new Logger('ClickProvider')

  constructor(
    private readonly cfg: ClickConfig,
    private readonly prisma: PrismaService,
    private readonly http: Fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  async createCheckout(order: CheckoutOrder): Promise<CheckoutSession> {
    const q = new URLSearchParams({
      service_id: String(this.cfg.serviceId),
      merchant_id: String(this.cfg.merchantId),
      amount: `${order.amount}.00`,
      transaction_param: order.id,
      return_url: new URL(order.returnPath, this.cfg.siteUrl).toString(),
    })
    return { provider: this.name, checkoutUrl: `${CLICK_PAY_URL}?${q}` }
  }

  async refund(order: RefundOrder): Promise<'REFUNDED' | 'PENDING'> {
    const externalId = order.providerTxId?.startsWith('click:') ? order.providerTxId.slice(6) : null
    const tx = externalId
      ? await this.prisma.paymentTransaction.findUnique({
          where: { provider_externalId: { provider: 'click', externalId } },
        })
      : null
    if (!tx) return 'PENDING'
    return (await this.reverse(tx.id, order.id)) ? 'REFUNDED' : 'PENDING'
  }

  /** Отменить проведённую транзакцию Click (возврат денег). true — Click подтвердил. */
  async reverse(txId: number, label: string): Promise<boolean> {
    const tx = await this.prisma.paymentTransaction.findUnique({ where: { id: txId } })
    if (!tx || tx.provider !== 'click' || tx.state !== 2 || !tx.paymentRef) return false
    const res = await this.http(`${CLICK_API_URL}/payment/reversal/${this.cfg.serviceId}/${tx.paymentRef}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Auth: clickAuthHeader(this.cfg.merchantUserId, this.cfg.secretKey, this.now()),
      },
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await res.json().catch(() => null)) as { error_code?: number; error_note?: string } | null
    if (!res.ok || body?.error_code !== 0) {
      // типичные причины: платёж прошлого месяца, оплата не картой, отказ UZCARD — возвращают финансы вручную
      this.log.warn(`Click reversal отклонён (${label}): ${res.status} ${body?.error_note ?? ''}`)
      return false
    }
    await this.prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: { state: -2, reason: 5, cancelledAt: new Date(this.now()), needsRefund: false },
    })
    return true
  }
}
