import { describe, expect, it } from 'vitest'
import { maxNextBid } from './rules'

describe('maxNextBid — не больше чем на 50% выше предыдущей цены (решение 14.11.2026)', () => {
  it('пример партнёра: после 1 000 000 — не больше 1 500 000', () => {
    expect(maxNextBid(500_000n, 100_000n, 1_000_000n)).toBe(1_500_000n)
  })
  it('первое предложение — не больше старта + 50%', () => {
    expect(maxNextBid(2_000_000n, 100_000n, null)).toBe(3_000_000n)
  })
  it('если шаг больше 50%, минимальная цена всё равно допустима', () => {
    expect(maxNextBid(100_000n, 100_000n, 100_000n)).toBe(200_000n)
  })
  it('целые сумы: округление вниз', () => {
    expect(maxNextBid(1_000_001n, 1n, null)).toBe(1_500_001n)
  })
})
