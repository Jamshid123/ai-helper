import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { currentOrNextSession } from '@auksion/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loginAs, loginStaff, startApp } from './app'
import { cleanDb, createLot } from './factories'

const db = new PrismaClient()
/** Ближайшее пятничное окно в будущем (лоты на проде — только в слот 09:00–18:00 по Ташкенту). */
function fridaySlot(weeksAhead = 1) {
  let s = currentOrNextSession(new Date())
  for (let i = 0; i < weeksAhead; i++) s = currentOrNextSession(new Date(s.closesAt.getTime() + 60_000))
  return { opensAt: s.opensAt.toISOString(), closesAt: s.closesAt.toISOString() }
}
const inspection = { summary: 'Как новый', battery: 90, imeiChecked: true, kit: ['Коробка'], defects: [] }

describe('Админка: категории, товары, лоты', () => {
  let app: NestFastifyApplication
  beforeAll(async () => (app = await startApp()))
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  const req = (method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers, payload })

  async function phonesId() {
    return (await db.category.findUniqueOrThrow({ where: { slug: 'phones' } })).id
  }
  async function product(h: Record<string, string>, extra: object = {}) {
    const r = await req('POST', '/admin/products', h, {
      categoryId: await phonesId(),
      title: 'iPhone 13, 128 ГБ',
      condition: 'USED',
      inspection,
      costPrice: '4000000',
      ...extra,
    })
    expect(r.statusCode).toBe(201)
    return r.json()
  }

  it('категории: публично только включённые (ru/uz, по порядку); админ добавляет, переименовывает, включает', async () => {
    const pub = await app.inject({ method: 'GET', url: '/api/v1/categories' })
    expect(pub.json()).toEqual([{ id: expect.any(String), slug: 'phones', name: { ru: 'Телефоны', uz: 'Telefonlar' } }])

    const s = await loginStaff(app)
    const list = (await req('GET', '/admin/categories', s.read)).json()
    expect(list.map((c: { slug: string; enabled: boolean }) => [c.slug, c.enabled])).toEqual([
      ['phones', true],
      ['travel', false],
    ])

    const bad = await req('POST', '/admin/categories', s.write, {
      slug: 'Ноутбуки',
      nameRu: 'Ноутбуки',
      nameUz: 'Noutbuklar',
    })
    expect(bad.statusCode).toBe(400)
    const created = await req('POST', '/admin/categories', s.write, {
      slug: 'laptops',
      nameRu: 'Ноутбуки',
      nameUz: 'Noutbuklar',
      sortOrder: 15,
    })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ slug: 'laptops', enabled: false })
    expect(
      (await req('POST', '/admin/categories', s.write, { slug: 'laptops', nameRu: 'x', nameUz: 'y' })).statusCode
    ).toBe(409)

    const id = created.json().id
    const patched = await req('PATCH', `/admin/categories/${id}`, s.write, { nameUz: 'Noutbuk', enabled: true })
    expect(patched.json()).toMatchObject({ nameUz: 'Noutbuk', enabled: true, slug: 'laptops' })
    const slugs = (await app.inject({ method: 'GET', url: '/api/v1/categories' }))
      .json()
      .map((c: { slug: string }) => c.slug)
    expect(slugs).toEqual(['phones', 'laptops'])
    expect(await db.auditLog.count({ where: { action: { startsWith: 'category.' } } })).toBe(2)
  })

  it('выключенная категория скрывает свои лоты из каталога Mini App', async () => {
    const lot = await createLot(db)
    expect((await app.inject({ method: 'GET', url: '/api/v1/lots' })).json()[0]).toMatchObject({
      id: lot.id,
      category: 'phones',
    })
    const s = await loginStaff(app)
    await req('PATCH', `/admin/categories/${await phonesId()}`, s.write, { enabled: false })
    expect((await app.inject({ method: 'GET', url: '/api/v1/lots' })).json()).toEqual([])
    expect((await app.inject({ method: 'GET', url: `/api/v1/lots/${lot.id}` })).statusCode).toBe(404)
  })

  it('доступ: без входа 401, без CSRF 403, роль без прав 403; оператор может', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/categories' })).statusCode).toBe(401)
    const buyer = await loginAs(app, 930_001)
    expect((await req('GET', '/admin/products', buyer.auth)).statusCode).toBe(401)
    const support = await loginStaff(app, { participants: 'edit' })
    expect((await req('GET', '/admin/products', support.read)).statusCode).toBe(403)
    const op = await loginStaff(app, { categories: 'edit', products: 'edit', lots: 'edit' })
    expect((await req('POST', '/admin/products', op.read, { title: 'x' })).statusCode).toBe(403) // без CSRF
    await product(op.write)
  })

  it('товар: полный IMEI шифруется, наружу — только последние 4 цифры', async () => {
    const s = await loginStaff(app)
    const p = await product(s.write, { imei: '356938035643809', inventoryNo: 'INV-0001' })
    expect(p).toMatchObject({
      title: 'iPhone 13, 128 ГБ',
      imeiLast4: '3809',
      status: 'AVAILABLE',
      costPrice: '4000000',
    })
    expect(JSON.stringify(p)).not.toContain('356938035643809')
    const row = await db.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(row.imeiEnc).not.toContain('356938035643809')
    const list = (await req('GET', '/admin/products', s.read)).json()
    expect(list).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain('imeiEnc')
    const upd = await req('PATCH', `/admin/products/${p.id}`, s.write, { title: 'iPhone 13, 256 ГБ' })
    expect(upd.json().title).toBe('iPhone 13, 256 ГБ')
  })

  it('лот из товара: черновик → публикация → виден в каталоге; карточка копируется в лот', async () => {
    const s = await loginStaff(app, { categories: 'edit', products: 'edit', lots: 'edit' })
    const p = await product(s.write)
    const slot = fridaySlot()
    const r = await req('POST', '/admin/lots', s.write, {
      productId: p.id,
      startPrice: '4500000',
      step: '100000',
      ...slot,
    })
    expect(r.statusCode).toBe(201)
    const lot = r.json()
    expect(lot).toMatchObject({
      status: 'DRAFT',
      title: p.title,
      startPrice: '4500000',
      fee: '12000',
      category: 'phones',
    })
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('IN_LOT')
    expect((await app.inject({ method: 'GET', url: '/api/v1/lots' })).json()).toEqual([]) // черновик не виден

    // второй лот из того же товара нельзя
    const dup = await req('POST', '/admin/lots', s.write, {
      productId: p.id,
      startPrice: '4500000',
      step: '100000',
      ...slot,
    })
    expect(dup.statusCode).toBe(409)

    const pub = await req('POST', `/admin/lots/${lot.id}/publish`, s.write)
    expect(pub.json().status).toBe('SCHEDULED')
    const catalog = (await app.inject({ method: 'GET', url: '/api/v1/lots' })).json()
    expect(catalog).toHaveLength(1)
    expect(catalog[0]).toMatchObject({ id: lot.id, status: 'scheduled', inspection: { battery: 90 } })
    expect(await db.auditLog.count({ where: { action: { in: ['lot.created', 'lot.published'] } } })).toBe(2)
  })

  it('правила лота: шаг ≥ 100 000, старт не ниже себестоимости, только пятничный слот 09:00–18:00', async () => {
    const s = await loginStaff(app)
    const p = await product(s.write)
    const slot = fridaySlot()
    const base = { productId: p.id, startPrice: '4500000', step: '100000', ...slot }
    expect((await req('POST', '/admin/lots', s.write, { ...base, step: '50000' })).json().code).toBe('STEP_TOO_SMALL')
    expect((await req('POST', '/admin/lots', s.write, { ...base, startPrice: '3900000' })).json().code).toBe(
      'START_BELOW_COST'
    )
    const wrongTime = { ...base, closesAt: new Date(Date.parse(slot.closesAt) - 3_600_000).toISOString() }
    expect((await req('POST', '/admin/lots', s.write, wrongTime)).json().code).toBe('NOT_FRIDAY_SLOT')
    expect((await req('POST', '/admin/lots', s.write, base)).statusCode).toBe(201)
  })

  it('правка: можно до открытия без участников; с участниками — 409; после открытия — 409 (ТЗ: фиксируется)', async () => {
    const s = await loginStaff(app)
    const p = await product(s.write)
    const lot = (
      await req('POST', '/admin/lots', s.write, {
        productId: p.id,
        startPrice: '4500000',
        step: '100000',
        ...fridaySlot(),
      })
    ).json()
    const ok = await req('PATCH', `/admin/lots/${lot.id}`, s.write, {
      startPrice: '4600000',
      description: 'Без коробки',
    })
    expect(ok.json()).toMatchObject({ startPrice: '4600000', description: 'Без коробки' })

    const live = await createLot(db) // идёт сейчас
    const locked = await req('PATCH', `/admin/lots/${live.id}`, s.write, { startPrice: '1' })
    expect(locked.statusCode).toBe(409)
    expect(locked.json().code).toBe('LOT_LOCKED')

    await req('POST', `/admin/lots/${lot.id}/publish`, s.write)
    const buyer = await loginAs(app, 930_010)
    const o = await db.order.create({
      data: {
        userId: buyer.userId,
        lotId: lot.id,
        purpose: 'ADMISSION',
        amount: 12_000n,
        provider: 'fake',
        status: 'PAID',
      },
    })
    await db.admission.create({ data: { lotId: lot.id, userId: buyer.userId, orderId: o.id } })
    await db.lot.update({ where: { id: lot.id }, data: { admittedCount: 1 } })
    const withPeople = await req('PATCH', `/admin/lots/${lot.id}`, s.write, { step: '200000' })
    expect(withPeople.json().code).toBe('LOT_HAS_PARTICIPANTS')
  })

  it('отмена лота до начала: участникам возврат 100%, допуски сняты, товар снова на складе; причина обязательна', async () => {
    const s = await loginStaff(app)
    const p = await product(s.write)
    const lot = (
      await req('POST', '/admin/lots', s.write, {
        productId: p.id,
        startPrice: '4500000',
        step: '100000',
        ...fridaySlot(),
      })
    ).json()
    await req('POST', `/admin/lots/${lot.id}/publish`, s.write)
    const buyer = await loginAs(app, 930_020)
    const adm = await app.inject({
      method: 'POST',
      url: `/api/v1/lots/${lot.id}/admission`,
      headers: buyer.auth,
      payload: { acceptRules: true },
    })
    await app.inject({
      method: 'POST',
      url: `/api/v1/payments/fake/${adm.json().orderId}/complete`,
      headers: buyer.auth,
    })
    expect((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).admittedCount).toBe(1)

    expect((await req('POST', `/admin/lots/${lot.id}/cancel`, s.write, {})).statusCode).toBe(400)
    const r = await req('POST', `/admin/lots/${lot.id}/cancel`, s.write, { reason: 'Брак при повторной проверке' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ status: 'CANCELLED', refunded: 1 })
    expect(await db.admission.count({ where: { lotId: lot.id } })).toBe(0)
    expect((await db.order.findUniqueOrThrow({ where: { id: adm.json().orderId } })).status).toBe('REFUNDED')
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('AVAILABLE')
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'lot.cancelled' } })
    expect(audit).toMatchObject({ actorId: s.id, reason: 'Брак при повторной проверке' })
    expect((await app.inject({ method: 'GET', url: '/api/v1/lots' })).json()).toEqual([])
  })
})
