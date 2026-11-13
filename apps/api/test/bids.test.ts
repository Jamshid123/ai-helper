import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FakeClock } from '../src/common/clock'
import { BidRejectedError } from '../src/modules/auctions/bid.errors'
import { BidsService } from '../src/modules/auctions/bids.service'
import type { PrismaService } from '../src/prisma/prisma.service'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()
// Пятница 20.11.2026, Ташкент UTC+5: 09:00 = 04:00Z, 18:00 = 13:00Z
const OPEN = new Date('2026-11-20T04:00:00Z')
const CLOSE = new Date('2026-11-20T13:00:00Z')
const clock = new FakeClock(new Date('2026-11-20T10:00:00Z'))
const bids = new BidsService(db as unknown as PrismaService, clock)

async function admitted(lotId: string) {
  const u = await createUser(db)
  const o = await db.order.create({
    data: { userId: u.id, lotId, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID' },
  })
  await db.admission.create({ data: { lotId, userId: u.id, orderId: o.id } })
  return u
}

async function rejected(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    if (e instanceof BidRejectedError) return e
    throw e
  }
  throw new Error('expected rejection')
}

describe('BidsService.placeBid — сценарии приёмки ТЗ', () => {
  beforeEach(async () => {
    await cleanDb(db)
    clock.set('2026-11-20T10:00:00Z')
  })
  afterAll(() => db.$disconnect())

  const liveLot = () => createLot(db, { opensAt: OPEN, closesAt: CLOSE, startPrice: 2_000_000n, step: 100_000n })

  it('первое предложение — не ниже старта; пример ТЗ: после 2 000 000 минимум 2 100 000', async () => {
    const lot = await liveLot()
    const [a, b] = [await admitted(lot.id), await admitted(lot.id)]
    expect((await rejected(bids.placeBid(a.id, lot.id, 1_900_000n, key()))).code).toBe('BID_TOO_LOW')
    const r = await bids.placeBid(a.id, lot.id, 2_000_000n, key())
    expect(r.minNextBid).toBe(2_100_000n)
    const e = await rejected(bids.placeBid(b.id, lot.id, 2_050_000n, key()))
    expect(e.code).toBe('BID_TOO_LOW')
    expect(e.minBid).toBe(2_100_000n)
  })

  it('из двух одновременных одинаковых предложений принимается ровно одно', async () => {
    const lot = await liveLot()
    const users = await Promise.all(Array.from({ length: 5 }, () => admitted(lot.id)))
    const results = await Promise.allSettled(users.map((u) => bids.placeBid(u.id, lot.id, 2_000_000n, key())))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const losers = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(losers.every((r) => r.reason instanceof BidRejectedError && r.reason.code === 'BID_TOO_LOW')).toBe(true)
    expect(await db.bid.count({ where: { lotId: lot.id } })).toBe(1)
  })

  it('номера предложений идут подряд без пропусков при конкуренции', async () => {
    const lot = await liveLot()
    const users = await Promise.all(Array.from({ length: 6 }, () => admitted(lot.id)))
    // разные суммы — все валидны, если приходят по возрастанию; принятые получают seq 1..N подряд
    await Promise.allSettled(users.map((u, i) => bids.placeBid(u.id, lot.id, 2_000_000n + BigInt(i) * 500_000n, key())))
    const seqs = (await db.bid.findMany({ where: { lotId: lot.id }, orderBy: { seq: 'asc' } })).map((b) => b.seq)
    expect(seqs).toEqual(seqs.map((_, i) => i + 1))
    const fresh = await db.lot.findUniqueOrThrow({ where: { id: lot.id } })
    expect(fresh.lastSeq).toBe(seqs.length)
  })

  it('повтор запроса с тем же ключом возвращает исходный результат без дубля', async () => {
    const lot = await liveLot()
    const a = await admitted(lot.id)
    const k = key()
    const first = await bids.placeBid(a.id, lot.id, 2_000_000n, k)
    const again = await bids.placeBid(a.id, lot.id, 2_000_000n, k)
    expect(again.replayed).toBe(true)
    expect(again.bid.id).toBe(first.bid.id)
    // одновременные повторы с одним ключом
    const k2 = key()
    const b = await admitted(lot.id)
    const pair = await Promise.all([
      bids.placeBid(b.id, lot.id, 2_100_000n, k2),
      bids.placeBid(b.id, lot.id, 2_100_000n, k2),
    ])
    expect(pair[0].bid.id).toBe(pair[1].bid.id)
    expect(await db.bid.count({ where: { lotId: lot.id } })).toBe(2)
  })

  it('предложение в 18:00:00 отклоняется, в 17:59:59 — принимается', async () => {
    const lot = await liveLot()
    const [a, b] = [await admitted(lot.id), await admitted(lot.id)]
    clock.set('2026-11-20T12:59:59Z')
    await expect(bids.placeBid(a.id, lot.id, 2_000_000n, key())).resolves.toMatchObject({ replayed: false })
    clock.set(CLOSE)
    expect((await rejected(bids.placeBid(b.id, lot.id, 2_100_000n, key()))).code).toBe('LOT_CLOSED')
  })

  it('без допуска предложить цену нельзя', async () => {
    const lot = await liveLot()
    const stranger = await createUser(db)
    expect((await rejected(bids.placeBid(stranger.id, lot.id, 2_000_000n, key()))).code).toBe('NO_ADMISSION')
  })

  it('до открытия и в не-LIVE статусе — отказ', async () => {
    const lot = await liveLot()
    const a = await admitted(lot.id)
    clock.set('2026-11-20T03:59:59Z')
    expect((await rejected(bids.placeBid(a.id, lot.id, 2_000_000n, key()))).code).toBe('LOT_NOT_LIVE')
    clock.set('2026-11-20T10:00:00Z')
    await db.lot.update({ where: { id: lot.id }, data: { status: 'UNDER_REVIEW' } })
    expect((await rejected(bids.placeBid(a.id, lot.id, 2_000_000n, key()))).code).toBe('LOT_NOT_LIVE')
  })

  it('активное ограничение (невыкуп) блокирует предложения; снятое — нет', async () => {
    const lot = await liveLot()
    const a = await admitted(lot.id)
    const r = await db.restriction.create({
      data: {
        userId: a.id,
        reason: 'no_buyout',
        startsAt: new Date('2026-11-01T00:00:00Z'),
        endsAt: new Date('2026-12-21T00:00:00Z'),
      },
    })
    expect((await rejected(bids.placeBid(a.id, lot.id, 2_000_000n, key()))).code).toBe('RESTRICTED')
    await db.restriction.update({
      where: { id: r.id },
      data: { liftedAt: new Date(), liftedBy: 'support', liftReason: 'принятая жалоба' },
    })
    await expect(bids.placeBid(a.id, lot.id, 2_000_000n, key())).resolves.toMatchObject({ replayed: false })
  })

  it('лидер не перебивает сам себя', async () => {
    const lot = await liveLot()
    const a = await admitted(lot.id)
    await bids.placeBid(a.id, lot.id, 2_000_000n, key())
    expect((await rejected(bids.placeBid(a.id, lot.id, 2_100_000n, key()))).code).toBe('ALREADY_LEADING')
  })

  it('принятое предложение пишет событие в outbox в той же транзакции', async () => {
    const lot = await liveLot()
    const a = await admitted(lot.id)
    await bids.placeBid(a.id, lot.id, 2_000_000n, key())
    const ev = await db.outboxEvent.findFirstOrThrow({ where: { aggregateId: lot.id } })
    expect(ev.type).toBe('bid.accepted')
    expect(ev.payload).toMatchObject({ seq: 1, amount: '2000000', publicName: a.publicName })
    expect(ev.publishedAt).toBeNull()
  })
})
