import { type TKey } from '@/app/i18n'
import { ApiError } from './client'

const KNOWN = new Set([
  'BID_TOO_LOW',
  'BID_TOO_HIGH',
  'ALREADY_LEADING',
  'NO_ADMISSION',
  'RESTRICTED',
  'CONFLICT_OF_INTEREST',
  'LOT_CLOSED',
  'LOT_NOT_LIVE',
  'PAYMENTS_DISABLED',
  'NETWORK',
  'LOT_STARTED',
  'LOT_FULL',
  'DEVICE_SHARED',
  'DEVICE_LIMIT',
  'BAD_PHONE',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_LOCKED',
  'OTP_COOLDOWN',
  'OTP_LIMIT',
  'SMS_DISABLED',
  'RATE_LIMITED',
  'PAYMENT_CLOSED',
  'ALREADY_PAID',
])
const SESSION = new Set(['UNAUTHORIZED', 'CSRF'])

/** Код ошибки API (или сама ошибка) → понятный текст на языке пользователя. */
export function errorText(t: (k: TKey) => string, e: unknown): string {
  const code = typeof e === 'string' ? e : e instanceof ApiError ? e.code : ''
  if (KNOWN.has(code)) return t(`err.${code}` as TKey)
  if (SESSION.has(code)) return t('err.SESSION')
  return t('err.GENERIC')
}
