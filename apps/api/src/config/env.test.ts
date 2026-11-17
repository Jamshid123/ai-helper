import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGINS: 'https://auksion.expertly.uz',
  TELEGRAM_BOT_TOKEN: '123456:TEST-TOKEN-not-real-xxxxxx',
  JWT_SECRET: 'x'.repeat(32),
  DATA_ENCRYPTION_KEY: 'ab'.repeat(32),
}

describe('loadEnv', () => {
  const click = { CLICK_SERVICE_ID: '1', CLICK_MERCHANT_ID: '2', CLICK_MERCHANT_USER_ID: '3', CLICK_SECRET_KEY: 's'.repeat(12) }
  const payme = { PAYME_MERCHANT_ID: '5e730e8e0b852a417aa49ceb', PAYME_KEY: 'k'.repeat(20) }

  it('платёжные системы (17.11.2026): ключи — комплектом; live без единой системы не стартует; пустые = не заданы', () => {
    expect(() => loadEnv({ ...base, CLICK_SERVICE_ID: '1' })).toThrow(/Click/)
    expect(() => loadEnv({ ...base, PAYME_KEY: 'k'.repeat(20) })).toThrow(/Payme/)
    expect(() => loadEnv({ ...base, PAYMENTS_MODE: 'live' })).toThrow(/ни одна/)
    expect(loadEnv({ ...base, PAYMENTS_MODE: 'live', ...click }).CLICK_SERVICE_ID).toBe(1)
    expect(loadEnv({ ...base, PAYMENTS_MODE: 'live', ...payme }).PAYME_IP_CHECK).toBe(true)
    const empty = loadEnv({ ...base, CLICK_SERVICE_ID: '', CLICK_SECRET_KEY: '', PAYME_KEY: '', PAYME_MERCHANT_ID: '' })
    expect(empty.CLICK_SERVICE_ID).toBeUndefined()
  })

  it('в production нельзя выключить проверку адресов Payme и включить песочницу Payme', () => {
    expect(() => loadEnv({ ...base, ...payme, PAYME_IP_CHECK: 'false' })).toThrow(/PAYME_IP_CHECK/)
    expect(() => loadEnv({ ...base, ...payme, PAYME_TEST_MODE: 'true' })).toThrow(/PAYME_TEST_MODE/)
    expect(loadEnv({ ...base, ...payme, PAYME_TEST_MODE: 'true', DEMO_STAND: 'true' }).PAYME_TEST_MODE).toBe(true)
  })

  it('без обязательных переменных не стартует', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/)
  })

  it('оплата по умолчанию выключена, окружение по умолчанию — production', () => {
    const env = loadEnv(base)
    expect(env.PAYMENTS_MODE).toBe('disabled')
    expect(env.NODE_ENV).toBe('production')
    expect(env.CORS_ORIGINS).toEqual(['https://auksion.expertly.uz'])
  })

  it('ключ шифрования обязателен и строго 32 байта hex', () => {
    expect(() => loadEnv({ ...base, DATA_ENCRYPTION_KEY: undefined })).toThrow(/DATA_ENCRYPTION_KEY/)
    expect(() => loadEnv({ ...base, DATA_ENCRYPTION_KEY: 'ab'.repeat(16) })).toThrow(/DATA_ENCRYPTION_KEY/)
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

  it('демо-стенд: fake-оплата в production только при явном DEMO_STAND=true', () => {
    expect(loadEnv(base).DEMO_STAND).toBe(false)
    expect(() => loadEnv({ ...base, PAYMENTS_MODE: 'fake', DEMO_STAND: 'false' })).toThrow(/production/)
    expect(() => loadEnv({ ...base, PAYMENTS_MODE: 'fake', DEMO_STAND: 'yes' })).toThrow()
    const env = loadEnv({ ...base, PAYMENTS_MODE: 'fake', DEMO_STAND: 'true' })
    expect(env.PAYMENTS_MODE).toBe('fake')
    expect(env.DEMO_STAND).toBe(true)
  })
})
