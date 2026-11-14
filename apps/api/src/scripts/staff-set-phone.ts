/**
 * Перевести учётку сотрудника со старого email-логина на телефон:
 *   node dist/scripts/staff-set-phone.js --email admin@example.com --phone +998901234567
 * Запускается вручную (workflow «Staff set phone»). Номер в код и миграции не попадает.
 */
process.env.SCHEDULER_ENABLED = 'false'

import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module'
import { StaffAuthService } from '../modules/staff/staff-auth.service'

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`)
  const v = i > 0 ? process.argv[i + 1] : undefined
  if (!v) throw new Error(`Нужен параметр --${name}`)
  return v
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] })
  try {
    const s = await app.get(StaffAuthService).setPhoneByEmail(arg('email'), arg('phone'))
    process.stdout.write(`Готово: ${s.name} теперь входит по телефону ${s.phone}.\n`)
  } finally {
    await app.close()
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  process.stderr.write(`${msg.includes('Unique constraint') ? 'Этот телефон уже у другого сотрудника' : msg}\n`)
  process.exit(1)
})
