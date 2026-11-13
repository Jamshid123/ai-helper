import { describe, expect, it } from 'vitest'
import { formatSessionDate } from './format-date'

// 04:00Z = 09:00 в Ташкенте (UTC+5)
const d = new Date('2026-11-20T04:00:00Z')

describe('formatSessionDate', () => {
  it('ru', () => expect(formatSessionDate(d, 'ru')).toBe('20 ноября, 09:00'))
  it('uz — без «M11»', () => expect(formatSessionDate(d, 'uz')).toBe('20-noyabr, 09:00'))
  it('учитывает дату по Ташкенту (чт 20:00Z = пт 01:00)', () =>
    expect(formatSessionDate(new Date('2026-11-19T20:00:00Z'), 'ru')).toBe('20 ноября, 01:00'))
})
