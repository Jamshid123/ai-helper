import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { ENV } from './config/config.module'
import type { Env } from './config/env'
import { MAX_PHOTO_BYTES, MIME } from './modules/media/media.service'

export const API_PREFIX = 'api/v1'

/** Создаёт и настраивает приложение (используется в main.ts и тестах). */
export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 1_048_576 }),
    { bufferLogs: true }
  )
  const env = app.get<Env>(ENV)
  app.useLogger(app.get(Logger))
  app.setGlobalPrefix(API_PREFIX)
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true })
  app.enableShutdownHooks()

  const fastify = app.getHttpAdapter().getInstance()
  // загрузка фото товара: тело — сам файл (без multipart и новых зависимостей); тип проверяется по байтам
  fastify.addContentTypeParser(
    Object.values(MIME),
    { parseAs: 'buffer', bodyLimit: MAX_PHOTO_BYTES },
    (_req: unknown, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, body)
  )
  fastify.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'no-referrer')
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store')
  })
  return app
}
