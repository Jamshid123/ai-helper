import { describe, expect, it } from 'vitest'
import {
  fridaySlot,
  isFriday,
  nextFriday,
  toTashkentLocal,
  tashkentLocal,
} from './format'

describe('время торгов по Ташкенту', () => {
  it('пятничный слот 09:00–18:00 UTC+5', () => {
    expect(fridaySlot('2026-11-20')).toEqual({
      opensAt: '2026-11-20T09:00:00+05:00',
      closesAt: '2026-11-20T18:00:00+05:00',
    })
    expect(new Date(fridaySlot('2026-11-20').opensAt).toISOString()).toBe(
      '2026-11-20T04:00:00.000Z'
    )
  })
  it('ближайшая пятница — с завтрашнего дня; проверка дня недели', () => {
    expect(nextFriday(new Date('2026-11-14T08:00:00Z'))).toBe('2026-11-20') // суббота
    expect(nextFriday(new Date('2026-11-20T08:00:00Z'))).toBe('2026-11-27') // в пятницу — следующая
    expect(isFriday('2026-11-20')).toBe(true)
    expect(isFriday('2026-11-21')).toBe(false)
  })
  it('datetime-local ⇄ ISO по Ташкенту', () => {
    expect(new Date(tashkentLocal('2026-11-20T09:00')).toISOString()).toBe(
      '2026-11-20T04:00:00.000Z'
    )
    expect(toTashkentLocal('2026-11-20T04:00:00.000Z')).toBe('2026-11-20T09:00')
  })
})
