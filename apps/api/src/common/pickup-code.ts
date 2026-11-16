import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Одноразовый код выдачи товара (6 цифр). Выводится из секрета и id обязательства — покупатель может
 * открыть его в профиле сколько угодно раз, а в БД лежит только хэш (сотрудник сверяет введённый код).
 */
export function pickupCode(secret: string, obligationId: string): string {
  const n = createHmac('sha256', secret).update(`pickup:${obligationId}`).digest().readUInt32BE(0) % 1_000_000
  return String(n).padStart(6, '0')
}

export function pickupCodeHash(secret: string, obligationId: string, code: string): string {
  return createHmac('sha256', secret).update(`pickup-hash:${obligationId}:${code}`).digest('hex')
}

export function pickupCodeMatches(secret: string, obligationId: string, storedHash: string, code: string): boolean {
  const a = Buffer.from(pickupCodeHash(secret, obligationId, code))
  const b = Buffer.from(storedHash)
  return a.length === b.length && timingSafeEqual(a, b)
}
