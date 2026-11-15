import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { loginAs, startApp } from './app'
import { cleanDb, createLot, createUser } from './factories'

const db = new PrismaClient()

describe('Ограничение частоты запросов (решение 15.11.2026)', () => {
  let app: NestFastifyApplication
  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'true'
    process.env.SMS_MODE = 'fake'
    app = await startApp()
  })
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false'
    delete process.env.SMS_MODE
    await app?.close()
    await db.$disconnect()
  })

  // уникальный «клиентский» адрес на тест: ключи в Redis не пересекаются между запусками
  const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

  it('предложения цены: не больше 20 за 10 секунд на покупателя → 429 с Retry-After; другого покупателя не задевает', async () => {
    const lot = await createLot(db)
    const a = await loginAs(app, 930_001)
    const b = await loginAs(app, 930_002)
    const bid = (h: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/lots/${lot.id}/bids`,
        headers: h,
        payload: { amount: '1', idempotencyKey: crypto.randomUUID() },
      })
    // без допуска сервер отказывает (403), но попытки считаются — перебор всё равно ограничен
    for (let i = 0; i < 20; i++) expect((await bid(a.auth)).statusCode).not.toBe(429)
    const limited = await bid(a.auth)
    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED' })
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(10)
    expect((await bid(b.auth)).statusCode).not.toBe(429)
  })

  it('запрос SMS-кода: не больше 10 в минуту с адреса; подставной X-Forwarded-For не помогает', async () => {
    const real = ip()
    const req = (i: number) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp/request',
        // nginx хоста дописывает реальный адрес в конец; левые адреса клиент может подделать
        headers: { 'x-forwarded-for': `1.2.3.${i}, ${real}` },
        payload: { phone: `9033${String(i).padStart(5, '0')}` },
      })
    for (let i = 0; i < 10; i++) expect((await req(i)).statusCode).not.toBe(429)
    expect((await req(10)).json().code).toBe('RATE_LIMITED')
    // другой реальный адрес — не задет
    const other = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      headers: { 'x-forwarded-for': ip() },
      payload: { phone: '903399999' },
    })
    expect(other.statusCode).toBe(200)
  })

  it('эндпоинты без правила (каталог) не ограничиваются', async () => {
    await createUser(db)
    for (let i = 0; i < 30; i++) {
      expect((await app.inject({ method: 'GET', url: '/api/v1/lots' })).statusCode).toBe(200)
    }
  })

  it('выключить ограничение в production нельзя', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x@y/z',
      REDIS_URL: 'redis://y',
      CORS_ORIGINS: 'https://example.uz',
      TELEGRAM_BOT_TOKEN: '123:abcdefghijklmnopqrstuvwxyz',
      JWT_SECRET: 'x'.repeat(40),
      DATA_ENCRYPTION_KEY: 'a'.repeat(64),
    }
    expect(loadEnv(base).RATE_LIMIT_ENABLED).toBe(true)
    expect(() => loadEnv({ ...base, RATE_LIMIT_ENABLED: 'false' })).toThrow(/RATE_LIMIT_ENABLED/)
  })
})
