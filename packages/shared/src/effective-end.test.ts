import { describe, expect, it } from 'vitest'
import { effectiveEnd } from './rules'

describe('effectiveEnd', () => {
  const close = new Date('2026-11-20T13:00:00Z')
  it('без ожидания или без предложений — назначенное время', () => {
    expect(effectiveEnd(close, null, 120)).toEqual(close)
    expect(effectiveEnd(close, new Date('2026-11-20T10:00:00Z'), null)).toEqual(close)
  })
  it('после последнего предложения N секунд тишины — раньше назначенного', () => {
    expect(effectiveEnd(close, new Date('2026-11-20T10:00:00Z'), 120)).toEqual(new Date('2026-11-20T10:02:00Z'))
  })
  it('никогда не позже назначенного времени', () => {
    expect(effectiveEnd(close, new Date('2026-11-20T12:59:30Z'), 120)).toEqual(close)
  })
})
