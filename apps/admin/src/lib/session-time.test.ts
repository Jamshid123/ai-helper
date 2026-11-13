import { describe, expect, it } from 'vitest'
import { currentOrNextSession } from './session-time'

// Ташкент = UTC+5. Пятница 20.11.2026: 09:00 местного = 04:00Z, 18:00 = 13:00Z.
describe('currentOrNextSession', () => {
  it('в среду показывает ближайшую пятницу', () => {
    const s = currentOrNextSession(new Date('2026-11-18T10:00:00Z'))
    expect(s.opensAt.toISOString()).toBe('2026-11-20T04:00:00.000Z')
    expect(s.closesAt.toISOString()).toBe('2026-11-20T13:00:00.000Z')
    expect(s.isLive).toBe(false)
  })

  it('в пятницу в 17:59:59 сессия идёт', () => {
    const s = currentOrNextSession(new Date('2026-11-20T12:59:59Z'))
    expect(s.isLive).toBe(true)
    expect(s.closesAt.toISOString()).toBe('2026-11-20T13:00:00.000Z')
  })

  it('в пятницу в 18:00 ровно — уже следующая неделя', () => {
    const s = currentOrNextSession(new Date('2026-11-20T13:00:00Z'))
    expect(s.opensAt.toISOString()).toBe('2026-11-27T04:00:00.000Z')
  })

  it('учитывает дату по Ташкенту, а не по UTC (чт 20:00Z = пт 01:00 в Ташкенте)', () => {
    const s = currentOrNextSession(new Date('2026-11-19T20:00:00Z'))
    expect(s.opensAt.toISOString()).toBe('2026-11-20T04:00:00.000Z')
    expect(s.isLive).toBe(false)
  })
})
