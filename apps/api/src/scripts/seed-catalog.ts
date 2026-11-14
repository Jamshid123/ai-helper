/**
 * Наполняет демо-стенд категориями, товарами с фото и торгами: node dist/scripts/seed-catalog.js
 * Запускается вручную (workflow «Demo catalog»). Работает только при DEMO_STAND=true; повторный запуск не дублирует.
 */
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { seedDemoCatalog } from './demo-catalog'

async function main() {
  if (process.env.DEMO_STAND !== 'true') {
    process.stderr.write('DEMO_STAND не включён — демо-каталог заводится только на демо-стенде\n')
    process.exit(1)
  }
  const db = new PrismaClient()
  try {
    const r = await seedDemoCatalog(db, {
      // dist/scripts → корень пакета → demo-media
      mediaSrc: join(__dirname, '..', '..', 'demo-media'),
      mediaDir: process.env.MEDIA_DIR ?? '/data/media',
      now: new Date(),
    })
    process.stdout.write(
      `Категорий: ${r.categories}, новых товаров: ${r.products}, торгов: ${r.lots}, фото: ${r.photos}\n`
    )
  } finally {
    await db.$disconnect()
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
