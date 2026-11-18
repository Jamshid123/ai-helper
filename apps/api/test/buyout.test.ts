import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Clock } from '../src/common/clock'
import { LotLifecycleService } from '../src/modules/auctions/lot-lifecycle.service'
import { BuyoutService } from '../src/modules/fulfillment/buyout.service'
import { RefundsService } from '../src/modules/payments/refunds.service'
import { loginAs, loginStaff, startApp } from './app'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()
const MIN = 60_000
const H = 60 * MIN

/** Выкуп по модели 10% / 15 мин → 24 ч на остаток и получение; повторные торги (решения 14.11 и 16.11.2026). */
describe('Выкуп: 10% за 15 минут, выдача по коду, повторные торги', () => {
  let app: NestFastifyApplication
  let now: Date
  let buyout: BuyoutService
  const at = (ms: number) => (now = new Date(now.getTime() + ms))

  beforeAll(async () => {
    app = await startApp()
    buyout = app.get(BuyoutService)
    vi.spyOn(app.get(Clock), 'now').mockImplementation(() => new Date(now))
  })
  beforeEach(async () => {
    await cleanDb(db)
    now = new Date()
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    await app?.close()
    await db.$disconnect()
  })

  const req = (method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers, payload })

  /** Лот с товаром, тремя допущенными и победителем; торги закрываются сервером. */
  async function closedLot() {
    const product = await db.product.create({
      data: {
        title: 'iPhone 13',
        condition: 'USED',
        status: 'IN_LOT',
        inventoryNo: `T-${key()}`,
        category: { connect: { slug: 'phones' } },
      },
    })
    const lot = await createLot(db, {
      product: { connect: { id: product.id } },
      opensAt: new Date(now.getTime() - 2 * H),
      closesAt: new Date(now.getTime() - 1000),
      maxParticipants: 10,
    })
    const winner = await loginAs(app, 960_001, 'Победитель')
    const other = await createUser(db)
    const third = await createUser(db)
    for (const [i, uid] of [winner.userId, other.id, third.id].entries()) {
      // допуск бесплатный (решение 18.11.2026); у второго — старый оплаченный: на повторные торги переносятся оба вида
      const order =
        uid === other.id
          ? await db.order.create({
              data: { userId: uid, lotId: lot.id, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID' },
            })
          : null
      await db.admission.create({ data: { lotId: lot.id, userId: uid, orderId: order?.id ?? null } })
      await db.bid.create({
        data: { lotId: lot.id, userId: uid, amount: BigInt(2_000_000 + i * 100_000), seq: i + 1, idempotencyKey: key() },
      })
    }
    // лидер — последний (2 200 000): делаем победителем пользователя с сессией
    await db.bid.create({
      data: { lotId: lot.id, userId: winner.userId, amount: 3_000_000n, seq: 4, idempotencyKey: key() },
    })
    await db.lot.update({ where: { id: lot.id }, data: { admittedCount: 3 } })
    expect(await app.get(LotLifecycleService).close(lot.id)).toBe('CLOSED_SOLD')
    const ob = await db.obligation.findFirstOrThrow({ where: { lotId: lot.id } })
    return { lot, product, winner, other, third, ob }
  }

  async function pay(auth: Record<string, string>, obligationId: string, part: 'prepayment' | 'remainder') {
    const start = await req('POST', `/obligations/${obligationId}/pay`, auth, { part })
    expect(start.statusCode).toBe(200)
    return (await req('POST', `/payments/fake/${start.json().orderId}/complete`, auth)).json().outcome as string
  }

  it('закрытие: победитель платит 10% своей цены за 15 минут; подтверждать покупку не нужно', async () => {
    const { ob, winner } = await closedLot()
    expect(ob).toMatchObject({ status: 'AWAITING_PREPAYMENT', amount: 3_000_000n, prepaymentAmount: 300_000n })
    expect(ob.prepaymentDeadline!.getTime() - now.getTime()).toBe(15 * MIN)
    const mine = (await req('GET', '/me/obligations', winner.auth)).json()
    expect(mine[0]).toMatchObject({ status: 'AWAITING_PREPAYMENT', prepaymentAmount: '300000', pickupCode: null })
  })

  it('оплатил 10% → код выдачи и 24 часа; остаток онлайн; выдача только по верному коду и после полной оплаты', async () => {
    const { ob, winner, product } = await closedLot()
    expect(await pay(winner.auth, ob.id, 'prepayment')).toBe('PREPAYMENT_PAID')
    const [mine] = (await req('GET', '/me/obligations', winner.auth)).json()
    expect(mine).toMatchObject({ status: 'AWAITING_PICKUP', remainderAmount: '2700000', remainderPaid: false })
    expect(mine.pickupCode).toMatch(/^\d{6}$/)
    expect(new Date(mine.remainderDeadline).getTime() - now.getTime()).toBe(24 * H)

    const staff = await loginStaff(app)
    const wrong = mine.pickupCode === '000000' ? '111111' : '000000'
    expect((await req('POST', `/admin/fulfillment/${ob.id}/issue`, staff.write, { code: wrong })).json().code).toBe('BAD_CODE')
    expect((await req('POST', `/admin/fulfillment/${ob.id}/issue`, staff.write, { code: mine.pickupCode })).json().code).toBe(
      'REMAINDER_UNPAID'
    )
    expect(await pay(winner.auth, ob.id, 'remainder')).toBe('REMAINDER_PAID')
    // второй раз остаток оплатить нельзя
    expect((await req('POST', `/obligations/${ob.id}/pay`, winner.auth, { part: 'remainder' })).json().code).toBe('ALREADY_PAID')
    const issued = await req('POST', `/admin/fulfillment/${ob.id}/issue`, staff.write, { code: mine.pickupCode })
    expect(issued.statusCode).toBe(200)
    expect(await db.obligation.findUniqueOrThrow({ where: { id: ob.id } })).toMatchObject({ status: 'COMPLETED' })
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).status).toBe('SOLD')
    expect(await db.auditLog.count({ where: { action: { in: ['obligation.issued', 'obligation.issue_bad_code'] } } })).toBe(2)
  })

  it('остаток на месте отмечает сотрудник; чужую покупку оплатить нельзя', async () => {
    const { ob, winner } = await closedLot()
    const stranger = await loginAs(app, 960_099)
    expect((await req('POST', `/obligations/${ob.id}/pay`, stranger.auth, { part: 'prepayment' })).statusCode).toBe(403)
    await pay(winner.auth, ob.id, 'prepayment')
    const staff = await loginStaff(app)
    expect((await req('POST', `/admin/fulfillment/${ob.id}/remainder-onsite`, staff.write, { method: 'cash' })).statusCode).toBe(200)
    const order = await db.order.findFirstOrThrow({ where: { lotId: ob.lotId, purpose: 'REMAINDER' } })
    expect(order).toMatchObject({ status: 'PAID', provider: 'onsite', amount: 2_700_000n })
    const list = (await req('GET', '/admin/fulfillment', staff.read)).json()
    expect(list[0]).toMatchObject({ id: ob.id, remainderPaid: 'onsite', buyer: { name: expect.any(String) } })
  })

  it('не оплатил 10% за 15 минут → аннулирование, ограничение 7 дней, повторные торги с переносом допуска', async () => {
    const { ob, lot, winner, other, third } = await closedLot()
    // начал оплату, но не успел
    await req('POST', `/obligations/${ob.id}/pay`, winner.auth, { part: 'prepayment' })
    at(15 * MIN)
    expect(await buyout.expireDue()).toBe(1)
    expect(await buyout.expireDue()).toBe(0) // идемпотентно

    expect(await db.obligation.findUniqueOrThrow({ where: { id: ob.id } })).toMatchObject({
      status: 'EXPIRED',
      expiredReason: 'PREPAYMENT_MISSED',
      prepaymentDecision: null,
    })
    const r = await db.restriction.findFirstOrThrow({ where: { userId: winner.userId } })
    expect(r.endsAt.getTime() - r.startsAt.getTime()).toBe(7 * 24 * H)
    // покупатель видит, до какого числа ограничено участие (решение 18.11.2026)
    const [mine] = (await req('GET', '/me/obligations', winner.auth)).json()
    expect(mine).toMatchObject({ status: 'EXPIRED', expiredReason: 'PREPAYMENT_MISSED', restrictedUntil: r.endsAt.toISOString() })
    expect((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe('CLOSED_UNSOLD')

    const relist = await db.lot.findFirstOrThrow({ where: { relistOfId: lot.id }, include: { admissions: true } })
    expect(relist).toMatchObject({ status: 'DRAFT', productId: lot.productId, startPrice: lot.startPrice, admittedCount: 2 })
    expect(relist.admissions.map((a) => a.userId).sort()).toEqual([other.id, third.id].sort())
    expect(relist.admissions.every((a) => a.orderId === null && a.carriedFromLotId === lot.id)).toBe(true)

    // оплата, пришедшая после аннулирования, уходит на возврат
    const late = await db.order.findFirstOrThrow({ where: { lotId: lot.id, purpose: 'PREPAYMENT' } })
    expect(late.status).toBe('CANCELLED')
    const outcome = (await req('POST', `/payments/fake/${late.id}/complete`, winner.auth)).json().outcome
    expect(outcome).toBe('REFUND_EXPIRED')
    // повторно оплатить 10% нельзя
    expect((await req('POST', `/obligations/${ob.id}/pay`, winner.auth, { part: 'prepayment' })).json().code).toBe(
      'PAYMENT_CLOSED'
    )
  })

  it('оплатил 10%, но не забрал за 24 часа → аннулирование без ограничения; остаток онлайн — возврат; 10% решают финансы', async () => {
    const { ob, lot, winner } = await closedLot()
    await pay(winner.auth, ob.id, 'prepayment')
    await pay(winner.auth, ob.id, 'remainder')
    at(24 * H + MIN)
    expect(await buyout.expireDue()).toBe(1)
    expect(await db.obligation.findUniqueOrThrow({ where: { id: ob.id } })).toMatchObject({
      status: 'EXPIRED',
      expiredReason: 'PICKUP_MISSED',
      prepaymentDecision: 'PENDING',
    })
    expect(await db.restriction.count({ where: { userId: winner.userId } })).toBe(0)
    const remainder = await db.order.findFirstOrThrow({ where: { lotId: lot.id, purpose: 'REMAINDER' } })
    expect(remainder.status).toBe('REFUNDED') // fake-провайдер возвращает сразу
    expect(await db.lot.count({ where: { relistOfId: lot.id } })).toBe(1)

    const finance = await loginStaff(app) // после сдвига часов — свежая сессия
    expect((await req('GET', '/admin/finance/buyouts', finance.read)).json()).toHaveLength(1)
    expect((await req('POST', `/admin/finance/buyouts/${ob.id}/decision`, finance.write, { decision: 'REFUNDED' })).statusCode).toBe(
      400
    ) // причина обязательна
    const d = await req('POST', `/admin/finance/buyouts/${ob.id}/decision`, finance.write, {
      decision: 'REFUNDED',
      reason: 'Покупатель заболел, есть справка',
    })
    expect(d.statusCode).toBe(200)
    const pre = await db.order.findFirstOrThrow({ where: { lotId: lot.id, purpose: 'PREPAYMENT' } })
    expect(pre.status).toBe('REFUNDED')
    expect(
      (await req('POST', `/admin/finance/buyouts/${ob.id}/decision`, finance.write, { decision: 'RETAINED', reason: 'ещё раз' }))
        .json().code
    ).toBe('NO_DECISION_NEEDED')
    // после срока выдать товар нельзя
    expect((await req('POST', `/admin/fulfillment/${ob.id}/issue`, finance.write, { code: '123456' })).json().code).toBe(
      'NOT_AWAITING_PICKUP'
    )
  })

  it('перенесённый допуск: выход до начала повторных торгов — без возврата (в этом лоте взнос не платили)', async () => {
    const { lot, other } = await closedLot()
    at(16 * MIN)
    await buyout.expireDue()
    const relist = await db.lot.findFirstOrThrow({ where: { relistOfId: lot.id } })
    const refunds = app.get(RefundsService)
    const r = await refunds.revokeOneBeforeStart(relist.id, other.id, { actorType: 'buyer', actorId: other.id, action: 'admission.left' })
    expect(r).toEqual({ refunded: false })
    expect((await db.lot.findUniqueOrThrow({ where: { id: relist.id } })).admittedCount).toBe(1)
  })
})
