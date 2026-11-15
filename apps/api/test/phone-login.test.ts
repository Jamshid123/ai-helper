import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { startApp } from './app'
import { cleanDb } from './factories'

const db = new PrismaClient()

/** Cookie из ответа → заголовки для следующих запросов (сессия + CSRF). */
function sessionFrom(res: { headers: Record<string, unknown> }) {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] as string | string[])
  const get = (n: string) =>
    cookies
      .find((c) => c.startsWith(`${n}=`))!
      .split(';')[0]
      .split('=')
      .slice(1)
      .join('=')
  const cookie = `buyer_session=${get('buyer_session')}; buyer_csrf=${get('buyer_csrf')}`
  return { read: { cookie }, write: { cookie, 'x-csrf-token': decodeURIComponent(get('buyer_csrf')) }, cookies }
}

describe('Сайт: вход по телефону и SMS-коду (решение 15.11.2026)', () => {
  let app: NestFastifyApplication
  beforeAll(async () => {
    process.env.SMS_MODE = 'fake'
    app = await startApp()
  })
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    delete process.env.SMS_MODE
    await app?.close()
    await db.$disconnect()
  })

  const post = (url: string, payload: object, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: `/api/v1${url}`, payload, headers })

  it('код → вход → имя → лента; cookie httpOnly; изменения только с CSRF; выход отзывает сессию', async () => {
    const r = await post('/auth/otp/request', { phone: '90 123 45 67' })
    expect(r.statusCode).toBe(200)
    const { devCode, retryAfterSec } = r.json()
    expect(devCode).toMatch(/^\d{6}$/)
    expect(retryAfterSec).toBe(60)
    // в БД только HMAC кода
    const ch = await db.otpChallenge.findFirstOrThrow({ where: { phone: '+998901234567' } })
    expect(ch.codeHash).not.toContain(devCode)

    const v = await post('/auth/otp/verify', { phone: '+998 90 123-45-67', code: devCode })
    expect(v.statusCode).toBe(200)
    expect(v.json()).toMatchObject({ needsProfile: true, user: { phoneVerified: true } })
    expect(JSON.stringify(v.json())).not.toContain('901234567') // телефон наружу не отдаём
    const s = sessionFrom(v)
    expect(s.cookies.find((c) => c.startsWith('buyer_session='))).toMatch(/HttpOnly/)
    expect(s.cookies.find((c) => c.startsWith('buyer_session='))).toMatch(/SameSite=Strict/)

    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: s.read })).statusCode).toBe(200)
    // без CSRF изменение запрещено, с CSRF — можно
    expect((await post('/auth/profile', { firstName: 'Азиз' }, s.read)).statusCode).toBe(403)
    const p = await post('/auth/profile', { firstName: 'Азиз', lastName: 'Каримов' }, s.write)
    expect(p.json()).toMatchObject({ firstName: 'Азиз', publicName: 'Азиз К.' })

    // повторный вход тем же номером — тот же покупатель, профиль уже заполнен
    await db.otpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } })
    const r2 = (await post('/auth/otp/request', { phone: '901234567' })).json()
    const v2 = await post('/auth/otp/verify', { phone: '901234567', code: r2.devCode })
    expect(v2.json()).toMatchObject({ needsProfile: false, user: { id: v.json().user.id } })

    expect((await post('/auth/logout', {}, s.write)).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: s.read })).statusCode).toBe(401)
  })

  it('неверный код считается, после 5 попыток — блок; код одноразовый и живёт 5 минут', async () => {
    const { devCode } = (await post('/auth/otp/request', { phone: '901112233' })).json()
    const wrong = devCode === '000000' ? '111111' : '000000'
    for (let i = 4; i >= 0; i--) {
      const res = await post('/auth/otp/verify', { phone: '901112233', code: wrong })
      expect(res.json()).toMatchObject({ code: 'OTP_INVALID', attemptsLeft: i })
    }
    expect((await post('/auth/otp/verify', { phone: '901112233', code: devCode })).json().code).toBe('OTP_LOCKED')

    await db.otpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } })
    const fresh = (await post('/auth/otp/request', { phone: '901112233' })).json()
    expect((await post('/auth/otp/verify', { phone: '901112233', code: fresh.devCode })).statusCode).toBe(200)
    // повторно тот же код не проходит
    expect((await post('/auth/otp/verify', { phone: '901112233', code: fresh.devCode })).json().code).toBe(
      'OTP_EXPIRED'
    )

    await db.otpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } })
    const old = (await post('/auth/otp/request', { phone: '901112233' })).json()
    await db.otpChallenge.updateMany({ where: { consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1) } })
    expect((await post('/auth/otp/verify', { phone: '901112233', code: old.devCode })).json().code).toBe('OTP_EXPIRED')
  })

  it('повторная отправка — не чаще раза в минуту и не больше 5 в час; неверный номер — 400', async () => {
    expect((await post('/auth/otp/request', { phone: '12345' })).json().code).toBe('BAD_PHONE')
    expect((await post('/auth/otp/request', { phone: '905556677' })).statusCode).toBe(200)
    const again = await post('/auth/otp/request', { phone: '905556677' })
    expect(again.statusCode).toBe(429)
    expect(again.json()).toMatchObject({ code: 'OTP_COOLDOWN' })
    for (let i = 0; i < 4; i++) {
      await db.otpChallenge.updateMany({ data: { createdAt: new Date(Date.now() - 61_000 * (i + 1)) } })
      await post('/auth/otp/request', { phone: '905556677' })
    }
    await db.otpChallenge.updateMany({ where: {}, data: { createdAt: new Date(Date.now() - 120_000) } })
    expect((await post('/auth/otp/request', { phone: '905556677' })).json().code).toBe('OTP_LIMIT')
  })

  it('без SMS-провайдера вход закрыт; имитация SMS в production — только на демо-стенде', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x@y/z',
      REDIS_URL: 'redis://y',
      CORS_ORIGINS: 'https://example.uz',
      TELEGRAM_BOT_TOKEN: '123:abcdefghijklmnopqrstuvwxyz',
      JWT_SECRET: 'x'.repeat(40),
      DATA_ENCRYPTION_KEY: 'a'.repeat(64),
    }
    expect(loadEnv(base).SMS_MODE).toBe('disabled')
    expect(() => loadEnv({ ...base, SMS_MODE: 'fake' })).toThrow(/SMS_MODE=fake/)
    expect(loadEnv({ ...base, SMS_MODE: 'fake', DEMO_STAND: 'true' }).SMS_MODE).toBe('fake')
  })
})
