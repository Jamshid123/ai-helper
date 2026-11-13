import { execSync } from 'node:child_process'

/**
 * Интеграционные тесты идут на настоящих PostgreSQL и Redis (блокировки и уникальные индексы
 * нельзя проверить моками). Локально: TEST_DATABASE_URL / TEST_REDIS_URL, в CI — service-контейнеры.
 * Схема пересоздаётся ТОЛЬКО в базе, имя которой оканчивается на `_test`.
 */
export default function setup() {
  const dbUrl = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55432/auksion_test'
  const dbName = new URL(dbUrl).pathname.slice(1)
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database "${dbName}" (name must end with _test)`)
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: dbUrl,
    REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379',
    CORS_ORIGINS: 'https://auksion.expertly.uz',
    LOG_LEVEL: 'warn',
    PAYMENTS_MODE: 'fake',
    TELEGRAM_BOT_TOKEN: '123456:TEST-TOKEN-not-real-xxxxxx',
    JWT_SECRET: 'test-secret-'.padEnd(40, 'x'),
    SCHEDULER_ENABLED: 'false',
  })
  const run = (cmd: string, input?: string) =>
    execSync(cmd, { env: process.env, input, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit' })
  run(
    'pnpm exec prisma db execute --stdin --schema prisma/schema.prisma',
    'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
  )
  run('pnpm exec prisma migrate deploy')
}
