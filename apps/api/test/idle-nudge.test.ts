import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FakeClock } from '../src/common/clock'
import { RemindersService } from '../src/modules/reminders/reminders.service'
import type { PrismaService } from '../src/prisma/prisma.service'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()
const T0 = new Date('2026-11-20T05:00:00Z')
const clock = new FakeClock(T0)
const reminders = new RemindersService(db as unknown as PrismaService, clock)
const at = (min: number) => new Date(T0.getTime() + min * 60_000)

async function admitted(lotId: string) {
  const u = await createUser(db)
  const o = await db.order.create({
    data: { userId: u.id, lotId, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID' },
  })
  await db.admission.create({ data: { lotId, userId: u.id, orderId: o.id } })
  return u
}

async function bid(lotId: string, userId: string, amount: bigint, seq: number, min: number) {
  await db.bid.create({ data: { lotId, userId, amount, seq, idempotencyKey: key(), createdAt: at(min) } })
  await db.lot.update({
    where: { id: lotId },
    data: { currentPrice: amount, leaderUserId: userId, lastSeq: seq, lastBidAt: at(min) },
  })
}

describe('Напоминание «готовы предложить больше?» через 30 минут (решение 14.11.2026)', () => {
  beforeEach(async () => {
    await cleanDb(db)
    clock.set(T0)
  })
  afterAll(() => db.$disconnect())

  it('перебитому участнику — одно событие на лот через 30 минут после его предложения; лидеру — нет', async () => {
    const lot = await createLot(db, { opensAt: T0, closesAt: at(240), startPrice: 2_000_000n, step: 100_000n })
    const [a, b] = [await admitted(lot.id), await admitted(lot.id)]
    const silent = await admitted(lot.id) // не предлагал — не напоминаем
    await bid(lot.id, a.id, 2_000_000n, 1, 0)
    await bid(lot.id, b.id, 2_100_000n, 2, 10)

    clock.set(at(29))
    expect(await reminders.dispatchIdleBidders()).toBe(0)
    clock.set(at(30))
    expect(await reminders.dispatchIdleBidders()).toBe(1)
    clock.set(at(90)) // лидер b тоже молчит 30+ минут, но он лидер; a — уже напомнили
    expect(await reminders.dispatchIdleBidders()).toBe(0)

    const ev = await db.outboxEvent.findMany({ where: { type: 'bid.nudge' } })
    expect(ev).toHaveLength(1)
    expect(ev[0].payload).toMatchObject({ lotId: lot.id, userId: a.id, currentPrice: '2100000' })
    expect(ev.some((e) => (e.payload as { userId: string }).userId === silent.id)).toBe(false)
  })

  it('после окончания торгов не напоминаем; параллельные проходы не дублируют', async () => {
    const lot = await createLot(db, { opensAt: T0, closesAt: at(60), startPrice: 2_000_000n, step: 100_000n })
    const [a, b] = [await admitted(lot.id), await admitted(lot.id)]
    await bid(lot.id, a.id, 2_000_000n, 1, 0)
    await bid(lot.id, b.id, 2_100_000n, 2, 5)
    clock.set(at(30))
    const [x, y] = await Promise.all([reminders.dispatchIdleBidders(), reminders.dispatchIdleBidders()])
    expect(x + y).toBe(1)

    const ended = await createLot(db, { opensAt: T0, closesAt: at(20), startPrice: 2_000_000n, step: 100_000n })
    const [c, d] = [await admitted(ended.id), await admitted(ended.id)]
    await bid(ended.id, c.id, 2_000_000n, 1, 0)
    await bid(ended.id, d.id, 2_100_000n, 2, 1)
    expect(await reminders.dispatchIdleBidders()).toBe(0)
  })
})
