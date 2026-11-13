import { describe, expect, it } from 'vitest'
import { dict } from './i18n'

describe('i18n', () => {
  it('ключи ru и uz совпадают', () => {
    expect(Object.keys(dict.uz).sort()).toEqual(Object.keys(dict.ru).sort())
  })
  it('нет пустых строк', () => {
    for (const l of ['ru', 'uz'] as const) for (const v of Object.values(dict[l])) expect(v.trim()).not.toBe('')
  })
})
