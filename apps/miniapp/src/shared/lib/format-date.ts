import { SESSION_TZ, type Locale } from '@auksion/shared'

/**
 * «20 ноября, 09:00» / «20-noyabr, 09:00» по времени Ташкента.
 * Названия месяцев свои: Intl для uz-Latn на части устройств выдаёт «M11».
 */
const MONTHS: Record<Locale, string[]> = {
  ru: [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ],
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
}

export function formatSessionDate(date: Date, locale: Locale, timeZone = SESSION_TZ): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const month = MONTHS[locale][Number(get('month')) - 1]
  const time = `${get('hour')}:${get('minute')}`
  return locale === 'uz' ? `${get('day')}-${month}, ${time}` : `${get('day')} ${month}, ${time}`
}
