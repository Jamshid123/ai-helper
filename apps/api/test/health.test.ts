import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/bootstrap'

describe('GET /api/v1/health', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    app = await createApp()
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(async () => app?.close())

  it('отвечает ok, когда БД и Redis доступны, и ставит защитные заголовки', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok', db: 'ok', redis: 'ok' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('CORS разрешён только своему домену', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://auksion.expertly.uz' },
    })
    expect(ok.headers['access-control-allow-origin']).toBe('https://auksion.expertly.uz')
    const evil = await app.inject({ method: 'GET', url: '/api/v1/health', headers: { origin: 'https://evil.example' } })
    expect(evil.headers['access-control-allow-origin']).toBeUndefined()
  })
})
