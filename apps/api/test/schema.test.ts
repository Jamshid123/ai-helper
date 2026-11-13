import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()

describe('гарантии схемы БД (последняя линия защиты)', () => {
  beforeEach(() => cleanDb(db))
  afterAll(() => db.$disconnect())

  it('порядковый номер предложения уникален в пределах лота', async () => {
    const [lot, u] = await Promise.all([createLot(db), createUser(db)])
    await db.bid.create({ data: { lotId: lot.id, userId: u.id, amount: 2_000_000n, seq: 1, idempotencyKey: key() } })
    await expect(
      db.bid.create({ data: { lotId: lot.id, userId: u.id, amount: 2_100_000n, seq: 1, idempotencyKey: key() } })
    ).rejects.toThrow(/Unique constraint/)
  })

  it('ключ идемпотентности уникален для пользователя', async () => {
    const [lot, u] = await Promise.all([createLot(db), createUser(db)])
    const k = key()
    await db.bid.create({ data: { lotId: lot.id, userId: u.id, amount: 2_000_000n, seq: 1, idempotencyKey: k } })
    await expect(
      db.bid.create({ data: { lotId: lot.id, userId: u.id, amount: 2_100_000n, seq: 2, idempotencyKey: k } })
    ).rejects.toThrow(/Unique constraint/)
  })

  it('ровно один допуск на пару (лот, пользователь)', async () => {
    const [lot, u] = await Promise.all([createLot(db), createUser(db)])
    const order = () =>
      db.order.create({
        data: { userId: u.id, lotId: lot.id, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake' },
      })
    const [o1, o2] = await Promise.all([order(), order()])
    await db.admission.create({ data: { lotId: lot.id, userId: u.id, orderId: o1.id } })
    await expect(db.admission.create({ data: { lotId: lot.id, userId: u.id, orderId: o2.id } })).rejects.toThrow(
      /Unique constraint/
    )
  })

  it('одно обязательство на место в очереди выкупа', async () => {
    const [lot, u] = await Promise.all([createLot(db), createUser(db)])
    const bid = await db.bid.create({
      data: { lotId: lot.id, userId: u.id, amount: 2_000_000n, seq: 1, idempotencyKey: key() },
    })
    const data = {
      lotId: lot.id,
      userId: u.id,
      bidId: bid.id,
      rank: 1,
      amount: 2_000_000n,
      prepaymentAmount: 600_000n,
      prepaymentDeadline: new Date(),
    }
    await db.obligation.create({ data })
    await expect(db.obligation.create({ data })).rejects.toThrow(/Unique constraint/)
  })

  it('повторный providerTxId не создаёт второй оплаченный заказ', async () => {
    const [lot, u] = await Promise.all([createLot(db), createUser(db)])
    const data = {
      userId: u.id,
      lotId: lot.id,
      purpose: 'ADMISSION' as const,
      amount: 12_000n,
      provider: 'fake',
      providerTxId: 'tx-1',
    }
    await db.order.create({ data })
    await expect(db.order.create({ data })).rejects.toThrow(/Unique constraint/)
  })

  it('CHECK: суммы положительные, окно торгов корректное, цена не ниже старта', async () => {
    await expect(createLot(db, { step: 0n })).rejects.toThrow(/Lot_money_positive/)
    const now = Date.now()
    await expect(createLot(db, { opensAt: new Date(now), closesAt: new Date(now - 1) })).rejects.toThrow(
      /Lot_window_valid/
    )
    await expect(createLot(db, { currentPrice: 1_000n })).rejects.toThrow(/Lot_current_ge_start/)
  })
})
