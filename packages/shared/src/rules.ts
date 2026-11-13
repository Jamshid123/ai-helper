/**
 * Правила торгов из ТЗ (docs/spec/tz.md). Один источник для API, Mini App, админки и mobile.
 * Значения, которые заказчик ещё может поменять, — здесь, а не в коде экранов.
 */
export const RULES = {
  /** Нижняя граница шага ставки, сум. */
  MIN_STEP_SUM: 100_000n,
  /** Предоплата победителя, % от его ставки. */
  PREPAYMENT_PERCENT: 30n,
  /** Срок, чтобы подтвердить покупку после закрытия торгов / приглашения, мин. До подтверждения продажа не заключена. */
  CONFIRM_WINDOW_MIN: 15,
  /** Срок оплаты 30% после подтверждения покупки, мин (решение заказчика 13.11: 2 часа). */
  PREPAYMENT_WINDOW_MIN: 120,
  /** Срок оплаты остатка и получения товара после предоплаты, ч. */
  REMAINDER_WINDOW_H: 24,
  /** Невыкуп без уважительной причины: 1-й раз — предупреждение, 2-й — 14 дней, далее — 50 дней (решение 13.11). */
  NO_BUYOUT_BAN_DAYS: [0, 14, 50] as const,
} as const

/**
 * Минимальная допустимая ставка: первая — не ниже старта, далее — текущая + шаг.
 * Пример из ТЗ: старт 2 000 000, шаг 100 000, после ставки 2 000 000 минимум 2 100 000.
 */
export function minNextBid(start: bigint, step: bigint, current: bigint | null): bigint {
  return current === null ? start : current + step
}

/** 30% предоплаты, округление вверх до целого сума. */
export function prepaymentAmount(winningBid: bigint): bigint {
  const p = RULES.PREPAYMENT_PERCENT
  return (winningBid * p + 99n) / 100n
}
