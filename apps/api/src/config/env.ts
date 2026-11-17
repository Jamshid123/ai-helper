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

/** Необязательная переменная: пустая строка («KEY=» в .env) — то же, что не задана. */
const opt = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional())

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
  /**
   * Click (решение 17.11.2026). Все четыре — вместе; без них Click не предлагается покупателю.
   * Выдаются при подключении кассы; SECRET_KEY — секрет (подпись запросов Click и наших запросов к Click).
   */
  CLICK_SERVICE_ID: opt(z.coerce.number().int().positive()),
  CLICK_MERCHANT_ID: opt(z.coerce.number().int().positive()),
  CLICK_MERCHANT_USER_ID: opt(z.coerce.number().int().positive()),
  CLICK_SECRET_KEY: opt(z.string().min(8)),
  /** Payme (решение 17.11.2026): ID веб-кассы и ключ (пароль Basic-авторизации запросов Payme). Оба — вместе. */
  PAYME_MERCHANT_ID: opt(z.string().regex(/^[0-9a-f]{24}$/, 'PAYME_MERCHANT_ID — 24 hex-символа')),
  PAYME_KEY: opt(z.string().min(16)),
  /** Тестовая среда Payme: страница оплаты test.paycom.uz (песочница). В бою — false. */
  PAYME_TEST_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Принимать запросы Payme только с их IP (185.234.113.1–15). Выключать — только в тестах. */
  PAYME_IP_CHECK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Адрес сайта покупателя для возврата со страницы оплаты; по умолчанию — первый из CORS_ORIGINS. */
  PUBLIC_SITE_URL: opt(z.string().url()),
  /** SMS для входа и уведомлений: disabled — вход недоступен; fake — код в ответе (только демо/тесты). */
  SMS_MODE: z.enum(['disabled', 'fake']).default('disabled'),
  /** Токен бота: проверка подписи initData и отправка уведомлений. */
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]{20,}$/, 'неверный формат токена бота'),
  /** Секрет подписи сессий покупателей (HS256), не короче 32 символов. */
  JWT_SECRET: z.string().min(32),
  /** Ключ шифрования секретов в БД (TOTP сотрудников, позже IMEI): 32 байта hex. Генерируется на сервере при выкладке. */
  /** Папка для фото товаров (в контейнере — том Docker). */
  MEDIA_DIR: z.string().min(1).default('/data/media'),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'DATA_ENCRYPTION_KEY — 64 hex-символа'),
  /** Догоняющий sweep расписания (открытие/закрытие лотов). В тестах выключается. */
  SCHEDULER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
  /** Ограничение частоты запросов (решение 15.11.2026). Выключать можно только в тестах; в production — запрещено. */
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * Демо-стенд (решение заказчика 14.11.2026): разрешает PAYMENTS_MODE=fake в production и скрипт тестовых лотов.
   * Только явное «true»; на боевом запуске с партнёром — убрать.
   */
  DEMO_STAND: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment configuration — ${issues}`)
  }
  const env = parsed.data
  if (env.NODE_ENV === 'production' && env.SMS_MODE === 'fake' && !env.DEMO_STAND) {
    throw new Error('SMS_MODE=fake запрещён в production (кроме демо-стенда, DEMO_STAND=true)')
  }
  if (env.NODE_ENV === 'production' && env.PAYMENTS_MODE === 'fake' && !env.DEMO_STAND) {
    throw new Error('PAYMENTS_MODE=fake запрещён в production (кроме демо-стенда, DEMO_STAND=true)')
  }
  const click = [env.CLICK_SERVICE_ID, env.CLICK_MERCHANT_ID, env.CLICK_MERCHANT_USER_ID, env.CLICK_SECRET_KEY]
  if (click.some((v) => v !== undefined) && click.some((v) => v === undefined)) {
    throw new Error('Click: задайте все четыре CLICK_SERVICE_ID, CLICK_MERCHANT_ID, CLICK_MERCHANT_USER_ID, CLICK_SECRET_KEY')
  }
  if ((env.PAYME_MERCHANT_ID === undefined) !== (env.PAYME_KEY === undefined)) {
    throw new Error('Payme: задайте оба PAYME_MERCHANT_ID и PAYME_KEY')
  }
  if (env.PAYMENTS_MODE === 'live' && !click[0] && !env.PAYME_MERCHANT_ID) {
    throw new Error('PAYMENTS_MODE=live: не настроена ни одна платёжная система (Click / Payme)')
  }
  if (env.NODE_ENV === 'production' && !env.PAYME_IP_CHECK) {
    throw new Error('PAYME_IP_CHECK=false запрещён в production')
  }
  if (env.NODE_ENV === 'production' && env.PAYME_TEST_MODE && !env.DEMO_STAND) {
    throw new Error('PAYME_TEST_MODE=true запрещён в production (кроме демо-стенда)')
  }
  if (env.NODE_ENV === 'production' && !env.RATE_LIMIT_ENABLED) {
    throw new Error('RATE_LIMIT_ENABLED=false запрещён в production')
  }
  return env
}
