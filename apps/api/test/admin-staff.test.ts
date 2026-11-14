import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loginStaff, startApp } from './app'
import { cleanDb } from './factories'

const db = new PrismaClient()
const ALL = {
  schedule: 'edit',
  categories: 'edit',
  products: 'edit',
  lots: 'edit',
  sellers: 'edit',
  inspection: 'edit',
  risk: 'edit',
  participants: 'edit',
  finance: 'edit',
  fulfillment: 'edit',
  audit: 'view',
} as const

describe('Админка: сотрудники и роли', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  const api = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    headers: Record<string, string>,
    payload?: object
  ) => app.inject({ method, url: `/api/v1/admin${url}`, headers, payload })
  const login = (login: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { login, password } })
  const roleId = async (name: string) => (await db.role.findUniqueOrThrow({ where: { name } })).id
  const cookieOf = (res: { headers: Record<string, unknown> }) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] as string[])
      .map((c) => c.split(';')[0])
      .join('; ')

  it('стартовые роли из миграции: «Администратор» (всё, кроме сотрудников) и «Оператор»', async () => {
    const owner = await loginStaff(app)
    const r = (await api('GET', '/roles', owner.read)).json()
    expect(r.modules).toContain('lots')
    const byName = Object.fromEntries(r.roles.map((x: { name: string }) => [x.name, x]))
    expect(byName['Администратор'].permissions).toMatchObject({ lots: 'edit', participants: 'edit', audit: 'view' })
    expect(byName['Оператор'].permissions).toEqual({
      categories: 'edit',
      products: 'edit',
      lots: 'edit',
      participants: 'view',
    })
  })

  it('владелец добавляет сотрудника с ролью — тот входит по телефону и получает права роли', async () => {
    const owner = await loginStaff(app)
    const r = await api('POST', '/staff', owner.write, {
      firstName: 'Дилноза',
      lastName: 'Каримова',
      phone: '+998 93 555 44 33',
      password: 'pickup desk 2026',
      roleId: await roleId('Оператор'),
    })
    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({
      name: 'Дилноза Каримова',
      phone: '+998935554433',
      isOwner: false,
      role: { name: 'Оператор' },
    })
    expect(JSON.stringify(r.json())).not.toContain('pickup desk')
    const me = await login('935554433', 'pickup desk 2026')
    expect(me.statusCode).toBe(200)
    expect(me.json().permissions).toEqual({ categories: 'edit', products: 'edit', lots: 'edit', participants: 'view' })
    expect(await db.auditLog.count({ where: { action: 'staff.created', actorId: owner.id } })).toBe(1)
  })

  it('«Администратор» видит и меняет модули, но не сотрудников и не роли', async () => {
    const admin = await loginStaff(app, ALL)
    expect((await api('GET', '/lots', admin.read)).statusCode).toBe(200)
    expect((await api('GET', '/staff', admin.read)).statusCode).toBe(403)
    expect((await api('GET', '/roles', admin.read)).statusCode).toBe(403)
    expect((await api('POST', '/roles', admin.write, { name: 'Хакер', permissions: {} })).statusCode).toBe(403)
  })

  it('«только просмотр»: чтение можно, изменение — 403; без модуля — 403; права меняются сразу', async () => {
    const owner = await loginStaff(app)
    const viewer = await loginStaff(app, { categories: 'view' })
    const phones = await db.category.findUniqueOrThrow({ where: { slug: 'phones' } })
    expect((await api('GET', '/categories', viewer.read)).statusCode).toBe(200)
    expect((await api('PATCH', `/categories/${phones.id}`, viewer.write, { nameUz: 'X' })).statusCode).toBe(403)
    expect((await api('GET', '/products', viewer.read)).statusCode).toBe(403)

    const role = await db.role.findFirstOrThrow({ where: { staff: { some: { id: viewer.id } } } })
    const upd = await api('PATCH', `/roles/${role.id}`, owner.write, {
      permissions: { categories: 'edit', products: 'none' },
    })
    expect(upd.json().permissions).toEqual({ categories: 'edit' })
    expect((await api('PATCH', `/categories/${phones.id}`, viewer.write, { nameUz: 'Telefon' })).statusCode).toBe(200)
  })

  it('роли: создать, переименовать, удалить можно только без сотрудников', async () => {
    const owner = await loginStaff(app)
    const r = await api('POST', '/roles', owner.write, {
      name: 'Склад',
      permissions: { fulfillment: 'edit', lots: 'view' },
    })
    expect(r.statusCode).toBe(201)
    expect((await api('POST', '/roles', owner.write, { name: 'Склад' })).json().code).toBe('ROLE_NAME_TAKEN')
    expect((await api('PATCH', `/roles/${r.json().id}`, owner.write, { name: 'Склад и выдача' })).json().name).toBe(
      'Склад и выдача'
    )
    expect((await api('DELETE', `/roles/${await roleId('Оператор')}`, owner.write)).statusCode).toBe(204) // пустая
    await api('POST', '/staff', owner.write, {
      firstName: 'Тимур',
      phone: '+998935550000',
      password: 'warehouse pass 1',
      roleId: r.json().id,
    })
    expect((await api('DELETE', `/roles/${r.json().id}`, owner.write)).json().code).toBe('ROLE_IN_USE')
    expect(await db.auditLog.count({ where: { action: { startsWith: 'role.' } } })).toBe(3)
  })

  it('проверки сотрудника: телефон, пароль, роль, повтор телефона', async () => {
    const owner = await loginStaff(app)
    const base = {
      firstName: 'Азиз',
      phone: '+998935554433',
      password: 'long enough pass',
      roleId: await roleId('Оператор'),
    }
    expect((await api('POST', '/staff', owner.write, { ...base, phone: '12345' })).json().code).toBe('BAD_PHONE')
    expect((await api('POST', '/staff', owner.write, { ...base, password: 'short' })).json().code).toBe('WEAK_PASSWORD')
    expect((await api('POST', '/staff', owner.write, { ...base, roleId: undefined })).statusCode).toBe(400)
    expect((await api('POST', '/staff', owner.write, base)).statusCode).toBe(201)
    expect((await api('POST', '/staff', owner.write, base)).json().code).toBe('PHONE_TAKEN')
  })

  it('сменить роль, отключить (сессии закрываются), новый пароль; владельца отключить нельзя', async () => {
    const owner = await loginStaff(app)
    const s = (
      await api('POST', '/staff', owner.write, {
        firstName: 'Тимур',
        phone: '+998935550000',
        password: 'first password 1',
        roleId: await roleId('Оператор'),
      })
    ).json()
    const cookie = cookieOf(await login('+998935550000', 'first password 1'))
    const me = () => app.inject({ method: 'GET', url: '/api/v1/admin/me', headers: { cookie } })
    expect((await me()).statusCode).toBe(200)

    const upd = await api('PATCH', `/staff/${s.id}`, owner.write, {
      roleId: await roleId('Администратор'),
      lastName: 'Расулов',
    })
    expect(upd.json()).toMatchObject({ name: 'Тимур Расулов', role: { name: 'Администратор' } })
    expect((await me()).json().permissions.participants).toBe('edit') // права новой роли — сразу

    expect(
      (await api('POST', `/staff/${s.id}/password`, owner.write, { password: 'new password 22' })).statusCode
    ).toBe(204)
    expect((await login('+998935550000', 'first password 1')).statusCode).toBe(401)
    expect((await api('PATCH', `/staff/${s.id}`, owner.write, { disabled: true })).json().disabled).toBe(true)
    expect((await login('+998935550000', 'new password 22')).statusCode).toBe(401)

    expect((await api('PATCH', `/staff/${owner.id}`, owner.write, { disabled: true })).json().code).toBe('OWNER_LOCKED')
    expect(
      (await api('PATCH', `/staff/${owner.id}`, owner.write, { roleId: await roleId('Оператор') })).json().code
    ).toBe('OWNER_LOCKED')
  })
})
