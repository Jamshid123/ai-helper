import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Clock } from '../src/common/clock'
import { LotLifecycleService } from '../src/modules/auctions/lot-lifecycle.service'
import { BuyoutService } from '../src/modules/fulfillment/buyout.service'
import { RelistService } from '../src/modules/fulfillment/relist.service'
import { NotificationsService } from '../src/modules/notifications/notifications.service'
import { loginAs, loginStaff, startApp } from './app'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()
const MIN = 60_000
const H = 60 * MIN

/** Повторные торги: защиты и приглашение (решение 16.11.2026, вариант C). */
describe('Повторные торги: приглашение и защиты', () => {
  let app: NestFastifyApplication
  let now: Date
  const at = (ms: number) => (now = new Date(now.getTime() + ms))

  beforeAll(async () => {
    process.env.SMS_MODE = 'fake'
    app = await startApp()
    vi.spyOn(app.get(Clock), 'now').mockImplementation(() => new Date(now))
  })
  beforeEach(async () => {
    await cleanDb(db)
    now = new Date()
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    delete process.env.SMS_MODE
    await app?.close()
    await db.$disconnect()
  })

  const req = (method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers, payload })

  /** Лот закрылся: победитель (с сессией) + 2 оплаченных участника + 1 перенесённый с прошлых торгов. */
  async function failedLot(reason: 'prepayment' | 'pickup' = 'prepayment') {
    const product = await db.product.create({
      data: { title: 'Pixel 8', condition: 'USED', status: 'IN_LOT', inventoryNo: `R-${key()}`, category: { connect: { slug: 'phones' } } },
    })
    const lot = await createLot(db, {
      product: { connect: { id: product.id } },
      opensAt: new Date(now.getTime() - 2 * H),
      closesAt: new Date(now.getTime() - 1000),
      minParticipants: 3,
    })
    const winner = await loginAs(app, 970_001, 'Сорвал')
    const a = await loginAs(app, 970_002, 'Алия')
    const b = await loginAs(app, 970_003, 'Бобур')
    const carriedBefore = await createUser(db)
    // телефоны (вход на сайте по SMS) — для рассылки
    await db.user.update({ where: { id: a.userId }, data: { phone: '+998901000101' } })
    await db.user.update({ where: { id: b.userId }, data: { phone: '+998901000102' } })
    for (const uid of [winner.userId, a.userId, b.userId]) {
      const order = await db.order.create({
        data: { userId: uid, lotId: lot.id, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID' },
      })
      await db.admission.create({ data: { lotId: lot.id, userId: uid, orderId: order.id } })
    }
    // уже перенесённый допуск (orderId = null) — второй раз не переносится
    await db.admission.create({ data: { lotId: lot.id, userId: carriedBefore.id, carriedFromLotId: lot.id } })
    await db.bid.create({ data: { lotId: lot.id, userId: a.userId, amount: 2_000_000n, seq: 1, idempotencyKey: key() } })
    await db.bid.create({ data: { lotId: lot.id, userId: winner.userId, amount: 2_500_000n, seq: 2, idempotencyKey: key() } })
    await db.lot.update({ where: { id: lot.id }, data: { admittedCount: 4 } })
    await app.get(LotLifecycleService).close(lot.id)
    const ob = await db.obligation.findFirstOrThrow({ where: { lotId: lot.id } })
    if (reason === 'pickup') {
      await db.obligation.update({
        where: { id: ob.id },
        data: { status: 'AWAITING_PICKUP', remainderDeadline: new Date(now.getTime() + 24 * H) },
      })
      at(24 * H + MIN)
    } else at(16 * MIN)
    await app.get(BuyoutService).expireDue()
    const relist = await db.lot.findFirstOrThrow({ where: { relistOfId: lot.id } })
    return { lot, relist, winner, a, b, carriedBefore, product }
  }

  /** Назначить время начала повторных торгов (как оператор в форме лота). */
  const schedule = (lotId: string, hoursFromNow: number) =>
    db.lot.update({
      where: { id: lotId },
      data: {
        opensAt: new Date(now.getTime() + hoursFromNow * H),
        closesAt: new Date(now.getTime() + (hoursFromNow + 2) * H),
      },
    })

  it('переносится только оплаченный допуск и один раз; сорвавший не попадает к тому же товару даже за деньги', async () => {
    const { relist, winner, a, b, carriedBefore } = await failedLot()
    const carried = await db.admission.findMany({ where: { lotId: relist.id } })
    expect(carried.map((x) => x.userId).sort()).toEqual([a.userId, b.userId].sort())
    expect(carried.some((x) => x.userId === carriedBefore.id || x.userId === winner.userId)).toBe(false)
    expect(relist.admittedCount).toBe(2)

    // ограничение 7 дней сняли досрочно — к этому товару всё равно нельзя
    await db.restriction.updateMany({ where: { userId: winner.userId }, data: { liftedAt: now } })
    const staff = await loginStaff(app)
    await schedule(relist.id, 30)
    expect((await req('POST', `/admin/lots/${relist.id}/publish`, staff.write, {})).statusCode).toBe(200)
    const r = await req('POST', `/lots/${relist.id}/admission`, winner.auth, { acceptRules: true })
    expect(r.json()).toMatchObject({ code: 'PRODUCT_BLOCKED' })
  })

  it('публикация: не позже чем за 24 ч до старта; если товар не забрали — нужна отметка о перепроверке', async () => {
    const { relist } = await failedLot('pickup')
    const staff = await loginStaff(app)
    await schedule(relist.id, 10)
    expect((await req('POST', `/admin/lots/${relist.id}/publish`, staff.write, {})).json().code).toBe('RELIST_TOO_SOON')
    await schedule(relist.id, 30)
    const list = (await req('GET', '/admin/lots', staff.read)).json()
    expect(list.find((l: { id: string }) => l.id === relist.id)).toMatchObject({ needsRelistCheck: true, carriedCount: 2 })
    expect((await req('POST', `/admin/lots/${relist.id}/publish`, staff.write, {})).json().code).toBe('RELIST_CHECK_REQUIRED')
    const ok = await req('POST', `/admin/lots/${relist.id}/publish`, staff.write, { inspectionConfirmed: true })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ status: 'SCHEDULED', relistCheckedAt: expect.any(String) })
  })

  it('публикация приглашает перенесённых (без сорвавшего); старый лот ведёт на новый; имена на старом лоте скрыты', async () => {
    const { lot, relist, a, winner } = await failedLot()
    // до публикации: «готовим повторные торги», ссылки на черновик нет
    const before = (await req('GET', `/lots/${lot.id}`, {})).json()
    expect(before).toMatchObject({ relistPending: true, relistLotId: null })

    const staff = await loginStaff(app)
    await schedule(relist.id, 30)
    await req('POST', `/admin/lots/${relist.id}/publish`, staff.write, {})
    expect(await db.notification.count({ where: { lotId: relist.id, type: 'relist_invite' } })).toBe(2)
    expect(await db.notification.count({ where: { userId: winner.userId } })).toBe(0)
    expect(await app.get(RelistService).inviteOnPublish(db, relist.id)).toBe(0) // без дублей

    const mine = (await req('GET', '/me/notifications', a.auth)).json()
    expect(mine).toEqual([expect.objectContaining({ type: 'relist_invite', lotId: relist.id, lotTitle: relist.title })])
    expect((await req('POST', `/me/notifications/${mine[0].id}/read`, a.auth)).statusCode).toBe(200)
    expect((await req('GET', '/me/notifications', a.auth)).json()).toEqual([])

    const adm = (await req('GET', '/me/admissions', a.auth)).json()
    expect(adm.find((x: { lotId: string }) => x.lotId === relist.id)).toMatchObject({
      carried: true,
      confirmed: false,
      status: 'SCHEDULED',
    })
    expect(adm.find((x: { lotId: string }) => x.lotId === lot.id)).toMatchObject({ carried: false, confirmed: true })
    expect((await req('GET', `/lots/${lot.id}`, {})).json()).toMatchObject({ relistLotId: relist.id, relistPending: false })

    const history = (await req('GET', `/lots/${lot.id}/bids`, a.auth)).json()
    expect(history.bids.map((x: { bidder: string; mine: boolean }) => (x.mine ? 'me' : x.bidder))).toEqual(['Участник', 'me'])
  })

  it('«Подтверждаю участие»; напоминание за 6 ч только неподтвердившим; за 2 ч их места освобождаются', async () => {
    const { relist, a, b } = await failedLot()
    const staff = await loginStaff(app)
    await schedule(relist.id, 30)
    await req('POST', `/admin/lots/${relist.id}/publish`, staff.write, {})
    expect((await req('POST', `/lots/${relist.id}/admission/confirm`, a.auth)).json()).toEqual({ confirmed: true })

    const relistSvc = app.get(RelistService)
    at(24 * H + 1) // осталось < 6 ч
    expect(await relistSvc.remindDue()).toBe(1)
    expect(await relistSvc.remindDue()).toBe(0)
    expect(await db.notification.findFirst({ where: { type: 'relist_reminder' } })).toMatchObject({ userId: b.userId })

    at(4 * H) // осталось < 2 ч
    expect(await relistSvc.releaseUnconfirmed()).toBe(1)
    const left = await db.admission.findMany({ where: { lotId: relist.id } })
    expect(left.map((x) => x.userId)).toEqual([a.userId])
    expect((await db.lot.findUniqueOrThrow({ where: { id: relist.id } })).admittedCount).toBe(1)
    expect(await db.notification.count({ where: { userId: b.userId, type: 'relist_released' } })).toBe(1)
  })

  it('приглашение уходит SMS один раз; не набрали минимум → отмена и SMS перенесённым; старые не досылаются', async () => {
    const { relist, a } = await failedLot()
    const staff = await loginStaff(app)
    const notifications = app.get(NotificationsService)
    await schedule(relist.id, 30)
    await req('POST', `/admin/lots/${relist.id}/publish`, staff.write, {})
    expect(await notifications.dispatchSms()).toBe(2) // приглашения двум перенесённым
    expect(await notifications.dispatchSms()).toBe(0) // ровно один раз

    await req('POST', `/lots/${relist.id}/admission/confirm`, a.auth)
    at(30 * H + MIN) // старт: допущены двое, а минимум — 3
    await app.get(LotLifecycleService).openDue()
    expect((await db.lot.findUniqueOrThrow({ where: { id: relist.id } })).status).toBe('CANCELLED')
    expect(await db.notification.count({ where: { lotId: relist.id, type: 'relist_cancelled' } })).toBe(2)
    expect(await notifications.dispatchSms()).toBe(2)

    // уведомление, которое лежит дольше 12 ч (например, SMS подключили позже), не досылается
    await db.notification.create({
      data: { userId: a.userId, type: 'relist_reminder', lotId: relist.id, createdAt: new Date(now.getTime() - 13 * H) },
    })
    expect(await notifications.dispatchSms()).toBe(0)
  })
})
