import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { seedDemoLots } from '../src/scripts/demo-lots'
import { cleanDb, createLot } from './factories'

const db = new PrismaClient()

describe('Тестовые лоты демо-стенда', () => {
  beforeEach(() => cleanDb(db))
  afterAll(() => db.$disconnect())

  it('заводит лоты: два открываются сразу (через расписание), остальные — на следующую сессию', async () => {
    const now = new Date('2026-11-14T08:00:00Z') // суббота
    const r = await seedDemoLots(db, now)
    expect(r.created).toBe(5)
    const lots = await db.lot.findMany({ orderBy: { opensAt: 'asc' } })
    expect(lots).toHaveLength(5)
    // статус меняет только расписание: все заводятся как SCHEDULED, без допусков и предложений
    expect(lots.every((l) => l.status === 'SCHEDULED' && l.admittedCount === 0 && l.currentPrice === null)).toBe(true)
    const openNow = lots.filter((l) => l.opensAt <= now)
    expect(openNow).toHaveLength(2)
    expect(openNow.every((l) => l.closesAt > now)).toBe(true)
    const later = lots.filter((l) => l.opensAt > now)
    expect(later.every((l) => l.opensAt >= openNow[0].closesAt)).toBe(true)
    expect(lots.every((l) => l.startPrice > 0n && l.step === 100_000n && l.fee === 12_000n)).toBe(true)
  })

  it('не трогает базу, если уже есть идущие или запланированные лоты', async () => {
    await createLot(db)
    await expect(seedDemoLots(db, new Date())).rejects.toThrow(/уже есть/)
    expect(await db.lot.count()).toBe(1)
  })
})
