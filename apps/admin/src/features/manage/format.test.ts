import { describe, expect, it } from 'vitest'
import { toTashkentLocal, tashkentLocal, windowText } from './format'

describe('время торгов по Ташкенту', () => {
  it('datetime-local ⇄ ISO по Ташкенту (UTC+5)', () => {
    expect(new Date(tashkentLocal('2026-11-20T09:00')).toISOString()).toBe(
      '2026-11-20T04:00:00.000Z'
    )
    expect(toTashkentLocal('2026-11-20T04:00:00.000Z')).toBe('2026-11-20T09:00')
  })
  it('окно торгов: в один день — время окончания, в разные дни — с датой', () => {
    expect(windowText('2026-11-20T04:00:00Z', '2026-11-20T13:00:00Z')).toMatch(
      /09:00 — 18:00$/
    )
    expect(windowText('2026-11-20T04:00:00Z', '2026-11-21T13:00:00Z')).toMatch(
      /21 нояб\.?, 18:00$/
    )
  })
})
