import type { CheckoutOrder, CheckoutSession, PaymentProvider } from '../payment-provider'

export const PAYME_CHECKOUT_URL = 'https://checkout.paycom.uz'
export const PAYME_TEST_CHECKOUT_URL = 'https://test.paycom.uz'

/**
 * Payme (решение 17.11.2026): оплата — чек методом GET (checkout.paycom.uz/base64(m=…;ac.order_id=…;a=…)),
 * подтверждение — Merchant API (запросы Payme к нам, см. PaymeService).
 * Возврат через API в Merchant API не предусмотрен: финансы возвращают в кабинете Payme, Payme присылает
 * CancelTransaction и заказ закрывается сам. Поэтому refund() всегда 'PENDING'.
 */
export class PaymeProvider implements PaymentProvider {
  readonly name = 'payme'

  constructor(private readonly cfg: { merchantId: string; testMode: boolean; siteUrl: string }) {}

  async createCheckout(order: CheckoutOrder): Promise<CheckoutSession> {
    const back = new URL(order.returnPath, this.cfg.siteUrl).toString()
    // «;» разделяет параметры чека — в адресе возврата его быть не должно
    const params = [
      `m=${this.cfg.merchantId}`,
      `ac.order_id=${order.id}`,
      `a=${order.amount * 100n}`,
      `l=${order.locale}`,
      `c=${back.replaceAll(';', '')}`,
    ].join(';')
    const base = this.cfg.testMode ? PAYME_TEST_CHECKOUT_URL : PAYME_CHECKOUT_URL
    return { provider: this.name, checkoutUrl: `${base}/${Buffer.from(params).toString('base64')}` }
  }

  async refund(): Promise<'PENDING'> {
    return 'PENDING'
  }
}
