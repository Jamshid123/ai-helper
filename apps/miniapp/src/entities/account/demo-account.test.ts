import { describe, expect, it } from 'vitest'
import { isRegistered, maskPhone, publicNameOf } from './demo-account'

describe('demo account helpers', () => {
  it('публичное имя — имя и первая буква фамилии', () => {
    expect(publicNameOf({ firstName: 'Азиз', lastName: 'каримов' })).toBe('Азиз К.')
    expect(publicNameOf({ firstName: 'Malika', lastName: '' })).toBe('Malika')
  })
  it('телефон маскируется', () => {
    expect(maskPhone('+998 90 000 00 01')).toBe('+998 90 ***-**-01')
  })
  it('зарегистрирован = телефон + имя + правила', () => {
    const base = {
      phone: '+998900000001',
      firstName: 'A',
      lastName: '',
      rulesAccepted: true,
      seller: { status: 'none' as const, type: null, name: '', inn: '', cardLast4: '' },
    }
    expect(isRegistered(base)).toBe(true)
    expect(isRegistered({ ...base, rulesAccepted: false })).toBe(false)
  })
})
