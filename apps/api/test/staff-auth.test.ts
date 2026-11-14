import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { StaffAuthService } from '../src/modules/staff/staff-auth.service'
import { totpCode } from '../src/modules/staff/totp'
import { loginAs, startApp } from './app'
import { cleanDb } from './factories'

const db = new PrismaClient()
const PASSWORD = 'correct horse battery staple'
const step = () => Math.floor(Date.now() / 30_000)

describe('Вход сотрудников: пароль + TOTP, cookie-сессия, CSRF', () => {
  let app: NestFastifyApplication
  let auth: StaffAuthService
  beforeAll(async () => {
    app = await startApp()
    auth = app.get(StaffAuthService)
  })
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  const login = (email: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email, password } })
  const mfa = (challengeId: string, code: string) =>
    app.inject({ method: 'POST', url: '/api/v1/admin/auth/mfa', payload: { challengeId, code } })
  const cookiesOf = (res: { headers: Record<string, unknown> }) => {
    const raw = res.headers['set-cookie']
    const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
    return Object.fromEntries(list.map((c: string) => [c.split('=')[0], c]))
  }
  const value = (cookie: string) => cookie.split(';')[0].split('=').slice(1).join('=')

  /** Полный вход; при первом входе — подключение кода по выданному ключу. */
  async function signIn(email = 'admin@auksion.uz', codeStep = step()) {
    const r = await login(email, PASSWORD)
    expect(r.statusCode).toBe(200)
    const { challengeId, enroll } = r.json()
    const secret = enroll?.secret ?? (await auth.secretFor(email))
    const res = await mfa(challengeId, totpCode(secret, codeStep))
    expect(res.statusCode).toBe(200)
    const c = cookiesOf(res)
    return {
      res,
      secret,
      cookie: `staff_session=${value(c.staff_session)}; csrf_token=${value(c.csrf_token)}`,
      csrf: value(c.csrf_token),
      raw: c,
    }
  }

  it('первый вход: пароль → ключ для приложения → первый код подключает TOTP и открывает сессию', async () => {
    await auth.createStaff({ email: 'Admin@Auksion.uz', name: 'Админ', password: PASSWORD, roles: ['ADMIN'] })
    const r = await login('admin@auksion.uz', PASSWORD)
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.challengeId).toEqual(expect.any(String))
    expect(body.enroll.secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(body.enroll.otpauthUrl).toContain('otpauth://totp/AuksionGO:admin%40auksion.uz')

    const res = await mfa(body.challengeId, totpCode(body.enroll.secret, step()))
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: expect.any(String), name: 'Админ', email: 'admin@auksion.uz', roles: ['ADMIN'] })
    const c = cookiesOf(res)
    expect(c.staff_session).toMatch(/HttpOnly/)
    expect(c.staff_session).toMatch(/Secure/)
    expect(c.staff_session).toMatch(/SameSite=Strict/)
    expect(c.staff_session).toMatch(/Max-Age=28800/)
    expect(c.csrf_token).not.toMatch(/HttpOnly/)
    expect(c.csrf_token).toMatch(/SameSite=Strict/)
    // пароль — argon2id, TOTP-секрет зашифрован, в БД — только хэш токена сессии
    const staff = await db.staff.findFirstOrThrow()
    expect(staff.passwordHash).toMatch(/^\$argon2id\$/)
    expect(staff.totpSecretEnc).not.toContain(body.enroll.secret)
    const s = await db.staffSession.findFirstOrThrow()
    expect(s.tokenHash).not.toBe(value(c.staff_session))

    // после подключения ключ больше не выдаётся
    const again = await login('admin@auksion.uz', PASSWORD)
    expect(again.json().enroll).toBeNull()
    const audit = await db.auditLog.findMany({ where: { action: 'staff.login' } })
    expect(audit).toHaveLength(1)
  })

  it('неверный пароль и неизвестный email — одинаковый 401; код без пароля не принимается', async () => {
    await auth.createStaff({ email: 'admin@auksion.uz', name: 'Админ', password: PASSWORD, roles: ['ADMIN'] })
    const bad = await login('admin@auksion.uz', 'wrong password!!')
    const unknown = await login('nobody@auksion.uz', PASSWORD)
    expect(bad.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(bad.json().code).toBe(unknown.json().code)
    expect((await mfa('00000000-0000-4000-8000-000000000000', '123456')).statusCode).toBe(410)
  })

  it('сессия: /me по cookie; мутации без CSRF — 403; выход отзывает сессию', async () => {
    await auth.createStaff({ email: 'admin@auksion.uz', name: 'Админ', password: PASSWORD, roles: ['ADMIN'] })
    const { cookie, csrf } = await signIn()
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/me' })).statusCode).toBe(401)
    const me = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } })
    expect(me.statusCode).toBe(200)
    expect(me.json().email).toBe('admin@auksion.uz')

    const noCsrf = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/logout', headers: { cookie } })
    expect(noCsrf.statusCode).toBe(403)
    const wrongCsrf = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/logout',
      headers: { cookie, 'x-csrf-token': 'nope' },
    })
    expect(wrongCsrf.statusCode).toBe(403)
    const out = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/logout',
      headers: { cookie, 'x-csrf-token': csrf },
    })
    expect(out.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } })).statusCode).toBe(401)
  })

  it('один и тот же код дважды не принимается (защита от повтора)', async () => {
    await auth.createStaff({ email: 'admin@auksion.uz', name: 'Админ', password: PASSWORD, roles: ['ADMIN'] })
    const { secret } = await signIn()
    const r = await login('admin@auksion.uz', PASSWORD)
    const replay = await mfa(r.json().challengeId, totpCode(secret, step()))
    expect(replay.statusCode).toBe(401)
    expect(replay.json().code).toBe('INVALID_CODE')
  })

  it('5 неудачных попыток — блокировка 423 даже с верным паролем; успешный вход сбрасывает счётчик', async () => {
    await auth.createStaff({ email: 'admin@auksion.uz', name: 'Админ', password: PASSWORD, roles: ['ADMIN'] })
    for (let i = 0; i < 5; i++) expect((await login('admin@auksion.uz', 'wrong password!!')).statusCode).toBe(401)
    const locked = await login('admin@auksion.uz', PASSWORD)
    expect(locked.statusCode).toBe(423)
    expect(locked.json().code).toBe('LOCKED')

    await db.staff.updateMany({ data: { lockedUntil: null, failedLogins: 3 } })
    await signIn()
    expect((await db.staff.findFirstOrThrow()).failedLogins).toBe(0)
  })

  it('неверные коды тоже считаются попытками и блокируют', async () => {
    await auth.createStaff({ email: 'admin@auksion.uz', name: 'Админ', password: PASSWORD, roles: ['ADMIN'] })
    const r = await login('admin@auksion.uz', PASSWORD)
    for (let i = 0; i < 5; i++) await mfa(r.json().challengeId, '000000')
    expect((await login('admin@auksion.uz', PASSWORD)).statusCode).toBe(423)
  })

  it('просроченная сессия и отключённый сотрудник — 401; токен покупателя в админке не работает', async () => {
    await auth.createStaff({ email: 'admin@auksion.uz', name: 'Админ', password: PASSWORD, roles: ['ADMIN'] })
    const { cookie } = await signIn()
    await db.staffSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } })).statusCode).toBe(401)

    await db.staffSession.deleteMany()
    const second = await signIn('admin@auksion.uz', step() + 1)
    await db.staff.updateMany({ data: { disabledAt: new Date() } })
    const me = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie: second.cookie } })
    expect(me.statusCode).toBe(401)

    const buyer = await loginAs(app, 920_001)
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: buyer.auth })).statusCode).toBe(401)
  })
})
