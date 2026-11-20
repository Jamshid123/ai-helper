import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { periodStart } from '../src/modules/admin/admin-overview.controller'
import { loginStaff, startApp } from './app'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()

describe('Админка: «Обзор» (ТЗ 20.11.2026)', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  const get = (url: string, headers: Record<string, string>) =>
    app.inject({ method: 'GET', url: `/api/v1/admin/overview${url}`, headers })

  const obligation = async (data: Record<string, unknown>) => {
    const user = await createUser(db)
    const lot = await createLot(db, { status: 'CLOSED_SOLD', closedAt: new Date() })
    const bid = await db.bid.create({
      data: { lotId: lot.id, userId: user.id, amount: 3_000_000n, seq: 1, idempotencyKey: key() },
    })
    return db.obligation.create({
      data: {
        lotId: lot.id,
        userId: user.id,
        bidId: bid.id,
        rank: 1,
        amount: 3_000_000n,
        prepaymentAmount: 300_000n,
        confirmDeadline: new Date(),
        status: 'AWAITING_PICKUP',
        ...data,
      },
    })
  }

  it('начало периода — полночь по Ташкенту (UTC+5)', () => {
    // 20.11 03:00 по Ташкенту = 19.11 22:00 UTC
    const now = new Date('2026-11-19T22:00:00Z')
    expect(periodStart('today', now).toISOString()).toBe('2026-11-19T19:00:00.000Z')
    expect(periodStart('7d', now).toISOString()).toBe('2026-11-13T19:00:00.000Z')
    expect(periodStart('30d', now).toISOString()).toBe('2026-10-21T19:00:00.000Z')
  })

  it('торги: идущие с фактическим окончанием и ближайшие предстоящие; без права на лоты — 403', async () => {
    const now = Date.now()
    const live = await createLot(db, {
      status: 'LIVE',
      closesAt: new Date(now + 3_600_000),
      lastBidAt: new Date(now - 30_000),
      bidTimeoutSec: 300,
      currentPrice: 2_500_000n,
    })
    await createLot(db, { status: 'SCHEDULED', opensAt: new Date(now + 86_400_000), closesAt: new Date(now + 90_000_000) })
    await createLot(db, { status: 'DRAFT' })

    const owner = await loginStaff(app)
    const r = (await get('/auctions', owner.read)).json()
    expect(r.live).toHaveLength(1)
    expect(r.live[0]).toMatchObject({ id: live.id, currentPrice: '2500000' })
    // нет нового предложения 5 минут — торги закончатся раньше назначенного
    expect(Date.parse(r.live[0].endsAt)).toBe(live.lastBidAt!.getTime() + 300_000)
    expect(r.upcoming).toHaveLength(1)
    expect(typeof r.serverTime).toBe('string')

    const cashier = await loginStaff(app, { fulfillment: 'edit' })
    expect((await get('/auctions', cashier.read)).statusCode).toBe(403)
  })

  it('«требуют внимания» — только необработанные и только по правам сотрудника', async () => {
    await obligation({ status: 'AWAITING_PICKUP' })
    await obligation({ status: 'COMPLETED', completedAt: new Date() })
    await obligation({ status: 'EXPIRED', expiredReason: 'PICKUP_MISSED', prepaymentDecision: 'PENDING' })
    await obligation({ status: 'EXPIRED', expiredReason: 'PICKUP_MISSED', prepaymentDecision: 'REFUNDED' })
    await createLot(db, { status: 'DRAFT' })

    const owner = await loginStaff(app)
    expect((await get('/attention', owner.read)).json()).toEqual({
      awaitingPickup: 1,
      awaitingPrepayment: 0,
      prepaymentDecisions: 1,
      drafts: 1,
      underReview: 0,
    })

    // кассир выдачи не видит решений финансов и лотов — ключей нет совсем
    const cashier = await loginStaff(app, { fulfillment: 'view' })
    expect((await get('/attention', cashier.read)).json()).toEqual({ awaitingPickup: 1, awaitingPrepayment: 0 })
  })

  it('показатели за период; суммы — только с правом финансов, пользователи — с правом на участников', async () => {
    await createUser(db)
    await createUser(db, { createdAt: new Date(Date.now() - 40 * 86_400_000) })
    await obligation({ status: 'COMPLETED', completedAt: new Date() })
    await obligation({ status: 'COMPLETED', completedAt: new Date(Date.now() - 40 * 86_400_000) })

    const owner = await loginStaff(app)
    const m = (await get('/metrics?period=30d', owner.read)).json()
    // createUser в obligation() — ещё 2 покупателя «сегодня»
    expect(m).toMatchObject({ period: '30d', usersTotal: 4, usersNew: 3, purchasesCompleted: 1, completedAmount: '3000000' })
    expect(m.lotsSold).toBe(2)

    const operator = await loginStaff(app, { lots: 'view' })
    const o = (await get('/metrics?period=nonsense', operator.read)).json()
    expect(o.period).toBe('7d')
    expect(Object.keys(o).sort()).toEqual(['from', 'lotsSold', 'period', 'to'])
  })

  it('без входа — 401', async () => {
    expect((await get('/attention', {})).statusCode).toBe(401)
  })
})
