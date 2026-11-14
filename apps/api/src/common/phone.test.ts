import { describe, expect, it } from 'vitest'
import { normalizeUzPhone } from './phone'

describe('normalizeUzPhone', () => {
  it('разные записи одного номера → +998XXXXXXXXX', () => {
    for (const v of ['+998 90 123 45 67', '998901234567', '90 123-45-67', '(90) 123 45 67', '+998(90)1234567'])
      expect(normalizeUzPhone(v)).toBe('+998901234567')
  })
  it('не узбекский или неполный номер — null', () => {
    for (const v of ['', '12345', '+7 912 345 67 89', '99890123456', 'abc', '+998 90 123 45 678'])
      expect(normalizeUzPhone(v)).toBeNull()
  })
})
