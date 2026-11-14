import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** TOTP по RFC 6238 (HMAC-SHA1, 30 с, 6 цифр) — без зависимостей. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PERIOD = 30
const DIGITS = 6
const ISSUER = 'AuksionGO'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) throw new Error('invalid base32')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = h[h.length - 1] & 0xf
  const bin = (h.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS
  return String(bin).padStart(DIGITS, '0')
}

/** Совпавший шаг (для защиты от повтора кода) или null. Допуск ±1 шаг на расхождение часов. */
export function verifyTotp(secret: string, code: string, now: Date, window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const current = Math.floor(now.getTime() / 1000 / PERIOD)
  for (let d = -window; d <= window; d++) {
    const expected = Buffer.from(totpCode(secret, current + d))
    if (timingSafeEqual(expected, Buffer.from(code))) return current + d
  }
  return null
}

export function otpauthUrl(secret: string, account: string): string {
  const label = `${ISSUER}:${encodeURIComponent(account)}`
  return `otpauth://totp/${label}?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`
}
