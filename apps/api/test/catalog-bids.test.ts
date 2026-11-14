import { randomUUID } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loginAs, startApp } from './app'
import { cleanDb, createLot } from './factories'

const db = new PrismaClient()

describe('Каталог и предложение цены по HTTP', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  async function admit(lotId: string, userId: string) {
    const o = await db.order.create({
      data: { userId, lotId, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID' },
    })
    await db.admission.create({ data: { lotId, userId, orderId: o.id } })
  }

  it('гость видит каталог: расписание и стартовую цену; черновики скрыты; деньги строками', async () => {
    const live = await createLot(db, {
      inspection: { summary: 'Как новый', battery: 91, imeiChecked: true, kit: ['Коробка'], defects: [] },
    })
    await createLot(db, { status: 'DRAFT' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/lots' })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: live.id,
      status: 'live',
      startPrice: '2000000',
      step: '100000',
      fee: '12000',
      seller: 'platform',
    })
    expect(list[0].inspection).toMatchObject({ battery: 91, imeiChecked: true })

    const one = await app.inject({ method: 'GET', url: `/api/v1/lots/${live.id}` })
    expect(one.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/v1/lots/${randomUUID()}` })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/v1/lots/not-a-uuid' })).statusCode).toBe(400)
  })

  it('каталог: идущие лоты первыми, затем запланированные по времени начала', async () => {
    const soon = new Date(Date.now() + 86_400_000)
    const later = new Date(Date.now() + 2 * 86_400_000)
    const far = await createLot(db, {
      status: 'SCHEDULED',
      opensAt: later,
      closesAt: new Date(later.getTime() + 3_600_000),
    })
    const near = await createLot(db, {
      status: 'SCHEDULED',
      opensAt: soon,
      closesAt: new Date(soon.getTime() + 3_600_000),
    })
    const live = await createLot(db)
    const ids = (await app.inject({ method: 'GET', url: '/api/v1/lots' })).json().map((l: { id: string }) => l.id)
    expect(ids).toEqual([live.id, near.id, far.id])
  })

  it('расписание отдаёт серверное время и окно пятничной сессии', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/v1/schedule' })).json()
    expect(body.timezone).toBe('Asia/Tashkent')
    expect(new Date(body.session.closesAt).getTime()).toBeGreaterThan(new Date(body.session.opensAt).getTime())
  })

  it('предложение цены: без входа 401, без допуска 403, ниже минимума 409 с минимальной ценой, успех 200', async () => {
    const lot = await createLot(db)
    const url = `/api/v1/lots/${lot.id}/bids`
    const payload = (amount: string) => ({ amount, idempotencyKey: randomUUID() })

    expect((await app.inject({ method: 'POST', url, payload: payload('2000000') })).statusCode).toBe(401)

    const a = await loginAs(app, 900_001, 'Азиз')
    const noAdm = await app.inject({ method: 'POST', url, headers: a.auth, payload: payload('2000000') })
    expect(noAdm.statusCode).toBe(403)
    expect(noAdm.json().code).toBe('NO_ADMISSION')

    await admit(lot.id, a.userId)
    const ok = await app.inject({ method: 'POST', url, headers: a.auth, payload: payload('2000000') })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({
      currentPrice: '2000000',
      minNextBid: '2100000',
      replayed: false,
      bid: { seq: 1 },
    })

    const b = await loginAs(app, 900_002, 'Малика')
    await admit(lot.id, b.userId)
    const low = await app.inject({ method: 'POST', url, headers: b.auth, payload: payload('2050000') })
    expect(low.statusCode).toBe(409)
    expect(low.json()).toEqual({ code: 'BID_TOO_LOW', message: expect.any(String), minBid: '2100000' })
  })

  it('ход торгов: новые сверху, «мои» помечены, без id/telegramId участников; без входа 401, чужой лот 404', async () => {
    const lot = await createLot(db)
    const url = `/api/v1/lots/${lot.id}/bids`
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401)

    const a = await loginAs(app, 900_020, 'Азиз')
    const b = await loginAs(app, 900_021, 'Малика')
    const empty = await app.inject({ method: 'GET', url, headers: a.auth })
    expect(empty.statusCode).toBe(200)
    expect(empty.json()).toEqual({ currentPrice: null, minNextBid: '2000000', lastSeq: 0, bids: [] })

    await admit(lot.id, a.userId)
    await admit(lot.id, b.userId)
    const bid = (auth: Record<string, string>, amount: string) =>
      app.inject({ method: 'POST', url, headers: auth, payload: { amount, idempotencyKey: randomUUID() } })
    expect((await bid(a.auth, '2000000')).statusCode).toBe(200)
    expect((await bid(b.auth, '2100000')).statusCode).toBe(200)

    const feed = (await app.inject({ method: 'GET', url, headers: a.auth })).json()
    expect(feed).toMatchObject({ currentPrice: '2100000', minNextBid: '2200000', lastSeq: 2 })
    expect(feed.bids.map((x: { seq: number; mine: boolean }) => [x.seq, x.mine])).toEqual([
      [2, false],
      [1, true],
    ])
    expect(Object.keys(feed.bids[0]).sort()).toEqual(['amount', 'bidder', 'createdAt', 'mine', 'seq'])
    expect(feed.bids[0]).toMatchObject({ amount: '2100000', bidder: 'Участник 0021' })

    const other = await app.inject({ method: 'GET', url: `/api/v1/lots/${randomUUID()}/bids`, headers: a.auth })
    expect(other.statusCode).toBe(404)
  })

  it('валидация тела: дробные, отрицательные, не-uuid ключ — 400', async () => {
    const lot = await createLot(db)
    const a = await loginAs(app, 900_003)
    for (const body of [
      { amount: '2000000.5', idempotencyKey: randomUUID() },
      { amount: '-1', idempotencyKey: randomUUID() },
      { amount: '2000000', idempotencyKey: 'x' },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/lots/${lot.id}/bids`,
        headers: a.auth,
        payload: body,
      })
      expect(res.statusCode).toBe(400)
    }
  })
  it('автопредложение по HTTP: установить, посмотреть, отменить; максимум виден только владельцу', async () => {
    const lot = await createLot(db)
    const a = await loginAs(app, 900_010, 'Азиз')
    await admit(lot.id, a.userId)
    const url = `/api/v1/lots/${lot.id}/autobid`
    const set = await app.inject({ method: 'PUT', url, headers: a.auth, payload: { maxAmount: '3000000' } })
    expect(set.statusCode).toBe(200)
    expect(set.json()).toMatchObject({ maxAmount: '3000000', active: true, leading: true, currentPrice: '2000000' })
    expect((await app.inject({ method: 'GET', url, headers: a.auth })).json()).toEqual({
      maxAmount: '3000000',
      active: true,
    })
    const b = await loginAs(app, 900_011, 'Малика')
    expect((await app.inject({ method: 'GET', url, headers: b.auth })).json()).toBeNull()
    expect((await app.inject({ method: 'DELETE', url, headers: a.auth })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url, headers: a.auth })).json()).toEqual({
      maxAmount: '3000000',
      active: false,
    })
  })
})
