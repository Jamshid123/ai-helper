/**
 * Создать владельца админки (все права, сотрудники и роли):
 *   printf '%s' "$PASSWORD" | node dist/scripts/create-admin.js --phone +998901234567 --first Имя --last Фамилия
 * Пароль — только из stdin (не из аргументов: они видны в списке процессов и логах).
 * Код TOTP подключается при первом входе в админку.
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '')
}

async function main() {
  const phone = arg('phone')
  const firstName = arg('first')
  const lastIdx = process.argv.indexOf('--last')
  const lastName = lastIdx > 0 ? (process.argv[lastIdx + 1] ?? '') : ''
  const password = await readStdin()
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] })
  try {
    const staff = await app.get(StaffAuthService).createStaff({ phone, firstName, lastName, password, isOwner: true })
    process.stdout.write(`Создан администратор ${staff.name} (${staff.phone}).\n`)
  } finally {
    await app.close()
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  process.stderr.write(
    `${msg.includes('Unique constraint') || msg.includes('PHONE_TAKEN') ? 'Сотрудник с таким телефоном уже есть' : msg}\n`
  )
  process.exit(1)
})
