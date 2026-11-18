import { randomUUID } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loginAs, loginStaff, startApp } from './app'
import { cleanDb, createLot } from './factories'

const db = new PrismaClient()
const tomorrow = () => new Date(Date.now() + 86_400_000)

describe('Участники: выход до начала, ограничения, отмена допуска', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  const scheduled = () =>
    createLot(db, { status: 'SCHEDULED', opensAt: tomorrow(), closesAt: new Date(tomorrow().getTime() + 3_600_000) })

  /** Допуск через настоящий путь — бесплатный (решение 18.11.2026). */
  async function admit(lotId: string, auth: Record<string, string>) {
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/lots/${lotId}/admission`,
      headers: auth,
      payload: { acceptRules: true },
    })
    expect(r.json()).toEqual({ status: 'ADMITTED' })
  }
  /** Допуск, оплаченный взносом до 18.11.2026 (на dev такие есть): при выходе или отмене взнос возвращается. */
  async function legacyPaid(lotId: string, userId: string) {
    const order = await db.order.create({
      data: { userId, lotId, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID', paidAt: new Date() },
    })
    await db.admission.create({ data: { lotId, userId, orderId: order.id } })
    await db.lot.update({ where: { id: lotId }, data: { admittedCount: { increment: 1 } } })
    return order.id
  }
  const leave = (lotId: string, auth: Record<string, string>) =>
    app.inject({ method: 'DELETE', url: `/api/v1/lots/${lotId}/admission`, headers: auth })

  it('участник выходит из лота до начала: место освобождается, можно вернуться; старый оплаченный допуск — с возвратом', async () => {
    const lot = await scheduled()
    const a = await loginAs(app, 940_001)
    await admit(lot.id, a.auth)
    expect((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).admittedCount).toBe(1)

    const r = await leave(lot.id, a.auth)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ refunded: false }) // возвращать нечего — допуск бесплатный
    expect(await db.admission.count()).toBe(0)
    expect((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).admittedCount).toBe(0)
    expect(await db.auditLog.count({ where: { action: 'admission.left' } })).toBe(1)

    expect((await leave(lot.id, a.auth)).statusCode).toBe(404)
    await admit(lot.id, a.auth)
    expect(await db.admission.count()).toBe(1)

    // допуск, оплаченный взносом до 18.11.2026 — взнос возвращается
    const b = await loginAs(app, 940_009)
    const orderId = await legacyPaid(lot.id, b.userId)
    expect((await leave(lot.id, b.auth)).json()).toEqual({ refunded: true })
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('REFUNDED')
  })

  it('после открытия торгов выйти с возвратом нельзя', async () => {
    const lot = await createLot(db) // идёт сейчас
    const a = await loginAs(app, 940_002)
    await admit(lot.id, a.auth)
    const r = await leave(lot.id, a.auth)
    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('LOT_STARTED')
    expect(await db.admission.count()).toBe(1)
  })

  it('ограниченный участник не может оформить допуск (деньги не берём)', async () => {
    const lot = await scheduled()
    const a = await loginAs(app, 940_003)
    await db.restriction.create({
      data: { userId: a.userId, reason: 'тест', startsAt: new Date(Date.now() - 1000), endsAt: tomorrow() },
    })
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/lots/${lot.id}/admission`,
      headers: a.auth,
      payload: { acceptRules: true },
    })
    expect(r.statusCode).toBe(403)
    expect(r.json().code).toBe('RESTRICTED')
    expect(await db.order.count()).toBe(0)
  })

  it('админка: поиск по имени, телефону и Telegram ID; карточка с допусками и ограничениями', async () => {
    const lot = await scheduled()
    const a = await loginAs(app, 940_010, 'Азиз')
    await db.user.update({ where: { id: a.userId }, data: { lastName: 'Каримов', phone: '+998901234567' } })
    await loginAs(app, 940_011, 'Малика')
    await admit(lot.id, a.auth)

    const s = await loginStaff(app, { participants: 'edit' })
    const find = async (q: string) =>
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/admin/participants?q=${encodeURIComponent(q)}`,
          headers: s.read,
        })
      ).json()
    expect((await find('Кари')).map((u: { id: string }) => u.id)).toEqual([a.userId])
    expect((await find('901234')).map((u: { id: string }) => u.id)).toEqual([a.userId])
    expect((await find('940010')).map((u: { id: string }) => u.id)).toEqual([a.userId])
    expect(await find('')).toHaveLength(2)

    const card = (
      await app.inject({ method: 'GET', url: `/api/v1/admin/participants/${a.userId}`, headers: s.read })
    ).json()
    expect(card).toMatchObject({
      id: a.userId,
      firstName: 'Азиз',
      lastName: 'Каримов',
      phone: '+998901234567',
      restriction: null,
    })
    expect(card.admissions).toEqual([expect.objectContaining({ lotId: lot.id, canCancel: true })])
  })

  it('ограничить на срок и снять — только с причиной; ограничение блокирует предложения цены', async () => {
    const live = await createLot(db)
    const a = await loginAs(app, 940_020)
    await admit(live.id, a.auth)
    const s = await loginStaff(app, { participants: 'edit' })
    const url = `/api/v1/admin/participants/${a.userId}/restrictions`

    expect((await app.inject({ method: 'POST', url, headers: s.write, payload: { days: 14 } })).statusCode).toBe(400)
    const r = await app.inject({
      method: 'POST',
      url,
      headers: s.write,
      payload: { days: 14, reason: 'Подозрение на разгон цены' },
    })
    expect(r.statusCode).toBe(201)
    const restriction = r.json()
    expect(Date.parse(restriction.endsAt) - Date.now()).toBeGreaterThan(13.9 * 86_400_000)

    const bid = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/lots/${live.id}/bids`,
        headers: a.auth,
        payload: { amount: '2000000', idempotencyKey: randomUUID() },
      })
    expect((await bid()).json().code).toBe('RESTRICTED')

    const liftUrl = `${url}/${restriction.id}/lift`
    expect((await app.inject({ method: 'POST', url: liftUrl, headers: s.write, payload: {} })).statusCode).toBe(400)
    const lift = await app.inject({
      method: 'POST',
      url: liftUrl,
      headers: s.write,
      payload: { reason: 'Проверка: нарушения нет' },
    })
    expect(lift.statusCode).toBe(200)
    expect(lift.json()).toMatchObject({ liftedBy: s.id, liftReason: 'Проверка: нарушения нет' })
    expect((await bid()).statusCode).toBe(200)
    expect(await db.auditLog.count({ where: { action: { in: ['restriction.created', 'restriction.lifted'] } } })).toBe(
      2
    )
  })

  it('сотрудник отменяет допуск до начала с возвратом (с причиной); после начала — 409; оператору раздел закрыт', async () => {
    const lot = await scheduled()
    const a = await loginAs(app, 940_030)
    const orderId = await legacyPaid(lot.id, a.userId) // старый оплаченный допуск — проверяем и возврат
    const op = await loginStaff(app, { lots: 'edit' })
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/participants', headers: op.read })).statusCode).toBe(
      403
    )

    const s = await loginStaff(app, { participants: 'edit' })
    const url = `/api/v1/admin/participants/${a.userId}/admissions/${lot.id}/cancel`
    expect((await app.inject({ method: 'POST', url, headers: s.write, payload: {} })).statusCode).toBe(400)
    const r = await app.inject({
      method: 'POST',
      url,
      headers: s.write,
      payload: { reason: 'Просьба участника в поддержку' },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ refunded: true })
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('REFUNDED')
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'admission.cancelled' } })
    expect(audit).toMatchObject({ actorId: s.id, reason: 'Просьба участника в поддержку' })

    const live = await createLot(db)
    await admit(live.id, a.auth)
    const late = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/participants/${a.userId}/admissions/${live.id}/cancel`,
      headers: s.write,
      payload: { reason: 'поздно' },
    })
    expect(late.statusCode).toBe(409)
  })
})
