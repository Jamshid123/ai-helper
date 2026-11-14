import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loginStaff, startApp } from './app'
import { cleanDb } from './factories'

const db = new PrismaClient()

describe('Журнал аудита в админке', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  it('новые сверху, с именем сотрудника; фильтр по объекту; только ADMIN', async () => {
    const admin = await loginStaff(app)
    const phones = await db.category.findUniqueOrThrow({ where: { slug: 'phones' } })
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/categories/${phones.id}`,
      headers: admin.write,
      payload: { nameUz: 'Telefon' },
    })

    const all = (await app.inject({ method: 'GET', url: '/api/v1/admin/audit', headers: admin.read })).json()
    expect(all[0]).toMatchObject({
      action: 'category.updated',
      entityType: 'category',
      entityId: phones.id,
      actor: 'Сотрудник',
    })
    expect(Date.parse(all[0].createdAt)).toBeGreaterThanOrEqual(Date.parse(all.at(-1).createdAt))

    const filtered = (
      await app.inject({
        method: 'GET',
        url: `/api/v1/admin/audit?entityType=category&entityId=${phones.id}`,
        headers: admin.read,
      })
    ).json()
    expect(filtered.map((e: { action: string }) => e.action)).toEqual(['category.updated'])

    const op = await loginStaff(app, { lots: 'edit' })
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/audit', headers: op.read })).statusCode).toBe(403)
  })
})
