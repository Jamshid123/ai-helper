import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/bootstrap'
import { publicNameFor } from '../src/modules/auth/auth.service'
import { signInitData } from '../src/modules/auth/telegram-init-data'
import { cleanDb } from './factories'

const db = new PrismaClient()

function initData(user: object, token = process.env.TELEGRAM_BOT_TOKEN!) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000) - 5), query_id: 'AA', user: JSON.stringify(user) }
  return new URLSearchParams({ ...fields, hash: signInitData(fields, token) }).toString()
}

describe('Вход из Mini App', () => {
  let app: NestFastifyApplication
  beforeAll(async () => {
    app = await createApp()
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  beforeEach(() => cleanDb(db))
  afterAll(async () => {
    await app?.close()
    await db.$disconnect()
  })

  const login = (data: string) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/telegram', payload: { initData: data } })

  it('по валидному initData создаёт покупателя и выдаёт сессию; повторный вход — тот же аккаунт', async () => {
    const res = await login(initData({ id: 777001, first_name: 'Азиз', last_name: 'Каримов' }))
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user).toMatchObject({ firstName: 'Азиз', publicName: 'Азиз К.', phoneVerified: false })
    expect(body.user).not.toHaveProperty('phone')
    expect(body.user).not.toHaveProperty('telegramId')

    const again = (await login(initData({ id: 777001, first_name: 'Азиз', last_name: 'Каримов' }))).json()
    expect(again.user.id).toBe(body.user.id)
    expect(await db.user.count()).toBe(1)

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${body.token}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().id).toBe(body.user.id)
  })

  it('чужая подпись и пустой запрос — отказ, пользователь не создаётся', async () => {
    expect((await login(initData({ id: 1, first_name: 'X' }, '999:WRONG-TOKEN-xxxxxxxxxxxxxx'))).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/telegram', payload: {} })).statusCode).toBe(400)
    expect(await db.user.count()).toBe(0)
  })

  it('защищённые эндпоинты закрыты по умолчанию: без токена и с подделкой — 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(401)
    const forged = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' },
    })
    expect(forged.statusCode).toBe(401)
  })

  it('публичное имя: «Имя Ф.» или «Участник NNNN»', () => {
    expect(publicNameFor({ id: 5, first_name: 'Малика', last_name: 'тошева' })).toBe('Малика Т.')
    expect(publicNameFor({ id: 1234567, first_name: 'Dilshod' })).toBe('Участник 4567')
  })
})
