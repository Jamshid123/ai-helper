import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PaymentsService } from '../src/modules/payments/payments.service'
import type { PrismaService } from '../src/prisma/prisma.service'
import { loginAs, startApp } from './app'
import { cleanDb, createLot, createUser } from './factories'

const db = new PrismaClient()
const payments = new PaymentsService(db as unknown as PrismaService)

describe('Допуск и подтверждение оплаты', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  const pendingOrder = (userId: string, lotId: string, amount = 12_000n) =>
    db.order.create({ data: { userId, lotId, purpose: 'ADMISSION', amount, provider: 'fake' } })

  it('HTTP: правила обязательны; сумма — взнос лота (считает сервер); оплата → ровно один допуск', async () => {
    const lot = await createLot(db, { fee: 12_000n })
    const a = await loginAs(app, 910_001)
    const url = `/api/v1/lots/${lot.id}/admission`
    expect((await app.inject({ method: 'POST', url, headers: a.auth, payload: {} })).statusCode).toBe(400)

    const start = (await app.inject({ method: 'POST', url, headers: a.auth, payload: { acceptRules: true } })).json()
    expect(start).toMatchObject({ status: 'PAYMENT_REQUIRED', amount: '12000' })
    const again = (await app.inject({ method: 'POST', url, headers: a.auth, payload: { acceptRules: true } })).json()
    expect(again.orderId).toBe(start.orderId) // неоплаченный заказ переиспользуется

    const pay = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/fake/${start.orderId}/complete`,
      headers: a.auth,
    })
    expect(pay.json()).toEqual({ outcome: 'ADMITTED' })
    const repeat = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/fake/${start.orderId}/complete`,
      headers: a.auth,
    })
    expect(repeat.json()).toEqual({ outcome: 'ALREADY_PROCESSED' })

    expect(await db.admission.count({ where: { lotId: lot.id } })).toBe(1)
    expect((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).admittedCount).toBe(1)
    const mine = (await app.inject({ method: 'GET', url: '/api/v1/me/admissions', headers: a.auth })).json()
    expect(mine.map((m: { lotId: string }) => m.lotId)).toEqual([lot.id])
    const done = (await app.inject({ method: 'POST', url, headers: a.auth, payload: { acceptRules: true } })).json()
    expect(done.status).toBe('ADMITTED')
  })

  it('чужой заказ подтвердить нельзя', async () => {
    const lot = await createLot(db)
    const owner = await createUser(db)
    const order = await pendingOrder(owner.id, lot.id)
    const other = await loginAs(app, 910_002)
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/fake/${order.id}/complete`,
      headers: other.auth,
    })
    expect(res.statusCode).toBe(403)
  })

  it('одновременные повторные события оплаты не создают второй допуск', async () => {
    const lot = await createLot(db)
    const u = await createUser(db)
    const order = await pendingOrder(u.id, lot.id)
    const c = { orderId: order.id, providerTxId: 'tx-1', amount: 12_000n, paidAt: new Date() }
    const outcomes = await Promise.all([
      payments.confirmAdmissionPayment(c),
      payments.confirmAdmissionPayment(c),
      payments.confirmAdmissionPayment(c),
    ])
    expect(outcomes.filter((o) => o === 'ADMITTED')).toHaveLength(1)
    expect(outcomes.filter((o) => o === 'ALREADY_PROCESSED')).toHaveLength(2)
    expect(await db.admission.count()).toBe(1)
  })

  it('поздняя оплата (после закрытия торгов по времени операции) — на возврат, без допуска', async () => {
    const lot = await createLot(db)
    const u = await createUser(db)
    const order = await pendingOrder(u.id, lot.id)
    const out = await payments.confirmAdmissionPayment({
      orderId: order.id,
      providerTxId: 'tx-late',
      amount: 12_000n,
      paidAt: lot.closesAt,
    })
    expect(out).toBe('REFUND_LATE')
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('REFUND_PENDING')
    expect(await db.admission.count()).toBe(0)
  })

  it('вторая оплата при уже выданном допуске — на возврат', async () => {
    const lot = await createLot(db)
    const u = await createUser(db)
    const [o1, o2] = [await pendingOrder(u.id, lot.id), await pendingOrder(u.id, lot.id)]
    expect(
      await payments.confirmAdmissionPayment({ orderId: o1.id, providerTxId: 'a', amount: 12_000n, paidAt: new Date() })
    ).toBe('ADMITTED')
    expect(
      await payments.confirmAdmissionPayment({ orderId: o2.id, providerTxId: 'b', amount: 12_000n, paidAt: new Date() })
    ).toBe('REFUND_DUPLICATE')
    expect(await db.admission.count()).toBe(1)
  })

  it('сумма не совпала — допуск не выдаётся, заказ остаётся неоплаченным, событие в аудите', async () => {
    const lot = await createLot(db)
    const u = await createUser(db)
    const order = await pendingOrder(u.id, lot.id)
    expect(
      await payments.confirmAdmissionPayment({ orderId: order.id, providerTxId: 'x', amount: 1n, paidAt: new Date() })
    ).toBe('AMOUNT_MISMATCH')
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING')
    expect(await db.auditLog.count({ where: { action: 'payment.amount_mismatch' } })).toBe(1)
  })
})
