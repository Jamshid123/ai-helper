import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { CATEGORIES, PRODUCTS } from './demo-catalog-data'

/**
 * Наполнение демо-стенда (просьба заказчика 14.11.2026): категории, товары с фото, описанием и актом,
 * и торги по ним на ближайшие дни. Повторный запуск ничего не дублирует (товары — по инвентарному номеру DEMO-…).
 * Фото — свободные лицензии Wikimedia Commons (`demo-media/CREDITS.md`), копируются в MEDIA_DIR.
 * Торги заводятся как SCHEDULED — открывает и закрывает их только расписание; допуски и предложения не подделываются.
 */
export async function seedDemoCatalog(db: PrismaClient, opts: { mediaSrc: string; mediaDir: string; now: Date }) {
  const { mediaSrc, mediaDir, now } = opts
  await mkdir(mediaDir, { recursive: true })
  const available = new Set(await readdir(mediaSrc))
  const catId = new Map<string, string>()
  for (const c of CATEGORIES) {
    const row = await db.category.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, nameRu: c.ru, nameUz: c.uz, enabled: true, sortOrder: c.sort },
      // порядок в каталоге — как задумано для демо; названия не трогаем (их могли поправить в админке)
      update: { enabled: true, sortOrder: c.sort },
    })
    catId.set(c.slug, row.id)
  }

  let products = 0
  let lots = 0
  let photos = 0
  for (const p of PRODUCTS) {
    if (await db.product.findUnique({ where: { inventoryNo: p.inventoryNo } })) continue
    const files = p.photos.filter((f) => available.has(f))
    const opensAt = new Date(now.getTime() + p.opensInMin * 60_000)
    const closesAt = new Date(opensAt.getTime() + p.durationMin * 60_000)
    await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          categoryId: catId.get(p.category)!,
          title: p.title,
          condition: p.condition,
          description: p.description,
          inspection: p.inspection,
          inventoryNo: p.inventoryNo,
          costPrice: p.costPrice,
          status: 'IN_LOT',
        },
      })
      for (const [position, src] of files.entries()) {
        const file = `${randomUUID()}.jpg`
        await copyFile(join(mediaSrc, src), join(mediaDir, file))
        await tx.productPhoto.create({ data: { productId: product.id, file, position } })
        photos++
      }
      await tx.lot.create({
        data: {
          title: p.title,
          categoryId: product.categoryId,
          productId: product.id,
          condition: p.condition,
          description: p.description,
          inspection: p.inspection,
          startPrice: p.startPrice,
          step: p.step,
          fee: 12_000n,
          maxParticipants: p.maxParticipants ?? null,
          minParticipants: p.minParticipants ?? null,
          bidTimeoutSec: p.bidTimeoutSec ?? null,
          status: 'SCHEDULED',
          opensAt,
          closesAt,
        },
      })
    })
    products++
    lots++
  }
  return { categories: CATEGORIES.length, products, lots, photos }
}
