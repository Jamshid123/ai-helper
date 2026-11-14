import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FakeClock } from '../src/common/clock'
import { BidsService } from '../src/modules/auctions/bids.service'
import { LotLifecycleService } from '../src/modules/auctions/lot-lifecycle.service'
import { FakePaymentProvider } from '../src/modules/payments/payment-provider'
import { RefundsService } from '../src/modules/payments/refunds.service'
import { AuditService } from '../src/modules/staff/audit.service'
import type { PrismaService } from '../src/prisma/prisma.service'
import { loginAs, loginStaff, startApp } from './app'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()
const prisma = db as unknown as PrismaService
const T0 = new Date('2026-11-17T07:00:00Z') // вторник 12:00 Ташкент — торги не в пятницу
const clock = new FakeClock(T0)
const refunds = new RefundsService(prisma, new FakePaymentProvider(), new AuditService(prisma), clock)
const lifecycle = new LotLifecycleService(prisma, clock, refunds)
const bids = new BidsService(prisma, clock)
const at = (sec: number) => new Date(T0.getTime() + sec * 1000)

async function admitted(lotId: string) {
  const u = await createUser(db)
  const o = await db.order.create({
    data: { userId: u.id, lotId, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID' },
  })
  await db.admission.create({ data: { lotId, userId: u.id, orderId: o.id } })
  await db.lot.update({ where: { id: lotId }, data: { admittedCount: { increment: 1 } } })
  return { user: u, order: o }
}

describe('Параметры торгов: любой день, ожидание предложения, минимум и максимум участников', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(async () => {
    await cleanDb(db)
    clock.set(T0)
  })
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  it('ожидание предложения: 2 минуты тишины после последнего — торги завершаются досрочно, позже предложить нельзя', async () => {
    const lot = await createLot(db, { opensAt: T0, closesAt: at(3600), bidTimeoutSec: 120 })
    const a = await admitted(lot.id)
    const b = await admitted(lot.id)
    await bids.placeBid(a.user.id, lot.id, 2_000_000n, key())
    expect((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).lastBidAt?.toISOString()).toBe(T0.toISOString())

    clock.set(at(119))
    expect(await lifecycle.closeDue()).toEqual({})
    await bids.placeBid(b.user.id, lot.id, 2_100_000n, key()) // успел — таймер с нуля

    clock.set(at(119 + 120))
    // планировщик ещё не прошёл, но предложение уже не принимается
    await expect(bids.placeBid(a.user.id, lot.id, 2_200_000n, key())).rejects.toMatchObject({ code: 'LOT_CLOSED' })
    expect(await lifecycle.closeDue()).toEqual({ [lot.id]: 'CLOSED_SOLD' })
    const ob = await db.obligation.findFirstOrThrow({ where: { lotId: lot.id } })
    expect(ob).toMatchObject({ userId: b.user.id, amount: 2_100_000n })
  })

  it('без предложений ожидание не срабатывает — торги идут до назначенного времени', async () => {
    const lot = await createLot(db, { opensAt: T0, closesAt: at(600), bidTimeoutSec: 60 })
    clock.set(at(300))
    expect(await lifecycle.closeDue()).toEqual({})
    clock.set(at(600))
    expect(await lifecycle.closeDue()).toEqual({ [lot.id]: 'CLOSED_UNSOLD' })
  })

  it('к началу меньше минимума участников — торги не стартуют: отмена, возврат 100%, товар на склад', async () => {
    const phones = await db.category.findUniqueOrThrow({ where: { slug: 'phones' } })
    const product = await db.product.create({
      data: { categoryId: phones.id, title: 'iPhone', condition: 'USED', status: 'IN_LOT' },
    })
    const lot = await createLot(db, {
      status: 'SCHEDULED',
      opensAt: at(60),
      closesAt: at(3600),
      minParticipants: 2,
      product: { connect: { id: product.id } },
    })
    const one = await admitted(lot.id)
    const ok = await createLot(db, { status: 'SCHEDULED', opensAt: at(60), closesAt: at(3600), minParticipants: 1 })
    await admitted(ok.id)

    clock.set(at(60))
    expect(await lifecycle.openDue()).toEqual([ok.id])
    const after = await db.lot.findUniqueOrThrow({ where: { id: lot.id } })
    expect(after.status).toBe('CANCELLED')
    expect(await db.admission.count({ where: { lotId: lot.id } })).toBe(0)
    expect((await db.order.findUniqueOrThrow({ where: { id: one.order.id } })).status).toBe('REFUNDED')
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).status).toBe('AVAILABLE')
    expect(await db.outboxEvent.count({ where: { type: 'lot.cancelled', aggregateId: lot.id } })).toBe(1)
    expect(await db.auditLog.count({ where: { action: 'lot.cancelled_min_participants' } })).toBe(1)
  })

  it('максимум участников: мест нет — допуск не оформляется; оплата, пришедшая после заполнения, уходит на возврат', async () => {
    const lot = await createLot(db, {
      status: 'SCHEDULED',
      opensAt: new Date(Date.now() + 86_400_000),
      closesAt: new Date(Date.now() + 90_000_000),
      maxParticipants: 1,
    })
    const a = await loginAs(app, 960_001)
    const b = await loginAs(app, 960_002)
    const start = (auth: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/lots/${lot.id}/admission`,
        headers: auth,
        payload: { acceptRules: true },
      })
    const ra = (await start(a.auth)).json()
    const rb = (await start(b.auth)).json() // оба начали оформление, пока место было
    const pay = (orderId: string, auth: Record<string, string>) =>
      app.inject({ method: 'POST', url: `/api/v1/payments/fake/${orderId}/complete`, headers: auth })
    expect((await pay(ra.orderId, a.auth)).json().outcome).toBe('ADMITTED')
    expect((await pay(rb.orderId, b.auth)).json().outcome).toBe('REFUND_FULL')
    expect((await db.order.findUniqueOrThrow({ where: { id: rb.orderId } })).status).toBe('REFUND_PENDING')

    const c = await loginAs(app, 960_003)
    const full = await start(c.auth)
    expect(full.statusCode).toBe(409)
    expect(full.json().code).toBe('LOT_FULL')
    const dto = (await app.inject({ method: 'GET', url: `/api/v1/lots/${lot.id}` })).json()
    expect(dto).toMatchObject({ maxParticipants: 1, admittedCount: 1 })
  })

  it('каталог отдаёт фактическое окончание (endsAt) и ожидание предложения', async () => {
    const lot = await createLot(db, {
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 3_600_000),
      bidTimeoutSec: 300,
      lastBidAt: new Date(Date.now() - 60_000),
    })
    const dto = (await app.inject({ method: 'GET', url: `/api/v1/lots/${lot.id}` })).json()
    expect(dto.bidTimeoutSec).toBe(300)
    expect(Date.parse(dto.endsAt)).toBeLessThan(Date.parse(dto.closesAt))
  })

  it('админка: торги в любой день и время; длительность 5 мин…14 дней; минимум не больше максимума', async () => {
    const owner = await loginStaff(app)
    const phones = await db.category.findUniqueOrThrow({ where: { slug: 'phones' } })
    const product = await db.product.create({ data: { categoryId: phones.id, title: 'Pixel', condition: 'USED' } })
    const opensAt = new Date(Date.now() + 2 * 86_400_000 + 37 * 60_000) // не пятница, не 09:00
    const body = (extra: object) => ({
      productId: product.id,
      startPrice: '3000000',
      step: '100000',
      opensAt: opensAt.toISOString(),
      closesAt: new Date(opensAt.getTime() + 45 * 60_000).toISOString(),
      ...extra,
    })
    const post = (extra: object) =>
      app.inject({ method: 'POST', url: '/api/v1/admin/lots', headers: owner.write, payload: body(extra) })
    expect((await post({ closesAt: new Date(opensAt.getTime() + 60_000).toISOString() })).json().code).toBe(
      'BAD_DURATION'
    )
    expect((await post({ minParticipants: 5, maxParticipants: 3 })).json().code).toBe('BAD_PARTICIPANTS')
    expect((await post({ bidTimeoutSec: 10 })).statusCode).toBe(400)
    const ok = await post({ minParticipants: 2, maxParticipants: 30, bidTimeoutSec: 180 })
    expect(ok.statusCode).toBe(201)
    expect(ok.json()).toMatchObject({ minParticipants: 2, maxParticipants: 30, bidTimeoutSec: 180 })
  })
})
