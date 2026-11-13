import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FakeClock } from '../src/common/clock'
import { BidRejectedError } from '../src/modules/auctions/bid.errors'
import { BidsService } from '../src/modules/auctions/bids.service'
import type { PrismaService } from '../src/prisma/prisma.service'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()
const OPEN = new Date('2026-11-20T04:00:00Z')
const CLOSE = new Date('2026-11-20T13:00:00Z')
const clock = new FakeClock(new Date('2026-11-20T10:00:00Z'))
const bids = new BidsService(db as unknown as PrismaService, clock)
const M = (n: number) => BigInt(Math.round(n * 1_000_000))

async function admitted(lotId: string) {
  const u = await createUser(db)
  const o = await db.order.create({
    data: { userId: u.id, lotId, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID' },
  })
  await db.admission.create({ data: { lotId, userId: u.id, orderId: o.id } })
  return u
}
const lotState = (id: string) => db.lot.findUniqueOrThrow({ where: { id } })
const history = async (lotId: string) =>
  (await db.bid.findMany({ where: { lotId }, orderBy: { seq: 'asc' } })).map(
    (b) => [b.seq, b.userId, b.amount] as const
  )

describe('Автопредложение до максимума', () => {
  beforeEach(async () => {
    await cleanDb(db)
    clock.set('2026-11-20T10:00:00Z')
  })
  afterAll(() => db.$disconnect())
  const liveLot = () => createLot(db, { opensAt: OPEN, closesAt: CLOSE, startPrice: M(2), step: M(0.1) })

  it('перебивает ручное предложение минимально нужной суммой', async () => {
    const lot = await liveLot()
    const [a, b] = [await admitted(lot.id), await admitted(lot.id)]
    await bids.setAutoBid(a.id, lot.id, M(2.5)) // сразу предлагает старт за A
    expect((await lotState(lot.id)).leaderUserId).toBe(a.id)
    await bids.placeBid(b.id, lot.id, M(2.1), key())
    const s = await lotState(lot.id)
    expect(s.leaderUserId).toBe(a.id)
    expect(s.currentPrice).toBe(M(2.2))
  })

  it('два автопредложения: побеждает больший максимум по цене «второй максимум + шаг»', async () => {
    const lot = await liveLot()
    const [a, b, c] = [await admitted(lot.id), await admitted(lot.id), await admitted(lot.id)]
    await bids.placeBid(c.id, lot.id, M(2), key())
    await bids.setAutoBid(a.id, lot.id, M(3))
    await bids.setAutoBid(b.id, lot.id, M(2.6))
    const s = await lotState(lot.id)
    expect(s.leaderUserId).toBe(a.id)
    expect(s.currentPrice).toBe(M(2.7))
    const seqs = (await history(lot.id)).map(([seq]) => seq)
    expect(seqs).toEqual(seqs.map((_, i) => i + 1)) // номера подряд
  })

  it('равные максимумы — выигрывает тот, кто установил раньше', async () => {
    const lot = await liveLot()
    const [a, b, c] = [await admitted(lot.id), await admitted(lot.id), await admitted(lot.id)]
    await bids.placeBid(c.id, lot.id, M(2), key())
    await bids.setAutoBid(a.id, lot.id, M(2.5))
    await new Promise((r) => setTimeout(r, 5))
    await bids.setAutoBid(b.id, lot.id, M(2.5))
    const s = await lotState(lot.id)
    expect(s.leaderUserId).toBe(a.id)
    expect(s.currentPrice).toBe(M(2.5))
  })

  it('максимум, заданный до открытия, начинает работать в 09:00', async () => {
    const lot = await createLot(db, {
      status: 'SCHEDULED',
      opensAt: OPEN,
      closesAt: CLOSE,
      startPrice: M(2),
      step: M(0.1),
    })
    const a = await admitted(lot.id)
    clock.set('2026-11-20T03:00:00Z')
    await bids.setAutoBid(a.id, lot.id, M(3))
    expect(await db.bid.count()).toBe(0)
    await db.lot.update({ where: { id: lot.id }, data: { status: 'LIVE' } })
    clock.set(OPEN)
    await bids.runProxies(lot.id)
    const s = await lotState(lot.id)
    expect(s.leaderUserId).toBe(a.id)
    expect(s.currentPrice).toBe(M(2))
  })

  it('ручное предложение выше чужого максимума делает автора лидером; исчерпанный максимум больше не срабатывает', async () => {
    const lot = await liveLot()
    const [a, b] = [await admitted(lot.id), await admitted(lot.id)]
    await bids.setAutoBid(a.id, lot.id, M(2.3))
    await bids.placeBid(b.id, lot.id, M(2.5), key())
    const s = await lotState(lot.id)
    expect(s.leaderUserId).toBe(b.id)
    expect(s.currentPrice).toBe(M(2.5))
  })

  it('без допуска автопредложение не принимается; максимум ниже минимальной цены — отказ', async () => {
    const lot = await liveLot()
    const stranger = await createUser(db)
    await expect(bids.setAutoBid(stranger.id, lot.id, M(3))).rejects.toBeInstanceOf(BidRejectedError)
    const a = await admitted(lot.id)
    await expect(bids.setAutoBid(a.id, lot.id, M(1))).rejects.toMatchObject({ code: 'BID_TOO_LOW' })
  })

  it('отмена: после отмены система больше не предлагает', async () => {
    const lot = await liveLot()
    const [a, b] = [await admitted(lot.id), await admitted(lot.id)]
    await bids.setAutoBid(a.id, lot.id, M(3))
    await bids.cancelAutoBid(a.id, lot.id)
    await bids.placeBid(b.id, lot.id, M(2.1), key())
    expect((await lotState(lot.id)).leaderUserId).toBe(b.id)
  })

  it('автопредложения помечены в ходе торгов (auto: true)', async () => {
    const lot = await liveLot()
    const a = await admitted(lot.id)
    await bids.setAutoBid(a.id, lot.id, M(2.5))
    const ev = await db.outboxEvent.findFirstOrThrow({ where: { type: 'bid.accepted' } })
    expect(ev.payload).toMatchObject({ auto: true, amount: '2000000' })
  })
})
