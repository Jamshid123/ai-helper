import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { StaffAuthService } from '../src/modules/staff/staff-auth.service'
import { loginAs, startApp } from './app'
import { cleanDb } from './factories'

const db = new PrismaClient()
const PASSWORD = 'correct horse battery staple'
const PHONE = '+998901112233'

describe('Вход сотрудников: телефон + пароль, cookie-сессия, CSRF', () => {
  let app: NestFastifyApplication
  let auth: StaffAuthService
  beforeAll(async () => {
    app = await startApp()
    auth = app.get(StaffAuthService)
  })
  beforeEach(async () => {
    await cleanDb(db)
    await auth.createStaff({
      phone: '90 111 22 33',
      firstName: 'Админ',
      lastName: 'Главный',
      password: PASSWORD,
      roles: ['ADMIN'],
    })
  })
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  const login = (who: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { login: who, password } })
  const cookiesOf = (res: { headers: Record<string, unknown> }) => {
    const raw = res.headers['set-cookie']
    const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
    return Object.fromEntries(list.map((c: string) => [c.split('=')[0], c]))
  }
  const value = (cookie: string) => cookie.split(';')[0].split('=').slice(1).join('=')
  async function signIn() {
    const res = await login(PHONE, PASSWORD)
    expect(res.statusCode).toBe(200)
    const c = cookiesOf(res)
    return {
      cookie: `staff_session=${value(c.staff_session)}; csrf_token=${value(c.csrf_token)}`,
      csrf: value(c.csrf_token),
    }
  }

  it('верный пароль → сотрудник и cookie (httpOnly, Secure, SameSite=Strict, 8 ч); в БД — хэши', async () => {
    const res = await login('+998 90 111-22-33', PASSWORD) // любая запись номера
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      name: 'Админ Главный',
      phone: PHONE,
      email: null,
      roles: ['ADMIN'],
      disabled: false,
    })
    const c = cookiesOf(res)
    expect(c.staff_session).toMatch(/HttpOnly/)
    expect(c.staff_session).toMatch(/Secure/)
    expect(c.staff_session).toMatch(/SameSite=Strict/)
    expect(c.staff_session).toMatch(/Max-Age=28800/)
    expect(c.csrf_token).not.toMatch(/HttpOnly/)
    const staff = await db.staff.findFirstOrThrow()
    expect(staff.passwordHash).toMatch(/^\$argon2id\$/)
    const s = await db.staffSession.findFirstOrThrow()
    expect(s.tokenHash).not.toBe(value(c.staff_session))
    expect(await db.auditLog.count({ where: { action: 'staff.login' } })).toBe(1)
  })

  it('неверный пароль и неизвестный телефон — одинаковый 401', async () => {
    const bad = await login(PHONE, 'wrong password!!')
    const unknown = await login('+998909999999', PASSWORD)
    expect(bad.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(bad.json().code).toBe(unknown.json().code)
    expect(cookiesOf(bad).staff_session).toBeUndefined()
  })

  it('сессия: /me по cookie; мутации без CSRF — 403; выход отзывает сессию', async () => {
    const { cookie, csrf } = await signIn()
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/me' })).statusCode).toBe(401)
    const me = await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } })
    expect(me.json().phone).toBe(PHONE)
    const url = '/api/v1/admin/auth/logout'
    expect((await app.inject({ method: 'POST', url, headers: { cookie } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url, headers: { cookie, 'x-csrf-token': 'nope' } })).statusCode).toBe(
      403
    )
    expect((await app.inject({ method: 'POST', url, headers: { cookie, 'x-csrf-token': csrf } })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } })).statusCode).toBe(401)
  })

  it('5 неудачных попыток — блокировка 423 даже с верным паролем; успешный вход сбрасывает счётчик', async () => {
    for (let i = 0; i < 5; i++) expect((await login(PHONE, 'wrong password!!')).statusCode).toBe(401)
    const locked = await login(PHONE, PASSWORD)
    expect(locked.statusCode).toBe(423)
    expect(locked.json().code).toBe('LOCKED')
    await db.staff.updateMany({ data: { lockedUntil: null, failedLogins: 3 } })
    await signIn()
    expect((await db.staff.findFirstOrThrow()).failedLogins).toBe(0)
  })

  it('просроченная сессия и отключённый сотрудник — 401; токен покупателя в админке не работает', async () => {
    const { cookie } = await signIn()
    await db.staffSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } })).statusCode).toBe(401)

    const second = await signIn()
    await db.staff.updateMany({ data: { disabledAt: new Date() } })
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie: second.cookie } })).statusCode
    ).toBe(401)
    expect((await login(PHONE, PASSWORD)).statusCode).toBe(401)

    const buyer = await loginAs(app, 920_001)
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: buyer.auth })).statusCode).toBe(401)
  })

  it('старая учётка без телефона входит по email; после staff-set-phone — по телефону', async () => {
    await db.staff.create({
      data: {
        email: 'old@auksion.uz',
        firstName: 'Старый',
        passwordHash: (await db.staff.findFirstOrThrow()).passwordHash,
        roles: ['ADMIN'],
      },
    })
    expect((await login('Old@Auksion.uz', PASSWORD)).statusCode).toBe(200)
    await auth.setPhoneByEmail('old@auksion.uz', '+998 90 777 66 55')
    const r = await login('907776655', PASSWORD)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ name: 'Старый', phone: '+998907776655', email: 'old@auksion.uz' })
  })
})
