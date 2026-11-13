/**
 * Расписание торгов для отображения в админке: пятница 09:00–18:00 по Ташкенту.
 * Источник истины — сервер; здесь только подсказка на экране «Обзор».
 */
export const SESSION_TZ = 'Asia/Tashkent'
const OPEN_HOUR = 9
const CLOSE_HOUR = 18
const FRIDAY = 5

/** Смещение зоны относительно UTC в минутах на момент `at`. */
function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - at.getTime()) / 60_000)
}

export type SessionWindow = { opensAt: Date; closesAt: Date; isLive: boolean }

/** Текущая (если идёт) или ближайшая пятничная сессия. */
export function currentOrNextSession(now: Date, timeZone = SESSION_TZ): SessionWindow {
  const offset = tzOffsetMinutes(now, timeZone)
  const local = new Date(now.getTime() + offset * 60_000) // «настенное» время в полях UTC
  for (let add = 0; add <= 7; add++) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add))
    if (d.getUTCDay() !== FRIDAY) continue
    const opensAt = new Date(d.getTime() + OPEN_HOUR * 3_600_000 - offset * 60_000)
    const closesAt = new Date(d.getTime() + CLOSE_HOUR * 3_600_000 - offset * 60_000)
    if (now < closesAt) return { opensAt, closesAt, isLive: now >= opensAt }
  }
  throw new Error('unreachable: a Friday always occurs within 8 days')
}
