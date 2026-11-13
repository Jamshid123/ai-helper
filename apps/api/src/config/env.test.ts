import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGINS: 'https://auksion.expertly.uz',
  TELEGRAM_BOT_TOKEN: '123456:TEST-TOKEN-not-real-xxxxxx',
  JWT_SECRET: 'x'.repeat(32),
}

describe('loadEnv', () => {
  it('без обязательных переменных не стартует', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/)
  })

  it('оплата по умолчанию выключена, окружение по умолчанию — production', () => {
    const env = loadEnv(base)
    expect(env.PAYMENTS_MODE).toBe('disabled')
    expect(env.NODE_ENV).toBe('production')
    expect(env.CORS_ORIGINS).toEqual(['https://auksion.expertly.uz'])
  })

  it('короткий JWT_SECRET и кривой токен бота не принимаются', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/)
    expect(() => loadEnv({ ...base, TELEGRAM_BOT_TOKEN: 'nope' })).toThrow(/TELEGRAM_BOT_TOKEN/)
  })

  it('CORS «*» запрещён', () => {
    expect(() => loadEnv({ ...base, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/)
  })

  it('fake-оплата запрещена в production', () => {
    expect(() => loadEnv({ ...base, PAYMENTS_MODE: 'fake' })).toThrow(/production/)
    expect(loadEnv({ ...base, NODE_ENV: 'test', PAYMENTS_MODE: 'fake' }).PAYMENTS_MODE).toBe('fake')
  })
})
