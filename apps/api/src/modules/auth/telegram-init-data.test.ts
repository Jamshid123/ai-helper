import { describe, expect, it } from 'vitest'
import { InitDataError, signInitData, validateInitData } from './telegram-init-data'

const TOKEN = '123456:TEST-TOKEN-not-real'
const now = new Date('2026-11-20T10:00:00Z')
const authDate = String(Math.floor(now.getTime() / 1000) - 60)
const user = JSON.stringify({ id: 42, first_name: 'Азиз', last_name: 'Каримов', language_code: 'uz' })

function build(fields: Record<string, string>, token = TOKEN) {
  const hash = signInitData(fields, token)
  return new URLSearchParams({ ...fields, hash }).toString()
}

const reason = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return (e as InitDataError).reason
  }
  return 'OK'
}

describe('validateInitData', () => {
  it('принимает корректно подписанные данные', () => {
    const r = validateInitData(build({ auth_date: authDate, query_id: 'AA', user, start_param: 'lot_1' }), TOKEN, now)
    expect(r.user.id).toBe(42)
    expect(r.startParam).toBe('lot_1')
  })

  it('отклоняет подпись другим токеном и подмену поля', () => {
    expect(reason(() => validateInitData(build({ auth_date: authDate, user }, 'other:token'), TOKEN, now))).toBe(
      'BAD_SIGNATURE'
    )
    const tampered = build({ auth_date: authDate, user }).replace('42', '43')
    expect(reason(() => validateInitData(tampered, TOKEN, now))).toBe('BAD_SIGNATURE')
  })

  it('отклоняет устаревшие (> 1 ч) данные', () => {
    const old = String(Math.floor(now.getTime() / 1000) - 3601)
    expect(reason(() => validateInitData(build({ auth_date: old, user }), TOKEN, now))).toBe('EXPIRED')
  })

  it('отклоняет мусор и отсутствие пользователя', () => {
    expect(reason(() => validateInitData('', TOKEN, now))).toBe('MALFORMED')
    expect(reason(() => validateInitData('hash=zz&auth_date=1', TOKEN, now))).toBe('MALFORMED')
    expect(reason(() => validateInitData(build({ auth_date: authDate }), TOKEN, now))).toBe('NO_USER')
  })
})
