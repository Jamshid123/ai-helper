import { createHash } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Clock } from '../src/common/clock'
import { ClickService } from '../src/modules/payments/click/click.service'
import { loginAs, startApp } from './app'
import { cleanDb, createLot, key } from './factories'

const db = new PrismaClient()
const MIN = 60_000
const H = 60 * MIN

const CLICK = { service: '41234', merchant: '27001', user: '39001', secret: 'c'.repeat(24) }
const PAYME = { merchant: '5e730e8e0b852a417aa49ceb', key: 'p'.repeat(32) }
const PAYME_IP = '185.234.113.7'

/** Click и Payme (решение 17.11.2026): запросы платёжных систем, выбор способа оплаты, возвраты. */
describe('Оплата через Click и Payme', () => {
  let app: NestFastifyApplication
  let now: Date
  const saved = { ...process.env }

  beforeAll(async () => {
    Object.assign(process.env, {
      PAYMENTS_MODE: 'live',
      CLICK_SERVICE_ID: CLICK.service,
      CLICK_MERCHANT_ID: CLICK.merchant,
      CLICK_MERCHANT_USER_ID: CLICK.user,
      CLICK_SECRET_KEY: CLICK.secret,
      PAYME_MERCHANT_ID: PAYME.merchant,
      PAYME_KEY: PAYME.key,
      PAYME_IP_CHECK: 'true',
    })
    app = await startApp()
    vi.spyOn(app.get(Clock), 'now').mockImplementation(() => new Date(now))
    app.get(ClickService).refundDelayMs = 0
  })
  beforeEach(async () => {
    await cleanDb(db)
    now = new Date()
    vi.restoreAllMocks()
    vi.spyOn(app.get(Clock), 'now').mockImplementation(() => new Date(now))
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    process.env = saved
    await app?.close()
    await db.$disconnect()
  })

  // ───────────── помощники ─────────────

  /** Покупатель начинает оплату допуска выбранным способом. */
  async function startAdmission(provider: 'click' | 'payme', lotData = {}, tg = 940_001) {
    const lot = await createLot(db, { fee: 12_000n, ...lotData })
    const u = await loginAs(app, tg)
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/lots/${lot.id}/admission`,
      headers: u.auth,
      payload: { acceptRules: true, provider, locale: 'uz' },
    })
    return { lot, u, start: r.json() as { orderId: string; checkoutUrl: string; provider: string } }
  }

  let seq = 1000
  function clickBody(action: 0 | 1, orderId: string, amount: string, extra: Record<string, string> = {}) {
    const b: Record<string, string> = {
      click_trans_id: extra.click_trans_id ?? String(++seq),
      service_id: CLICK.service,
      click_paydoc_id: extra.click_paydoc_id ?? String(seq + 500_000),
      merchant_trans_id: orderId,
      amount,
      action: String(action),
      error: extra.error ?? '0',
      error_note: 'Success',
      sign_time: '2026-11-17 10:00:00',
      ...(action === 1 ? { merchant_prepare_id: extra.merchant_prepare_id } : {}),
    }
    const parts = [b.click_trans_id, b.service_id, CLICK.secret, b.merchant_trans_id]
    if (action === 1) parts.push(b.merchant_prepare_id)
    parts.push(b.amount, b.action, b.sign_time)
    b.sign_string = extra.sign_string ?? createHash('md5').update(parts.join('')).digest('hex')
    return b
  }
  const click = async (b: Record<string, string>) =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/payments/click',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams(b).toString(),
      })
    ).json()

  const payme = async (method: string, params: object, opts: { key?: string; ip?: string } = {}) =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/payments/payme',
        headers: {
          'content-type': 'text/json; charset=UTF-8',
          authorization: `Basic ${Buffer.from(`Paycom:${opts.key ?? PAYME.key}`).toString('base64')}`,
          'x-forwarded-for': opts.ip ?? PAYME_IP,
        },
        payload: JSON.stringify({ method, params, id: 77 }),
      })
    ).json()

  async function prepaymentOrder(deadlineInMin = 15) {
    const lot = await createLot(db, { status: 'CLOSED_SOLD', closesAt: new Date(now.getTime() - MIN) })
    const u = await loginAs(app, 940_100)
    const bid = await db.bid.create({ data: { lotId: lot.id, userId: u.userId, amount: 3_000_000n, seq: 1, idempotencyKey: key() } })
    const ob = await db.obligation.create({
      data: {
        lotId: lot.id,
        userId: u.userId,
        bidId: bid.id,
        rank: 1,
        amount: 3_000_000n,
        prepaymentAmount: 300_000n,
        status: 'AWAITING_PREPAYMENT',
        confirmDeadline: now,
        prepaymentDeadline: new Date(now.getTime() + deadlineInMin * MIN),
      },
    })
    return { lot, u, ob }
  }

  // ───────────── выбор способа и ссылки на оплату ─────────────

  it('доступны оба способа; ссылки на Click и Payme собираются с номером заказа, суммой и возвратом на лот', async () => {
    const providers = (await app.inject({ method: 'GET', url: '/api/v1/payments/providers' })).json()
    expect(providers).toEqual({ providers: ['click', 'payme'] })

    const { lot, start } = await startAdmission('click')
    const url = new URL(start.checkoutUrl)
    expect(url.origin + url.pathname).toBe('https://my.click.uz/services/pay/')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      service_id: CLICK.service,
      merchant_id: CLICK.merchant,
      amount: '12000.00',
      transaction_param: start.orderId,
      return_url: `https://auksion.expertly.uz/lot/${lot.id}`,
    })

    // тот же неоплаченный заказ, переключили на Payme
    const u = await loginAs(app, 940_001)
    const p = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/lots/${lot.id}/admission`,
        headers: u.auth,
        payload: { acceptRules: true, provider: 'payme', locale: 'uz' },
      })
    ).json()
    expect(p.orderId).toBe(start.orderId)
    expect(p.checkoutUrl.startsWith('https://checkout.paycom.uz/')).toBe(true)
    const decoded = Buffer.from(p.checkoutUrl.split('/').pop(), 'base64').toString()
    expect(decoded).toBe(
      `m=${PAYME.merchant};ac.order_id=${start.orderId};a=1200000;l=uz;c=https://auksion.expertly.uz/lot/${lot.id}`
    )
    expect((await db.order.findUniqueOrThrow({ where: { id: start.orderId } })).provider).toBe('payme')

    const bad = await app.inject({
      method: 'POST',
      url: `/api/v1/lots/${lot.id}/admission`,
      headers: u.auth,
      payload: { acceptRules: true, provider: 'paypal' },
    })
    expect(bad.json()).toMatchObject({ code: 'UNKNOWN_PROVIDER' })
  })

  // ───────────── Click ─────────────

  it('Click: подпись, сумма и заказ проверяются; Prepare → Complete выдаёт допуск ровно один раз', async () => {
    const { lot, start } = await startAdmission('click')
    expect(await click(clickBody(0, start.orderId, '12000', { sign_string: 'deadbeef' }))).toMatchObject({ error: -1 })
    expect(await click(clickBody(0, start.orderId, '11000'))).toMatchObject({ error: -2 })
    expect(await click(clickBody(0, '00000000-0000-4000-8000-000000000000', '12000'))).toMatchObject({ error: -5 })
    expect(await click(clickBody(0, start.orderId, '12000.5'))).toMatchObject({ error: -2 })

    const prep = clickBody(0, start.orderId, '12000.00')
    const p = await click(prep)
    expect(p).toMatchObject({ error: 0, click_trans_id: prep.click_trans_id, merchant_trans_id: start.orderId })
    expect(await click(prep)).toMatchObject({ error: 0, merchant_prepare_id: p.merchant_prepare_id }) // повтор

    const comp = clickBody(1, start.orderId, '12000.00', {
      click_trans_id: prep.click_trans_id,
      click_paydoc_id: prep.click_paydoc_id,
      merchant_prepare_id: String(p.merchant_prepare_id),
    })
    expect(await click(comp)).toMatchObject({ error: 0, merchant_confirm_id: p.merchant_prepare_id })
    expect(await click(comp)).toMatchObject({ error: -4 }) // повтор Complete
    expect(await db.admission.count({ where: { lotId: lot.id } })).toBe(1)
    expect(await db.order.findUniqueOrThrow({ where: { id: start.orderId } })).toMatchObject({
      status: 'PAID',
      provider: 'click',
      providerTxId: `click:${prep.click_trans_id}`,
    })
    // оплаченный заказ второй раз не подготовить
    expect(await click(clickBody(0, start.orderId, '12000'))).toMatchObject({ error: -4 })
  })

  it('Click: ошибка списания (error < 0) отменяет транзакцию, заказ остаётся к оплате', async () => {
    const { start } = await startAdmission('click')
    const prep = clickBody(0, start.orderId, '12000')
    const p = await click(prep)
    const comp = clickBody(1, start.orderId, '12000', {
      click_trans_id: prep.click_trans_id,
      merchant_prepare_id: String(p.merchant_prepare_id),
      error: '-5017',
    })
    expect(await click(comp)).toMatchObject({ error: -9 })
    expect((await db.order.findUniqueOrThrow({ where: { id: start.orderId } })).status).toBe('PENDING')
    expect((await db.paymentTransaction.findFirstOrThrow()).state).toBe(-1)
  })

  it('Click: 10% начаты до срока, списаны после — оплата засчитана; начать после срока нельзя', async () => {
    const { u, ob } = await prepaymentOrder(15)
    const r = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/obligations/${ob.id}/pay`,
        headers: u.auth,
        payload: { part: 'prepayment', provider: 'click' },
      })
    ).json()
    now = new Date(now.getTime() + 14 * MIN)
    const prep = clickBody(0, r.orderId, '300000')
    const p = await click(prep)
    expect(p.error).toBe(0)
    now = new Date(now.getTime() + 2 * MIN) // срок прошёл, пока банк списывал
    const comp = clickBody(1, r.orderId, '300000', {
      click_trans_id: prep.click_trans_id,
      merchant_prepare_id: String(p.merchant_prepare_id),
    })
    expect(await click(comp)).toMatchObject({ error: 0 })
    expect((await db.obligation.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe('AWAITING_PICKUP')

    const late = await prepaymentOrder(15)
    const r2 = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/obligations/${late.ob.id}/pay`,
        headers: late.u.auth,
        payload: { part: 'prepayment', provider: 'click' },
      })
    ).json()
    now = new Date(now.getTime() + 16 * MIN)
    expect(await click(clickBody(0, r2.orderId, '300000'))).toMatchObject({ error: -5 })
  })

  it('Click: выход из лота до начала → возврат отменой платежа в Click; отказ Click → возврат остаётся финансам', async () => {
    const http = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error_code: 0, error_note: 'Success', payment_id: 1 }), { status: 200 })
    )
    const soon = { status: 'SCHEDULED' as const, opensAt: new Date(now.getTime() + 2 * H), closesAt: new Date(now.getTime() + 4 * H) }
    const { lot, u, start } = await startAdmission('click', soon)
    const prep = clickBody(0, start.orderId, '12000')
    const p = await click(prep)
    await click(
      clickBody(1, start.orderId, '12000', {
        click_trans_id: prep.click_trans_id,
        click_paydoc_id: prep.click_paydoc_id,
        merchant_prepare_id: String(p.merchant_prepare_id),
      })
    )
    const leave = await app.inject({ method: 'DELETE', url: `/api/v1/lots/${lot.id}/admission`, headers: u.auth })
    expect(leave.json()).toEqual({ refunded: true })
    const [url, init] = http.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://api.click.uz/v2/merchant/payment/reversal/${CLICK.service}/${prep.click_paydoc_id}`)
    expect(init.method).toBe('DELETE')
    expect((init.headers as Record<string, string>).Auth).toMatch(new RegExp(`^${CLICK.user}:[0-9a-f]{40}:\\d{10}$`))
    expect((await db.order.findUniqueOrThrow({ where: { id: start.orderId } })).status).toBe('REFUNDED')
    expect((await db.paymentTransaction.findFirstOrThrow()).state).toBe(-2)

    // второй участник: Click отказал (платёж прошлого месяца) — заказ ждёт ручного возврата
    http.mockResolvedValue(new Response(JSON.stringify({ error_code: -5017, error_note: 'Отказ' }), { status: 200 }))
    const b = await startAdmission('click', soon, 940_002)
    const prep2 = clickBody(0, b.start.orderId, '12000')
    const p2 = await click(prep2)
    await click(
      clickBody(1, b.start.orderId, '12000', { click_trans_id: prep2.click_trans_id, merchant_prepare_id: String(p2.merchant_prepare_id) })
    )
    const leave2 = await app.inject({ method: 'DELETE', url: `/api/v1/lots/${b.lot.id}/admission`, headers: b.u.auth })
    expect(leave2.json()).toEqual({ refunded: false })
    expect((await db.order.findUniqueOrThrow({ where: { id: b.start.orderId } })).status).toBe('REFUND_PENDING')
  })

  it('двойная оплата исключена: пока идёт оплата в Payme, Click не начинает; дубль всё равно уходит на возврат', async () => {
    const http = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error_code: 0 }), { status: 200 }))
    const { start } = await startAdmission('payme')
    const t = { id: 'payme-tx-busy', time: now.getTime(), amount: 1_200_000, account: { order_id: start.orderId } }
    expect((await payme('CreateTransaction', t)).result.state).toBe(1)
    expect(await click(clickBody(0, start.orderId, '12000'))).toMatchObject({ error: -5 })

    // через 10 минут брошенная оплата в Payme больше не держит заказ: Click подготовлен, затем Payme провёл первым
    now = new Date(now.getTime() + 11 * MIN)
    const prep = clickBody(0, start.orderId, '12000')
    const p = await click(prep)
    expect(p.error).toBe(0)
    expect((await payme('PerformTransaction', { id: t.id })).result.state).toBe(2)
    const comp = clickBody(1, start.orderId, '12000', {
      click_trans_id: prep.click_trans_id,
      click_paydoc_id: prep.click_paydoc_id,
      merchant_prepare_id: String(p.merchant_prepare_id),
    })
    expect(await click(comp)).toMatchObject({ error: 0 }) // деньги списаны — Click нельзя ответить ошибкой
    await vi.waitFor(async () => expect(http).toHaveBeenCalledTimes(1))
    await vi.waitFor(async () =>
      expect(await db.paymentTransaction.findFirstOrThrow({ where: { provider: 'click' } })).toMatchObject({
        state: -2,
        needsRefund: false,
      })
    )
    expect(await db.order.findUniqueOrThrow({ where: { id: start.orderId } })).toMatchObject({
      status: 'PAID',
      provider: 'payme',
    })
  })

  // ───────────── Payme ─────────────

  it('Payme: без ключа или не с адреса Payme — отказ -32504; битый JSON — -32700', async () => {
    const { start } = await startAdmission('payme')
    const params = { amount: 1_200_000, account: { order_id: start.orderId } }
    expect((await payme('CheckPerformTransaction', params, { key: 'w'.repeat(32) })).error.code).toBe(-32504)
    expect((await payme('CheckPerformTransaction', params, { ip: '10.1.2.3' })).error.code).toBe(-32504)
    const broken = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/payme',
      headers: {
        'content-type': 'text/json',
        authorization: `Basic ${Buffer.from(`Paycom:${PAYME.key}`).toString('base64')}`,
        'x-forwarded-for': PAYME_IP,
      },
      payload: '{"method": ',
    })
    expect(broken.statusCode).toBe(200)
    expect(broken.json().error.code).toBe(-32700)
    expect((await payme('Unknown', {})).error.code).toBe(-32601)
  })

  it('Payme: проверка заказа и суммы, создание → проведение → допуск; повторы возвращают то же', async () => {
    const { lot, start } = await startAdmission('payme')
    const acc = { order_id: start.orderId }
    expect((await payme('CheckPerformTransaction', { amount: 1_100_000, account: acc })).error.code).toBe(-31001)
    expect((await payme('CheckPerformTransaction', { amount: 1_200_050, account: acc })).error.code).toBe(-31001)
    const missing = await payme('CheckPerformTransaction', { amount: 1_200_000, account: { order_id: 'nope' } })
    expect(missing.error).toMatchObject({ code: -31050, data: 'order_id' })
    expect(missing.error.message).toMatchObject({ ru: expect.any(String), uz: expect.any(String), en: expect.any(String) })
    expect((await payme('CheckPerformTransaction', { amount: 1_200_000, account: acc })).result).toEqual({ allow: true })

    const t = { id: '5305e3bab097f420a62ced0b', time: now.getTime(), amount: 1_200_000, account: acc }
    const c1 = (await payme('CreateTransaction', t)).result
    expect(c1).toMatchObject({ state: 1, transaction: expect.any(String) })
    now = new Date(now.getTime() + 1000)
    expect((await payme('CreateTransaction', t)).result).toEqual(c1)
    const other = await payme('CreateTransaction', { ...t, id: '5305e3bab097f420a62ced0c' })
    expect(other.error.code).toBe(-31099) // заказ уже оплачивается

    const perf = (await payme('PerformTransaction', { id: t.id })).result
    expect(perf).toMatchObject({ state: 2, transaction: c1.transaction })
    expect((await payme('PerformTransaction', { id: t.id })).result).toEqual(perf)
    expect(await db.admission.count({ where: { lotId: lot.id } })).toBe(1)
    expect((await payme('CheckTransaction', { id: t.id })).result).toMatchObject({
      state: 2,
      create_time: c1.create_time,
      perform_time: perf.perform_time,
      cancel_time: 0,
      reason: null,
    })
    expect((await payme('CheckTransaction', { id: 'missing' })).error.code).toBe(-31003)

    const st = (await payme('GetStatement', { from: now.getTime() - H, to: now.getTime() + H })).result
    expect(st.transactions).toEqual([
      expect.objectContaining({ id: t.id, amount: 1_200_000, account: acc, state: 2, transaction: c1.transaction }),
    ])
  })

  it('Payme: отмена до проведения; проведённую без решения о возврате отменить нельзя, после выхода из лота — можно', async () => {
    const soon = { status: 'SCHEDULED' as const, opensAt: new Date(now.getTime() + 2 * H), closesAt: new Date(now.getTime() + 4 * H) }
    const { lot, u, start } = await startAdmission('payme', soon)
    const acc = { order_id: start.orderId }
    const t1 = { id: 'tx-cancel-1', time: now.getTime(), amount: 1_200_000, account: acc }
    await payme('CreateTransaction', t1)
    expect((await payme('CancelTransaction', { id: t1.id, reason: 3 })).result).toMatchObject({ state: -1 })
    expect((await payme('PerformTransaction', { id: t1.id })).error.code).toBe(-31008)

    const t2 = { ...t1, id: 'tx-cancel-2' }
    await payme('CreateTransaction', t2)
    await payme('PerformTransaction', { id: t2.id })
    expect((await payme('CancelTransaction', { id: t2.id, reason: 5 })).error.code).toBe(-31007)

    const leave = await app.inject({ method: 'DELETE', url: `/api/v1/lots/${lot.id}/admission`, headers: u.auth })
    expect(leave.json()).toEqual({ refunded: false }) // Payme: возвращают финансы в кабинете
    expect((await db.order.findUniqueOrThrow({ where: { id: start.orderId } })).status).toBe('REFUND_PENDING')
    expect((await payme('CancelTransaction', { id: t2.id, reason: 5 })).result).toMatchObject({ state: -2 })
    expect((await db.order.findUniqueOrThrow({ where: { id: start.orderId } })).status).toBe('REFUNDED')
    expect((await payme('CheckTransaction', { id: t2.id })).result).toMatchObject({ state: -2, reason: 5 })
  })

  it('Payme: не проведённая за 12 часов транзакция отменяется по таймауту (reason 4)', async () => {
    const { start } = await startAdmission('payme', { closesAt: new Date(now.getTime() + 24 * H) })
    const t = { id: 'tx-timeout', time: now.getTime(), amount: 1_200_000, account: { order_id: start.orderId } }
    await payme('CreateTransaction', t)
    now = new Date(now.getTime() + 12 * H + 1000)
    expect((await payme('PerformTransaction', { id: t.id })).error.code).toBe(-31008)
    expect((await payme('CheckTransaction', { id: t.id })).result).toMatchObject({ state: -1, reason: 4 })
    expect((await db.order.findUniqueOrThrow({ where: { id: start.orderId } })).status).toBe('PENDING')
  })

  it('Payme: оплата 10% после истечения срока не начинается; начатая вовремя — засчитывается, срок не «съедает» её', async () => {
    const { u, ob } = await prepaymentOrder(15)
    const r = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/obligations/${ob.id}/pay`,
        headers: u.auth,
        payload: { part: 'prepayment', provider: 'payme' },
      })
    ).json()
    const t = { id: 'tx-prepay', time: now.getTime(), amount: 30_000_000, account: { order_id: r.orderId } }
    now = new Date(now.getTime() + 14 * MIN)
    await payme('CreateTransaction', t)
    now = new Date(now.getTime() + 2 * MIN)
    // sweep сроков не аннулирует победу, пока идёт начатая вовремя оплата
    const { BuyoutService } = await import('../src/modules/fulfillment/buyout.service')
    expect(await app.get(BuyoutService).expireDue()).toBe(0)
    expect((await payme('PerformTransaction', { id: t.id })).result.state).toBe(2)
    expect((await db.obligation.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe('AWAITING_PICKUP')
  })
})
