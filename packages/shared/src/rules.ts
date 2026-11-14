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
  /** Предложение не выше предыдущей принятой цены (первое — старта) больше чем на N% (решение 14.11.2026). */
  MAX_RAISE_PERCENT: 50n,
  /** Участник предлагал цену, его перебили и он молчит N минут — одно напоминание на лот (решение 14.11.2026). */
  IDLE_NUDGE_MIN: 30,
} as const

/**
 * Минимальная допустимая ставка: первая — не ниже старта, далее — текущая + шаг.
 * Пример из ТЗ: старт 2 000 000, шаг 100 000, после ставки 2 000 000 минимум 2 100 000.
 */
export function minNextBid(start: bigint, step: bigint, current: bigint | null): bigint {
  return current === null ? start : current + step
}

/**
 * Максимальная допустимая цена: предыдущая принятая (или старт) + 50%, округление вниз.
 * Не ниже минимальной — чтобы крупный шаг не делал предложение невозможным.
 * Пример партнёра: после 1 000 000 — не больше 1 500 000.
 */
export function maxNextBid(start: bigint, step: bigint, current: bigint | null): bigint {
  const base = current ?? start
  const cap = base + (base * RULES.MAX_RAISE_PERCENT) / 100n
  const min = minNextBid(start, step, current)
  return cap > min ? cap : min
}

/** 30% предоплаты, округление вверх до целого сума. */
export function prepaymentAmount(winningBid: bigint): bigint {
  const p = RULES.PREPAYMENT_PERCENT
  return (winningBid * p + 99n) / 100n
}

/**
 * Фактическое окончание торгов (решение заказчика 14.11.2026): назначенное время закрытия
 * или раньше — если после последнего предложения прошло «ожидание следующего предложения».
 */
export function effectiveEnd(closesAt: Date, lastBidAt: Date | null, bidTimeoutSec: number | null): Date {
  if (!lastBidAt || !bidTimeoutSec) return closesAt
  const idle = new Date(lastBidAt.getTime() + bidTimeoutSec * 1000)
  return idle < closesAt ? idle : closesAt
}
