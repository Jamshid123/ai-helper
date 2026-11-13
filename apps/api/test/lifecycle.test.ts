import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FakeClock } from '../src/common/clock'
import { BidsService } from '../src/modules/auctions/bids.service'
import { LotLifecycleService } from '../src/modules/auctions/lot-lifecycle.service'
import type { PrismaService } from '../src/prisma/prisma.service'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()
const OPEN = new Date('2026-11-20T04:00:00Z') // пт 09:00 Ташкент
const CLOSE = new Date('2026-11-20T13:00:00Z') // пт 18:00 Ташкент
const clock = new FakeClock(OPEN)
const lifecycle = new LotLifecycleService(db as unknown as PrismaService, clock)

async function bid(lotId: string, amount: bigint, seq: number) {
  const u = await createUser(db)
  return db.bid.create({ data: { lotId, userId: u.id, amount, seq, idempotencyKey: key() } })
}

describe('Жизненный цикл лота', () => {
  beforeEach(() => cleanDb(db))
  afterAll(() => db.$disconnect())

  it('в 09:00 запланированный лот открывается автоматически, раньше — нет', async () => {
    const lot = await createLot(db, { status: 'SCHEDULED', opensAt: OPEN, closesAt: CLOSE })
    clock.set('2026-11-20T03:59:59Z')
    expect(await lifecycle.openDue()).toEqual([])
    clock.set(OPEN)
    expect(await lifecycle.openDue()).toEqual([lot.id])
    expect((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe('LIVE')
    expect(await db.outboxEvent.count({ where: { type: 'lot.opened' } })).toBe(1)
  })

  it('закрытие: побеждает максимальная сумма, обязательство 30% и срок 15 минут', async () => {
    const lot = await createLot(db, { opensAt: OPEN, closesAt: CLOSE })
    await bid(lot.id, 2_000_000n, 1)
    const best = await bid(lot.id, 2_400_000n, 2)
    clock.set(CLOSE)
    expect(await lifecycle.close(lot.id)).toBe('CLOSED_SOLD')
    const ob = await db.obligation.findFirstOrThrow({ where: { lotId: lot.id } })
    expect(ob).toMatchObject({
      userId: best.userId,
      rank: 1,
      amount: 2_400_000n,
      prepaymentAmount: 720_000n,
      status: 'AWAITING_PREPAYMENT',
    })
    expect(ob.prepaymentDeadline.toISOString()).toBe('2026-11-20T13:15:00.000Z')
  })

  it('без предложений — закрытие без продажи, обязательств нет', async () => {
    const lot = await createLot(db, { opensAt: OPEN, closesAt: CLOSE })
    clock.set(CLOSE)
    expect(await lifecycle.close(lot.id)).toBe('CLOSED_UNSOLD')
    expect(await db.obligation.count()).toBe(0)
  })

  it('перезапуск закрытия (в т.ч. одновременный) создаёт ровно одно обязательство', async () => {
    const lot = await createLot(db, { opensAt: OPEN, closesAt: CLOSE })
    await bid(lot.id, 2_000_000n, 1)
    clock.set(CLOSE)
    const [a, b, due] = await Promise.all([lifecycle.close(lot.id), lifecycle.close(lot.id), lifecycle.closeDue()])
    const all = [a, b, ...Object.values(due)]
    expect(all.filter((o) => o === 'CLOSED_SOLD')).toHaveLength(1)
    expect(await lifecycle.close(lot.id)).toBe('SKIPPED')
    expect(await db.obligation.count()).toBe(1)
    expect(await db.outboxEvent.count({ where: { type: 'obligation.created' } })).toBe(1)
  })

  it('до 18:00 закрытие не выполняется', async () => {
    const lot = await createLot(db, { opensAt: OPEN, closesAt: CLOSE })
    clock.set('2026-11-20T12:59:59Z')
    expect(await lifecycle.close(lot.id)).toBe('SKIPPED')
    expect((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe('LIVE')
  })
})

describe('LifecycleScheduler.tick', () => {
  it('один проход sweep открывает и закрывает лоты; параллельный проход не дублирует работу', async () => {
    const { LifecycleScheduler } = await import('../src/modules/auctions/lifecycle.scheduler')
    await cleanDb(db)
    const env = { SCHEDULER_ENABLED: false, SCHEDULER_INTERVAL_MS: 5000 } as never
    const bidsSvc = new BidsService(db as unknown as PrismaService, clock)
    const s1 = new LifecycleScheduler(env, db as unknown as PrismaService, lifecycle, bidsSvc)
    const s2 = new LifecycleScheduler(env, db as unknown as PrismaService, lifecycle, bidsSvc)
    const toOpen = await createLot(db, { status: 'SCHEDULED', opensAt: OPEN, closesAt: CLOSE })
    clock.set(OPEN)
    await Promise.all([s1.tick(), s2.tick()])
    expect((await db.lot.findUniqueOrThrow({ where: { id: toOpen.id } })).status).toBe('LIVE')
    expect(await db.outboxEvent.count({ where: { type: 'lot.opened' } })).toBe(1)
  })
})
