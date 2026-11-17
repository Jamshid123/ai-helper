/**
 * Платёжные системы (решение 17.11.2026: Click + Payme, покупатель выбирает). Успех оплаты подтверждается ТОЛЬКО
 * проверенным запросом платёжной системы (подпись / ключ) или запросом статуса (ТЗ).
 */
export type CheckoutSession = { provider: string; checkoutUrl: string | null }

export type CheckoutOrder = {
  id: string
  /** В сумах. */
  amount: bigint
  description: string
  /** Куда вернуть покупателя после оплаты (путь на сайте, например /lot/<id>). */
  returnPath: string
  locale: 'ru' | 'uz'
}

export type RefundOrder = { id: string; amount: bigint; provider: string; providerTxId: string | null }

export interface PaymentProvider {
  readonly name: string
  createCheckout(order: CheckoutOrder): Promise<CheckoutSession>
  /** Возврат оплаченного заказа. 'REFUNDED' — проведён сразу; 'PENDING' — вручную / ждём подтверждения. */
  refund(order: RefundOrder): Promise<'REFUNDED' | 'PENDING'>
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY')

export class PaymentsDisabledError extends Error {
  constructor() {
    super('PAYMENTS_DISABLED')
  }
}

export class UnknownProviderError extends Error {
  constructor() {
    super('UNKNOWN_PROVIDER')
  }
}

/** PAYMENTS_MODE=fake: имитация для демо и тестов (в production запрещена конфигом). */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake'
  async createCheckout(): Promise<CheckoutSession> {
    return { provider: this.name, checkoutUrl: null }
  }
  async refund(): Promise<'REFUNDED'> {
    return 'REFUNDED'
  }
}

/**
 * Набор доступных покупателю платёжных систем. Пустой (PAYMENTS_MODE=disabled) — оплата выключена.
 * Возврат идёт через ту систему, которой оплачен заказ; неизвестная — вручную (заказ остаётся REFUND_PENDING).
 */
export class PaymentGateway {
  constructor(private readonly providers: PaymentProvider[]) {}

  available(): string[] {
    return this.providers.map((p) => p.name)
  }

  /** Выбранная покупателем система; без выбора — первая доступная (старые клиенты). */
  pick(name?: string): PaymentProvider {
    if (!this.providers.length) throw new PaymentsDisabledError()
    if (!name) return this.providers[0]
    const p = this.providers.find((x) => x.name === name)
    if (!p) throw new UnknownProviderError()
    return p
  }

  async refund(order: RefundOrder): Promise<'REFUNDED' | 'PENDING'> {
    const p = this.providers.find((x) => x.name === order.provider)
    return p ? p.refund(order) : 'PENDING'
  }
}
