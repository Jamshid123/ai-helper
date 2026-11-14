import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { open, seal } from './crypto-box'

describe('crypto-box (AES-256-GCM)', () => {
  const key = randomBytes(32).toString('hex')
  it('шифрует и расшифровывает; одинаковый текст даёт разный шифротекст', () => {
    const a = seal('SECRET', key)
    expect(a).not.toContain('SECRET')
    expect(seal('SECRET', key)).not.toBe(a)
    expect(open(a, key)).toBe('SECRET')
  })
  it('чужой ключ или подмена — ошибка, а не мусор', () => {
    const a = seal('SECRET', key)
    expect(() => open(a, randomBytes(32).toString('hex'))).toThrow()
    const tampered = Buffer.from(a, 'base64')
    tampered[tampered.length - 1] ^= 1
    expect(() => open(tampered.toString('base64'), key)).toThrow()
  })
})
