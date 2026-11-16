/**
 * Правила торгов из ТЗ (docs/spec/tz.md). Один источник для API, Mini App, админки и mobile.
 * Значения, которые заказчик ещё может поменять, — здесь, а не в коде экранов.
 */
export const RULES = {
  /** Нижняя граница шага ставки, сум. */
  MIN_STEP_SUM: 100_000n,
  /** Предоплата победителя, % от его цены (решение 14.11.2026: 10% сразу после торгов). */
  PREPAYMENT_PERCENT: 10n,
  /** Срок оплаты 10% после закрытия торгов, мин. Не оплатил — победа аннулируется, повторные торги. */
  PREPAYMENT_WINDOW_MIN: 15,
  /** Срок оплаты остатка 90% (онлайн или на месте) и получения товара после оплаты 10%, ч (решение 16.11.2026). */
  REMAINDER_WINDOW_H: 24,
  /** Не оплатил 10% вовремя — участие в торгах ограничено на N дней (решение 14.11.2026, п. 20). */
  NO_BUYOUT_BAN_DAYS: 7,
  /** Повторные торги публикуются не позже чем за N ч до начала — участники успевают узнать (решение 16.11.2026). */
  RELIST_MIN_NOTICE_H: 24,
  /** Напоминание перенесённому участнику подтвердить участие — за N ч до начала. */
  RELIST_REMIND_BEFORE_H: 6,
  /** Неподтверждённые перенесённые места освобождаются за N ч до начала — для новых покупателей. */
  RELIST_CONFIRM_BEFORE_H: 2,
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

/** Предоплата победителя (10%), округление вверх до целого сума. */
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
