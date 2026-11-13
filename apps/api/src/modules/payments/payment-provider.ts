/**
 * Платёжный провайдер. Партнёр (Click / Payme / Uzum) ещё не выбран — реальный адаптер реализует этот интерфейс.
 * Успех оплаты подтверждается ТОЛЬКО проверенным событием партнёра или запросом статуса (ТЗ).
 */
export type CheckoutSession = { provider: string; checkoutUrl: string | null }

export interface PaymentProvider {
  readonly name: string
  createCheckout(order: { id: string; amount: bigint; description: string }): Promise<CheckoutSession>
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER')

export class PaymentsDisabledError extends Error {
  constructor() {
    super('PAYMENTS_DISABLED')
  }
}

/** PAYMENTS_MODE=disabled: оплата выключена до подключения партнёра. */
export class DisabledPaymentProvider implements PaymentProvider {
  readonly name = 'disabled'
  async createCheckout(): Promise<CheckoutSession> {
    throw new PaymentsDisabledError()
  }
}

/** PAYMENTS_MODE=fake: имитация для демо и тестов (в production запрещена конфигом). */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake'
  async createCheckout(): Promise<CheckoutSession> {
    return { provider: this.name, checkoutUrl: null }
  }
}
