import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, generateTotpSecret, otpauthUrl, totpCode, verifyTotp } from './totp'

// RFC 6238, приложение B: ключ ASCII "12345678901234567890", SHA-1. Берём последние 6 цифр 8-значных кодов.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))
const VECTORS: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
]

describe('TOTP (RFC 6238)', () => {
  it('эталонные значения стандарта', () => {
    for (const [t, code] of VECTORS) expect(totpCode(RFC_SECRET, Math.floor(t / 30))).toBe(code)
  })

  it('base32 туда и обратно; секрет — 20 случайных байт', () => {
    const s = generateTotpSecret()
    expect(s).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Encode(base32Decode(s))).toBe(s)
    expect(generateTotpSecret()).not.toBe(s)
  })

  it('принимает код текущего и соседнего шага, возвращает шаг; чужой и неверный формат — null', () => {
    const now = new Date(1111111111 * 1000)
    expect(verifyTotp(RFC_SECRET, '050471', now)).toBe(Math.floor(1111111111 / 30))
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, Math.floor(1111111111 / 30) - 1), now)).not.toBeNull()
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, Math.floor(1111111111 / 30) - 3), now)).toBeNull()
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBeNull()
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBeNull()
  })

  it('ссылка для приложения-аутентификатора', () => {
    const url = otpauthUrl('ABC', 'admin@example.com')
    expect(url).toBe(
      'otpauth://totp/AuksionGO:admin%40example.com?secret=ABC&issuer=AuksionGO&algorithm=SHA1&digits=6&period=30'
    )
  })
})
