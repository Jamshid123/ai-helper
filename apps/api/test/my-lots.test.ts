import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loginAs, startApp } from './app'
import { cleanDb, createLot, createUser, key } from './factories'

const db = new PrismaClient()
const H = 3_600_000

/**
 * «Мои лоты» (решение 18.11.2026): допуски с состоянием лота, итогом и судьбой взноса — всё считает сервер;
 * возвращённые взносы видны, хотя допуска уже нет; ограничение участия — с датой окончания.
 */
describe('Мои лоты: допуски, итог, взнос, ограничение', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  const get = (url: string, headers: Record<string, string>) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers })
  const paidAdmission = async (userId: string, lotId: string) => {
    const order = await db.order.create({
      data: { userId, lotId, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'PAID', paidAt: new Date() },
    })
    return db.admission.create({ data: { lotId, userId, orderId: order.id } })
  }
  const closed = (title: string) =>
    createLot(db, {
      title,
      status: 'CLOSED_SOLD',
      opensAt: new Date(Date.now() - 3 * H),
      closesAt: new Date(Date.now() - H),
    })
  const obligation = async (lotId: string, userId: string) => {
    const bid = await db.bid.create({ data: { lotId, userId, amount: 3_000_000n, seq: 1, idempotencyKey: key() } })
    return db.obligation.create({
      data: {
        lotId,
        userId,
        bidId: bid.id,
        rank: 1,
        amount: 3_000_000n,
        prepaymentAmount: 300_000n,
        status: 'AWAITING_PREPAYMENT',
        confirmDeadline: new Date(),
        prepaymentDeadline: new Date(Date.now() + 15 * 60_000),
      },
    })
  }

  it('у каждого допуска — состояние торгов, итог и судьба взноса; возвращённые взносы тоже в списке', async () => {
    const me = await loginAs(app, 970_001)
    const other = await createUser(db, { firstName: 'Чужой', publicName: 'Чужой П.' })

    const upcoming = await createLot(db, {
      title: 'Будущий',
      status: 'SCHEDULED',
      opensAt: new Date(Date.now() + 24 * H),
      closesAt: new Date(Date.now() + 26 * H),
    })
    await paidAdmission(me.userId, upcoming.id)
    const live = await createLot(db, { title: 'Идёт' })
    await paidAdmission(me.userId, live.id)
    const lost = await closed('Проиграл')
    await paidAdmission(me.userId, lost.id)
    await paidAdmission(other.id, lost.id)
    await obligation(lost.id, other.id)
    const won = await closed('Выиграл')
    await paidAdmission(me.userId, won.id)
    await obligation(won.id, me.userId)
    // перенесённый допуск (повторные торги): без заказа
    const relist = await createLot(db, {
      title: 'Повторные',
      status: 'SCHEDULED',
      opensAt: new Date(Date.now() + 30 * H),
      closesAt: new Date(Date.now() + 32 * H),
    })
    await db.admission.create({ data: { lotId: relist.id, userId: me.userId, carriedFromLotId: lost.id } })
    // вышел из лота до начала: допуска нет, взнос на возврате; другой — уже вернули
    const left = await createLot(db, {
      title: 'Вышел',
      status: 'SCHEDULED',
      opensAt: new Date(Date.now() + 5 * H),
      closesAt: new Date(Date.now() + 7 * H),
    })
    await db.order.create({
      data: { userId: me.userId, lotId: left.id, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'REFUND_PENDING' },
    })
    const cancelled = await createLot(db, { title: 'Отменён', status: 'CANCELLED' })
    await db.order.create({
      data: { userId: me.userId, lotId: cancelled.id, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake', status: 'REFUNDED' },
    })
    // чужие допуски и неоплаченные заказы в список не попадают
    await paidAdmission(other.id, upcoming.id)
    await db.order.create({ data: { userId: me.userId, lotId: live.id, purpose: 'ADMISSION', amount: 12_000n, provider: 'fake' } })

    const res = await get('/me/admissions', me.auth)
    expect(res.statusCode).toBe(200)
    const list = res.json() as Array<Record<string, unknown>>
    const by = Object.fromEntries(list.map((a) => [a.title as string, a]))
    expect(Object.keys(by).sort()).toEqual(['Будущий', 'Вышел', 'Выиграл', 'Идёт', 'Отменён', 'Повторные', 'Проиграл'].sort())

    expect(by['Будущий']).toMatchObject({ lotId: upcoming.id, status: 'SCHEDULED', admitted: true, feeStatus: 'PAID', outcome: null })
    expect(by['Идёт']).toMatchObject({ status: 'LIVE', admitted: true, feeStatus: 'PAID', outcome: null })
    expect(by['Проиграл']).toMatchObject({ status: 'CLOSED_SOLD', outcome: 'NOT_WON', feeStatus: 'PAID' })
    expect(by['Выиграл']).toMatchObject({ status: 'CLOSED_SOLD', outcome: 'WON' })
    expect(by['Повторные']).toMatchObject({ admitted: true, feeStatus: 'CARRIED', carried: true })
    expect(by['Вышел']).toMatchObject({ admitted: false, feeStatus: 'REFUND_PENDING', outcome: null })
    expect(by['Отменён']).toMatchObject({ admitted: false, feeStatus: 'REFUNDED', status: 'CANCELLED' })
    for (const a of list) expect(typeof a.closesAt).toBe('string')
    // ни имени победителя, ни чужих данных
    expect(JSON.stringify(list)).not.toMatch(/Чужой|phone|userId/)
  })

  it('/auth/me: активное ограничение участия — с датой окончания; снятое или истёкшее — нет', async () => {
    const me = await loginAs(app, 970_002)
    expect((await get('/auth/me', me.auth)).json().restrictedUntil).toBeNull()

    const endsAt = new Date(Date.now() + 7 * 24 * H)
    await db.restriction.create({
      data: { userId: me.userId, reason: 'Не оплачены 10%', startsAt: new Date(Date.now() - H), endsAt },
    })
    expect((await get('/auth/me', me.auth)).json().restrictedUntil).toBe(endsAt.toISOString())

    await db.restriction.updateMany({ where: { userId: me.userId }, data: { liftedAt: new Date() } })
    expect((await get('/auth/me', me.auth)).json().restrictedUntil).toBeNull()
    await db.restriction.create({
      data: { userId: me.userId, reason: 'старое', startsAt: new Date(Date.now() - 9 * 24 * H), endsAt: new Date(Date.now() - H) },
    })
    expect((await get('/auth/me', me.auth)).json().restrictedUntil).toBeNull()
  })
})
