import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FakeClock } from '../src/common/clock'
import { ObligationsService } from '../src/modules/fulfillment/obligations.service'
import type { PrismaService } from '../src/prisma/prisma.service'
import { loginAs, startApp } from './app'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()
const CLOSE = new Date('2026-11-20T13:00:00Z') // пт 18:00 Ташкент
const clock = new FakeClock(CLOSE)
const obligations = new ObligationsService(db as unknown as PrismaService, clock)

async function winnerObligation(userId?: string) {
  const lot = await createLot(db, { status: 'CLOSED_SOLD', opensAt: new Date('2026-11-20T04:00:00Z'), closesAt: CLOSE })
  const uid = userId ?? (await createUser(db)).id
  const bid = await db.bid.create({
    data: { lotId: lot.id, userId: uid, amount: 4_100_000n, seq: 1, idempotencyKey: key() },
  })
  return db.obligation.create({
    data: {
      lotId: lot.id,
      userId: uid,
      bidId: bid.id,
      rank: 1,
      amount: 4_100_000n,
      prepaymentAmount: 1_230_000n,
      confirmDeadline: new Date(CLOSE.getTime() + 15 * 60_000),
    },
  })
}

describe('Подтверждение покупки победителем', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(async () => {
    await cleanDb(db)
    clock.set(CLOSE)
  })
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  it('в течение 15 минут: продажа заключена, срок оплаты 30% — 2 часа; повтор не меняет сроки', async () => {
    const ob = await winnerObligation()
    clock.set('2026-11-20T13:10:00Z')
    const r = await obligations.confirm(ob.userId, ob.id)
    expect(r).toMatchObject({ status: 'AWAITING_PREPAYMENT', prepaymentAmount: '1230000' })
    expect(r.prepaymentDeadline).toBe('2026-11-20T15:10:00.000Z')
    clock.set('2026-11-20T13:12:00Z')
    expect((await obligations.confirm(ob.userId, ob.id)).prepaymentDeadline).toBe('2026-11-20T15:10:00.000Z')
    expect(await db.outboxEvent.count({ where: { type: 'obligation.confirmed' } })).toBe(1)
  })

  it('после 15 минут подтвердить нельзя', async () => {
    const ob = await winnerObligation()
    clock.set('2026-11-20T13:15:00Z')
    await expect(obligations.confirm(ob.userId, ob.id)).rejects.toMatchObject({ response: { code: 'CONFIRM_EXPIRED' } })
  })

  it('HTTP: свои предложения видны в профиле; чужое подтвердить нельзя', async () => {
    const a = await loginAs(app, 930_001)
    const ob = await winnerObligation(a.userId)
    const mine = (await app.inject({ method: 'GET', url: '/api/v1/me/obligations', headers: a.auth })).json()
    expect(mine).toEqual([expect.objectContaining({ id: ob.id, status: 'AWAITING_CONFIRMATION', amount: '4100000' })])
    const b = await loginAs(app, 930_002)
    expect(
      (await app.inject({ method: 'POST', url: `/api/v1/obligations/${ob.id}/confirm`, headers: b.auth })).statusCode
    ).toBe(403)
  })
})
