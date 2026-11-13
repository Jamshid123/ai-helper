import { z } from 'zod'

/**
 * Конфигурация из переменных окружения. Нет обязательной переменной — приложение не стартует.
 * Никаких фолбэков для секретов (скилл security, «insecure defaults»).
 * Значения по умолчанию — только для несекретного и только безопасные.
 */
const csv = z
  .string()
  .min(1)
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  )

export const envSchema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  REDIS_URL: z.string().url().startsWith('redis://'),
  /** Разрешённые origin для CORS, через запятую. «*» запрещён. */
  CORS_ORIGINS: csv.refine((list) => !list.includes('*'), 'CORS_ORIGINS не может содержать *'),
  /** disabled — оплата выключена (безопасно по умолчанию); fake — только демо/тесты; live — реальный партнёр. */
  PAYMENTS_MODE: z.enum(['disabled', 'fake', 'live']).default('disabled'),
  /** Токен бота: проверка подписи initData и отправка уведомлений. */
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]{20,}$/, 'неверный формат токена бота'),
  /** Секрет подписи сессий покупателей (HS256), не короче 32 символов. */
  JWT_SECRET: z.string().min(32),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment configuration — ${issues}`)
  }
  const env = parsed.data
  if (env.NODE_ENV === 'production' && env.PAYMENTS_MODE === 'fake') {
    throw new Error('PAYMENTS_MODE=fake запрещён в production')
  }
  return env
}
