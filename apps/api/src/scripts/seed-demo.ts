/**
 * Заводит тестовые лоты на демо-стенде: node dist/scripts/seed-demo.js
 * Запускается вручную (workflow «Demo seed»). Работает только при DEMO_STAND=true
 * и только если в базе нет идущих или запланированных лотов.
 */
import { PrismaClient } from '@prisma/client'
import { seedDemoLots } from './demo-lots'

async function main() {
  if (process.env.DEMO_STAND !== 'true') {
    process.stderr.write('DEMO_STAND не включён — тестовые лоты заводятся только на демо-стенде\n')
    process.exit(1)
  }
  const db = new PrismaClient()
  try {
    const r = await seedDemoLots(db, new Date())
    process.stdout.write(`Создано тестовых лотов: ${r.created}\n`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
