import { formatSum } from '@auksion/shared'

/** Узбекистан — UTC+5 круглый год (без перехода на летнее время). */
export const TASHKENT_OFFSET = '+05:00'

export const sum = (v: string | null | undefined) =>
  v ? formatSum(v, 'ru') : '—'

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Значение <input type=datetime-local> как время Ташкента. */
export const tashkentLocal = (v: string) => `${v}:00${TASHKENT_OFFSET}`

/** ISO → значение для <input type=datetime-local> по Ташкенту. */
export function toTashkentLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5 * 3_600_000)
  return d.toISOString().slice(0, 16)
}

/** Только цифры из ввода суммы. */
export const digits = (v: string) => v.replace(/\D/g, '')

export const conditionText = (c: 'NEW' | 'USED') =>
  c === 'NEW' ? 'Новый' : 'Б/у'

/** «20 нояб., 09:00 — 18:00» или «14 нояб., 09:16 — 20 нояб., 18:00», если дни разные (по Ташкенту). */
export function windowText(opensAt: string, closesAt: string): string {
  const day = (iso: string) =>
    new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Tashkent',
      dateStyle: 'short',
    }).format(new Date(iso))
  const time = (iso: string) =>
    new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  return day(opensAt) === day(closesAt)
    ? `${dateTime(opensAt)} — ${time(closesAt)}`
    : `${dateTime(opensAt)} — ${dateTime(closesAt)}`
}
