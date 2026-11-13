import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FakeClock } from '../src/common/clock'
import { RemindersService } from '../src/modules/reminders/reminders.service'
import type { PrismaService } from '../src/prisma/prisma.service'
import { loginAs, startApp } from './app'
import { cleanDb, createLot, createUser } from './factories'

const db = new PrismaClient()
const OPEN = new Date('2026-11-20T04:00:00Z') // пт 09:00 Ташкент
const clock = new FakeClock(new Date('2026-11-19T10:00:00Z'))
const reminders = new RemindersService(db as unknown as PrismaService, clock)

describe('Напоминание о начале торгов', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(async () => {
    await cleanDb(db)
    clock.set('2026-11-19T10:00:00Z')
  })
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  it('HTTP: поставить, посмотреть, отменить; неверный вариант — 400; без входа — 401', async () => {
    const lot = await createLot(db, {
      status: 'SCHEDULED',
      opensAt: new Date(Date.now() + 3 * 86_400_000),
      closesAt: new Date(Date.now() + 3 * 86_400_000 + 3_600_000),
    })
    const url = `/api/v1/lots/${lot.id}/reminder`
    expect((await app.inject({ method: 'PUT', url, payload: { minutesBefore: 60 } })).statusCode).toBe(401)
    const a = await loginAs(app, 920_001)
    expect((await app.inject({ method: 'PUT', url, headers: a.auth, payload: { minutesBefore: 7 } })).statusCode).toBe(
      400
    )
    const set = await app.inject({ method: 'PUT', url, headers: a.auth, payload: { minutesBefore: 60 } })
    expect(set.statusCode).toBe(200)
    expect(set.json().minutesBefore).toBe(60)
    expect((await app.inject({ method: 'GET', url, headers: a.auth })).json()).toMatchObject({
      minutesBefore: 60,
      sent: false,
    })
    expect((await app.inject({ method: 'DELETE', url, headers: a.auth })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url, headers: a.auth })).json()).toBeNull()
  })

  it('нельзя поставить, если до начала меньше выбранного времени', async () => {
    const lot = await createLot(db, { status: 'SCHEDULED', opensAt: OPEN, closesAt: new Date('2026-11-20T13:00:00Z') })
    const u = await createUser(db)
    clock.set('2026-11-20T03:30:00Z') // за 30 минут до начала
    await expect(reminders.set(u.id, lot.id, 60)).rejects.toMatchObject({ response: { code: 'REMINDER_TOO_LATE' } })
    await expect(reminders.set(u.id, lot.id, 15)).resolves.toMatchObject({ minutesBefore: 15 })
  })

  it('отправляется ровно один раз в нужное время, даже при параллельных проходах', async () => {
    const lot = await createLot(db, { status: 'SCHEDULED', opensAt: OPEN, closesAt: new Date('2026-11-20T13:00:00Z') })
    const users = await Promise.all([createUser(db), createUser(db)])
    await reminders.set(users[0].id, lot.id, 60)
    await reminders.set(users[1].id, lot.id, 15)

    clock.set('2026-11-20T02:59:59Z')
    expect(await reminders.dispatchDue()).toBe(0)
    clock.set('2026-11-20T03:00:00Z') // за час
    const counts = await Promise.all([reminders.dispatchDue(), reminders.dispatchDue()])
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1)
    clock.set('2026-11-20T03:45:00Z') // за 15 минут
    expect(await reminders.dispatchDue()).toBe(1)
    expect(await reminders.dispatchDue()).toBe(0)
    const events = await db.outboxEvent.findMany({ where: { type: 'reminder.due' } })
    expect(events).toHaveLength(2)
    expect(events.map((e) => (e.payload as { minutesBefore: number }).minutesBefore).sort()).toEqual([15, 60])
  })

  it('по отменённому лоту напоминание не уходит', async () => {
    const lot = await createLot(db, { status: 'SCHEDULED', opensAt: OPEN, closesAt: new Date('2026-11-20T13:00:00Z') })
    const u = await createUser(db)
    await reminders.set(u.id, lot.id, 60)
    await db.lot.update({ where: { id: lot.id }, data: { status: 'CANCELLED' } })
    clock.set('2026-11-20T03:30:00Z')
    expect(await reminders.dispatchDue()).toBe(0)
  })
})
