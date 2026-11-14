import { PrismaService } from '../src/prisma/prisma.service'
import type { Permissions } from '../src/modules/staff/permissions'
import { StaffAuthService } from '../src/modules/staff/staff-auth.service'
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

/** Вход сотрудника: 'owner' — владелец, иначе роль с этими правами. Возвращает заголовки для чтения и для мутаций (с CSRF). */
export async function loginStaff(
  app: NestFastifyApplication,
  access: 'owner' | Permissions = 'owner',
  phone = `+99890${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
) {
  const auth = app.get(StaffAuthService)
  const password = 'test password 123456'
  const roleId =
    access === 'owner'
      ? undefined
      : (await app.get(PrismaService).role.create({ data: { name: `test-${phone}`, permissions: access } })).id
  await auth.createStaff({ phone, firstName: 'Сотрудник', lastName: '', password, isOwner: access === 'owner', roleId })
  const res = await app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { login: phone, password } })
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] as string | string[])
  const get = (n: string) =>
    cookies
      .find((c) => c.startsWith(`${n}=`))!
      .split(';')[0]
      .split('=')
      .slice(1)
      .join('=')
  const cookie = `staff_session=${get('staff_session')}; csrf_token=${get('csrf_token')}`
  return {
    id: res.json().id as string,
    read: { cookie },
    write: { cookie, 'x-csrf-token': get('csrf_token') },
  }
}
