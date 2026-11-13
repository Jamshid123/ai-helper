import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Проверка подписи Telegram Mini App initData (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 * secret = HMAC_SHA256(key="WebAppData", msg=botToken); hash = hex(HMAC_SHA256(key=secret, msg=data_check_string)),
 * data_check_string — все поля, кроме hash, отсортированные по ключу, «key=value» через \n.
 */
export type TelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export type ValidInitData = { user: TelegramUser; authDate: Date; startParam?: string }

export class InitDataError extends Error {
  constructor(readonly reason: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' | 'NO_USER') {
    super(reason)
    this.name = 'InitDataError'
  }
}

export function signInitData(fields: Record<string, string>, botToken: string): string {
  const dataCheckString = Object.keys(fields)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  return createHmac('sha256', secret).update(dataCheckString).digest('hex')
}

export function validateInitData(raw: string, botToken: string, now: Date, maxAgeSec = 3600): ValidInitData {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096) throw new InitDataError('MALFORMED')
  const params = new URLSearchParams(raw)
  const hash = params.get('hash')
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new InitDataError('MALFORMED')

  const fields: Record<string, string> = {}
  for (const [k, v] of params) fields[k] = v
  const expected = Buffer.from(signInitData(fields, botToken), 'hex')
  const given = Buffer.from(hash, 'hex')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new InitDataError('BAD_SIGNATURE')

  const authDateSec = Number(fields.auth_date)
  if (!Number.isFinite(authDateSec)) throw new InitDataError('MALFORMED')
  const authDate = new Date(authDateSec * 1000)
  const age = (now.getTime() - authDate.getTime()) / 1000
  if (age > maxAgeSec || age < -60) throw new InitDataError('EXPIRED')

  let user: TelegramUser
  try {
    user = JSON.parse(fields.user ?? '') as TelegramUser
  } catch {
    throw new InitDataError('NO_USER')
  }
  if (!user || typeof user.id !== 'number' || typeof user.first_name !== 'string') throw new InitDataError('NO_USER')
  return { user, authDate, startParam: fields.start_param }
}
