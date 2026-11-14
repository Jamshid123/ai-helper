import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { seedDemoCatalog } from '../src/scripts/demo-catalog'
import { CATEGORIES, PRODUCTS } from '../src/scripts/demo-catalog-data'
import { cleanDb } from './factories'

const db = new PrismaClient()
const SRC = mkdtempSync(join(tmpdir(), 'demo-src-'))
const DST = mkdtempSync(join(tmpdir(), 'demo-dst-'))
for (const p of PRODUCTS)
  for (const f of p.photos) writeFileSync(join(SRC, f), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]))

describe('Демо-каталог (наполнение демо-стенда)', () => {
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await db.$disconnect()
    rmSync(SRC, { recursive: true, force: true })
    rmSync(DST, { recursive: true, force: true })
  })

  it('все фото каталога лежат в demo-media и указаны в CREDITS.md', () => {
    const dir = join(__dirname, '..', 'demo-media')
    const credits = readFileSync(join(dir, 'CREDITS.md'), 'utf8')
    for (const p of PRODUCTS) {
      expect(p.photos.length).toBeGreaterThan(0)
      for (const f of p.photos) {
        expect(existsSync(join(dir, f)), f).toBe(true)
        expect(credits, f).toContain(`\`${f}\``)
      }
    }
  })

  it('категории включены, товары с фото и актом, торги запланированы; повторный запуск не дублирует', async () => {
    const now = new Date()
    const r = await seedDemoCatalog(db, { mediaSrc: SRC, mediaDir: DST, now })
    const photoCount = PRODUCTS.reduce((n, p) => n + p.photos.length, 0)
    expect(r).toEqual({
      categories: CATEGORIES.length,
      products: PRODUCTS.length,
      lots: PRODUCTS.length,
      photos: photoCount,
    })

    const cats = await db.category.findMany({ where: { slug: { in: CATEGORIES.map((c) => c.slug) } } })
    expect(cats.every((c) => c.enabled)).toBe(true)
    expect(readdirSync(DST)).toHaveLength(photoCount)

    const lots = await db.lot.findMany({ include: { product: { include: { photos: true } } } })
    expect(lots).toHaveLength(PRODUCTS.length)
    for (const lot of lots) {
      expect(lot.status).toBe('SCHEDULED')
      expect(lot.opensAt.getTime()).toBeGreaterThan(now.getTime())
      expect(lot.closesAt.getTime()).toBeGreaterThan(lot.opensAt.getTime())
      expect(lot.step).toBeGreaterThanOrEqual(100_000n)
      expect(lot.product!.status).toBe('IN_LOT')
      expect(lot.product!.photos.length).toBeGreaterThan(0)
      expect(lot.product!.costPrice! <= lot.startPrice).toBe(true) // старт не ниже себестоимости
    }

    const again = await seedDemoCatalog(db, { mediaSrc: SRC, mediaDir: DST, now })
    expect(again).toMatchObject({ products: 0, lots: 0, photos: 0 })
    expect(await db.lot.count()).toBe(PRODUCTS.length)
  })
})
