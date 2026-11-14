import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loginStaff, startApp } from './app'
import { cleanDb } from './factories'

const db = new PrismaClient()

describe('Админка: сотрудники', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  const req = (method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: object) =>
    app.inject({ method, url: `/api/v1/admin/staff${url}`, headers, payload })
  const login = (login: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { login, password } })

  it('админ добавляет сотрудника (имя, фамилия, телефон, пароль, роли) — тот входит по телефону', async () => {
    const admin = await loginStaff(app, ['ADMIN'])
    const r = await req('POST', '', admin.write, {
      firstName: 'Дилноза',
      lastName: 'Каримова',
      phone: '+998 93 555 44 33',
      password: 'pickup desk 2026',
      roles: ['FULFILLMENT'],
    })
    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({
      name: 'Дилноза Каримова',
      phone: '+998935554433',
      roles: ['FULFILLMENT'],
      disabled: false,
    })
    expect(JSON.stringify(r.json())).not.toContain('pickup desk')

    const list = (await req('GET', '', admin.read)).json()
    expect(list.map((s: { phone: string }) => s.phone)).toContain('+998935554433')
    expect((await login('935554433', 'pickup desk 2026')).statusCode).toBe(200)
    expect(await db.auditLog.count({ where: { action: 'staff.created', actorId: admin.id } })).toBe(1)
  })

  it('проверки: телефон, длина пароля, роли, повтор телефона; не-админу раздел закрыт', async () => {
    const admin = await loginStaff(app, ['ADMIN'])
    const base = {
      firstName: 'Азиз',
      lastName: '',
      phone: '+998935554433',
      password: 'long enough pass',
      roles: ['SUPPORT'],
    }
    expect((await req('POST', '', admin.write, { ...base, phone: '12345' })).json().code).toBe('BAD_PHONE')
    expect((await req('POST', '', admin.write, { ...base, password: 'short' })).json().code).toBe('WEAK_PASSWORD')
    expect((await req('POST', '', admin.write, { ...base, roles: [] })).statusCode).toBe(400)
    expect((await req('POST', '', admin.write, base)).statusCode).toBe(201)
    expect((await req('POST', '', admin.write, base)).json().code).toBe('PHONE_TAKEN')

    const op = await loginStaff(app, ['OPERATOR'])
    expect((await req('GET', '', op.read)).statusCode).toBe(403)
  })

  it('изменить роли, отключить (сессии закрываются), новый пароль; себя отключить нельзя', async () => {
    const admin = await loginStaff(app, ['ADMIN'])
    const s = (
      await req('POST', '', admin.write, {
        firstName: 'Тимур',
        phone: '+998935550000',
        password: 'first password 1',
        roles: ['SUPPORT'],
      })
    ).json()
    const session = await login('+998935550000', 'first password 1')
    const cookie = ([] as string[])
      .concat(session.headers['set-cookie'] as string[])
      .map((c) => c.split(';')[0])
      .join('; ')
    const me = () => app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } })
    expect((await me()).statusCode).toBe(200)

    const upd = await req('PATCH', `/${s.id}`, admin.write, { roles: ['SUPPORT', 'RISK'], lastName: 'Расулов' })
    expect(upd.json()).toMatchObject({ name: 'Тимур Расулов', roles: ['SUPPORT', 'RISK'] })
    expect((await me()).statusCode).toBe(401) // роли сменились — войти заново

    expect((await req('POST', `/${s.id}/password`, admin.write, { password: 'new password 22' })).statusCode).toBe(204)
    expect((await login('+998935550000', 'first password 1')).statusCode).toBe(401)
    expect((await login('+998935550000', 'new password 22')).statusCode).toBe(200)

    expect((await req('PATCH', `/${s.id}`, admin.write, { disabled: true })).json().disabled).toBe(true)
    expect((await login('+998935550000', 'new password 22')).statusCode).toBe(401)

    const self = await req('PATCH', `/${admin.id}`, admin.write, { disabled: true })
    expect(self.json().code).toBe('SELF_LOCKOUT')
    expect((await req('PATCH', `/${admin.id}`, admin.write, { roles: ['SUPPORT'] })).json().code).toBe('SELF_LOCKOUT')
  })
})
