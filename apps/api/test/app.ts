import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { createApp } from '../src/bootstrap'
import { signInitData } from '../src/modules/auth/telegram-init-data'

export async function startApp(): Promise<NestFastifyApplication> {
  const app = await createApp()
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return app
}

export function initDataFor(user: { id: number; first_name: string; last_name?: string }) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000) - 5), user: JSON.stringify(user) }
  return new URLSearchParams({ ...fields, hash: signInitData(fields, process.env.TELEGRAM_BOT_TOKEN!) }).toString()
}

/** Входит как покупатель, возвращает { token, userId }. */
export async function loginAs(app: NestFastifyApplication, tgId: number, firstName = 'Тест') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/telegram',
    payload: { initData: initDataFor({ id: tgId, first_name: firstName }) },
  })
  const body = res.json()
  return {
    token: body.token as string,
    userId: body.user.id as string,
    auth: { authorization: `Bearer ${body.token}` },
  }
}
