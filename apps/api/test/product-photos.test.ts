import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loginStaff, startApp } from './app'
import { cleanDb, createLot } from './factories'

const db = new PrismaClient()
const MEDIA = mkdtempSync(join(tmpdir(), 'auksion-media-'))
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)])
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)])

type Photo = { id: string; url: string }

describe('Фото товара (диск сервера, видны всем — решение 14.11.2026)', () => {
  let app: NestFastifyApplication
  beforeAll(async () => {
    process.env.MEDIA_DIR = MEDIA
    app = await startApp()
  })
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
    rmSync(MEDIA, { recursive: true, force: true })
  })

  async function product() {
    const categoryId = (await db.category.findUniqueOrThrow({ where: { slug: 'phones' } })).id
    return db.product.create({ data: { categoryId, title: 'iPhone 13', condition: 'USED' } })
  }
  const upload = (id: string, h: Record<string, string>, body: Buffer, type = 'image/jpeg') =>
    app.inject({
      method: 'POST',
      url: `/api/v1/admin/products/${id}/photos`,
      headers: { ...h, 'content-type': type },
      payload: body,
    })

  it('загрузка → в карточке товара, в лоте каталога и по ссылке; порядок и удаление', async () => {
    const s = await loginStaff(app, { products: 'edit' })
    const p = await product()
    const a = await upload(p.id, s.write, JPEG)
    expect(a.statusCode).toBe(201)
    const b = await upload(p.id, s.write, PNG, 'image/png')
    const photos: Photo[] = b.json().photos
    expect(photos).toHaveLength(2)
    expect(photos[0].url).toMatch(/^\/api\/v1\/media\/[0-9a-f-]{36}\.jpg$/)

    // раздача: без входа, правильный тип, долгий кэш, те же байты
    const file = await app.inject({ method: 'GET', url: photos[0].url })
    expect(file.statusCode).toBe(200)
    expect(file.headers['content-type']).toBe('image/jpeg')
    expect(file.headers['cache-control']).toContain('immutable')
    expect(file.rawPayload.equals(JPEG)).toBe(true)

    // фото видны в лоте каталога, в т.ч. без допуска
    const lot = await createLot(db, { status: 'SCHEDULED', product: { connect: { id: p.id } } })
    const pub = (await app.inject({ method: 'GET', url: `/api/v1/lots/${lot.id}` })).json()
    expect(pub.photos).toEqual(photos.map((x) => x.url))

    // порядок: вторая — главной
    const order = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/products/${p.id}/photos/order`,
      headers: s.write,
      payload: { ids: [photos[1].id, photos[0].id] },
    })
    expect(order.statusCode, order.body).toBe(200)
    expect(order.json().photos.map((x: Photo) => x.id)).toEqual([photos[1].id, photos[0].id])

    // удаление: запись и файл
    const name = photos[0].url.split('/').pop()!
    expect(existsSync(join(MEDIA, name))).toBe(true)
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/products/${p.id}/photos/${photos[0].id}`,
      headers: s.write,
    })
    expect(del.json().photos).toHaveLength(1)
    expect(existsSync(join(MEDIA, name))).toBe(false)
    expect((await app.inject({ method: 'GET', url: photos[0].url })).statusCode).toBe(404)
  })

  it('не картинка, лимит 10, проданный товар, права и чужие имена файлов', async () => {
    const s = await loginStaff(app, { products: 'edit' })
    const p = await product()
    // тип проверяется по байтам, а не по заголовку
    const fake = await upload(p.id, s.write, Buffer.from('<script>alert(1)</script>'))
    expect(fake.statusCode).toBe(400)
    expect(fake.json().code).toBe('BAD_IMAGE')
    expect((await upload(p.id, s.write, JPEG, 'text/plain')).json().code).toBe('BAD_IMAGE')

    for (let i = 0; i < 10; i++) expect((await upload(p.id, s.write, JPEG)).statusCode).toBe(201)
    const over = await upload(p.id, s.write, JPEG)
    expect(over.statusCode).toBe(409)
    expect(over.json().code).toBe('PHOTO_LIMIT')

    const sold = await db.product.update({ where: { id: (await product()).id }, data: { status: 'SOLD' } })
    expect((await upload(sold.id, s.write, JPEG)).json().code).toBe('PRODUCT_LOCKED')
    const live = await product()
    await createLot(db, { status: 'LIVE', product: { connect: { id: live.id } } })
    expect((await upload(live.id, s.write, JPEG)).json().code).toBe('PRODUCT_LOCKED') // идут торги

    const viewer = await loginStaff(app, { products: 'view' })
    expect((await upload(p.id, viewer.write, JPEG)).statusCode).toBe(403)
    expect((await upload(p.id, s.read, JPEG)).statusCode).toBe(403) // без CSRF

    for (const bad of ['..%2F..%2Fetc%2Fpasswd', 'x.jpg', 'a.svg'])
      expect((await app.inject({ method: 'GET', url: `/api/v1/media/${bad}` })).statusCode).toBe(404)
  })
})
