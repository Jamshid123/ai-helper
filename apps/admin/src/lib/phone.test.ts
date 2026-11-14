import { describe, expect, it } from 'vitest'
import { formatPhoneInput, isCompleteUzPhone } from './phone'

/** Посимвольный набор, как в поле ввода. */
function type(text: string, start = ''): string {
  let v = start
  for (const ch of text) v = formatPhoneInput(v + ch, v)
  return v
}
/** N раз стереть последний символ. */
function erase(value: string, n: number): string {
  let v = value
  for (let i = 0; i < n; i++) v = formatPhoneInput(v.slice(0, -1), v)
  return v
}

describe('formatPhoneInput — маска +998 XX XXX XX XX', () => {
  it('набор без кода страны', () => {
    expect(type('9')).toBe('+998 9')
    expect(type('901')).toBe('+998 90 1')
    expect(type('901234567')).toBe('+998 90 123 45 67')
  })
  it('набор с кодом страны: «+998…» по привычке', () => {
    expect(type('+')).toBe('+')
    expect(type('+99')).toBe('+99')
    expect(type('+998')).toBe('+998 ')
    expect(type('+998901234567')).toBe('+998 90 123 45 67')
    expect(type('+998 (90) 807-97-87')).toBe('+998 90 807 97 87')
  })
  it('вставка целиком в любом виде', () => {
    expect(formatPhoneInput('+998901234567')).toBe('+998 90 123 45 67')
    expect(formatPhoneInput('998 (90) 123-45-67')).toBe('+998 90 123 45 67')
    expect(formatPhoneInput('90 123 45 67')).toBe('+998 90 123 45 67')
  })
  it('лишние цифры обрезаются', () => {
    expect(type('9012345678')).toBe('+998 90 123 45 67')
  })
  it('стирание: по цифре, до кода страны поле очищается', () => {
    const full = type('901234567')
    expect(erase(full, 1)).toBe('+998 90 123 45 6')
    expect(erase(full, 3)).toBe('+998 90 123 4')
    expect(erase(type('9'), 1)).toBe('')
    expect(erase(type('+99'), 1)).toBe('')
  })
  it('email (старые учётки) не трогает', () => {
    expect(formatPhoneInput('admin@example.com')).toBe('admin@example.com')
  })
  it('полный номер — 9 цифр после +998', () => {
    expect(isCompleteUzPhone('+998 90 123 45 67')).toBe(true)
    expect(isCompleteUzPhone('+998 90 123 45')).toBe(false)
  })
})
