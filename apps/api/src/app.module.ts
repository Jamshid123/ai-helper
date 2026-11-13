import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { ClockModule } from './common/clock.module'
import { RedisModule } from './common/redis.module'
import { ConfigModule, ENV } from './config/config.module'
import type { Env } from './config/env'
import { AuctionsModule } from './modules/auctions/auctions.module'
import { AuthModule } from './modules/auth/auth.module'
import { CatalogModule } from './modules/catalog/catalog.module'
import { PaymentsModule } from './modules/payments/payments.module'
import { RemindersModule } from './modules/reminders/reminders.module'
import { HealthModule } from './modules/health/health.module'
import { PrismaModule } from './prisma/prisma.module'

/** Поля, которые никогда не попадают в логи (скилл security). */
export const LOG_REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-telegram-bot-api-secret-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.initData',
  '*.phone',
  '*.imei',
]

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          redact: { paths: LOG_REDACT, censor: '[redacted]' },
          autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
        },
      }),
    }),
    ClockModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    PaymentsModule,
    RemindersModule,
    AuctionsModule,
  ],
})
export class AppModule {}
