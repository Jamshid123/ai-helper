import { describe, expect, it } from 'vitest'
import { formatSum, parseSum } from './money'
import { minNextBid, prepaymentAmount } from './rules'

describe('minNextBid', () => {
  it('первая ставка — не ниже стартовой цены', () => {
    expect(minNextBid(2_000_000n, 100_000n, null)).toBe(2_000_000n)
  })
  it('пример из ТЗ: после 2 000 000 минимум 2 100 000', () => {
    expect(minNextBid(2_000_000n, 100_000n, 2_000_000n)).toBe(2_100_000n)
  })
})

describe('prepaymentAmount', () => {
  it('30% от ставки', () => {
    expect(prepaymentAmount(8_400_000n)).toBe(2_520_000n)
  })
  it('округляет вверх до целого сума', () => {
    expect(prepaymentAmount(1_000_001n)).toBe(300_001n)
  })
  it('предоплата + остаток = цена', () => {
    const price = 7_333_333n
    expect(prepaymentAmount(price) + (price - prepaymentAmount(price))).toBe(price)
  })
})

describe('formatSum', () => {
  it('группирует разряды и добавляет валюту', () => {
    expect(formatSum('2100000')).toBe('2 100 000 сум')
    expect(formatSum(2_100_000n, 'uz')).toBe('2 100 000 soʻm')
    expect(formatSum(950n, 'ru', false)).toBe('950')
  })
  it('отклоняет нецелые и отрицательные значения', () => {
    expect(() => parseSum('1.5')).toThrow()
    expect(() => parseSum('-1')).toThrow()
  })
})
