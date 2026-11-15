import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { parseCookies, serializeCookie } from '../../common/cookies'
import { normalizeUzPhone } from '../../common/phone'
import { z } from 'zod'
import { Public } from '../../common/public.decorator'
import { AuthService } from './auth.service'
import type { AuthedRequest } from './buyer-auth.guard'
import {
  BUYER_CSRF_COOKIE,
  BUYER_DEVICE_COOKIE,
  BUYER_SESSION_COOKIE,
  BUYER_SESSION_TTL_S,
  BuyerSessionService,
  DEVICE,
  deviceFromCookie,
  deviceHashOf,
} from './buyer-session.service'
import { OtpService } from './otp.service'

const loginSchema = z.object({ initData: z.string().min(1).max(4096) })
const phoneSchema = z.object({ phone: z.string().max(40) })
const verifySchema = z.object({ phone: z.string().max(40), code: z.string().regex(/^\d{6}$/) })
const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(40),
  lastName: z.string().trim().max(40).optional(),
})

const deviceCookie = (id: string) =>
  serializeCookie(BUYER_DEVICE_COOKIE, id, { path: '/api', maxAge: DEVICE.COOKIE_TTL_S, httpOnly: true })

function phoneOf(raw: string): string {
  const phone = normalizeUzPhone(raw)
  if (!phone) throw new BadRequestException({ code: 'BAD_PHONE', message: 'Введите номер в формате +998 XX XXX XX XX' })
  return phone
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly sessions: BuyerSessionService
  ) {}

  /** Сайт (решение 15.11.2026): шаг 1 — SMS-код на номер. */
  @Public()
  @Post('otp/request')
  @HttpCode(200)
  async requestCode(
    @Body() body: unknown,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const p = phoneSchema.safeParse(body)
    if (!p.success) throw new BadRequestException({ code: 'BAD_PHONE', message: 'Введите номер телефона' })
    const phone = phoneOf(p.data.phone)
    const device = deviceFromCookie(parseCookies(req.headers.cookie)[BUYER_DEVICE_COOKIE])
    if (device.fresh) reply.header('Set-Cookie', deviceCookie(device.id))
    // лимит номеров на устройство — до отправки SMS
    await this.sessions.assertDeviceAllows(deviceHashOf(device.id), phone)
    return this.otp.request(phone, req.ip ?? null)
  }

  /** Шаг 2 — проверка кода → cookie-сессия (httpOnly) + CSRF-cookie. */
  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  async verifyCode(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const p = verifySchema.safeParse(body)
    if (!p.success) throw new BadRequestException({ code: 'OTP_INVALID', message: 'Введите 6 цифр из SMS' })
    const phone = phoneOf(p.data.phone)
    const device = deviceFromCookie(parseCookies(req.headers.cookie)[BUYER_DEVICE_COOKIE])
    const deviceHash = deviceHashOf(device.id)
    await this.sessions.assertDeviceAllows(deviceHash, phone)
    await this.otp.verify(phone, p.data.code)
    const r = await this.auth.loginWithPhone(phone)
    const s = await this.sessions.issue(r.user.id, req.ip ?? null, deviceHash)
    reply.header('Set-Cookie', [
      serializeCookie(BUYER_SESSION_COOKIE, s.token, { path: '/api', maxAge: BUYER_SESSION_TTL_S, httpOnly: true }),
      serializeCookie(BUYER_CSRF_COOKIE, s.csrfToken, { path: '/', maxAge: BUYER_SESSION_TTL_S, httpOnly: false }),
      deviceCookie(device.id),
    ])
    return r
  }

  /** Шаг 3 (новый покупатель) — имя для профиля и ленты торгов. */
  @Post('profile')
  @HttpCode(200)
  profile(@Body() body: unknown, @Req() req: AuthedRequest) {
    const p = profileSchema.safeParse(body)
    if (!p.success) throw new BadRequestException({ code: 'BAD_NAME', message: 'Укажите имя' })
    return this.auth.updateProfile(req.userId, p.data.firstName, p.data.lastName ?? null)
  }

  /** Выход: сессия отзывается на сервере, cookie стираются. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.sessions.revoke(parseCookies(req.headers.cookie)[BUYER_SESSION_COOKIE])
    reply.header('Set-Cookie', [
      serializeCookie(BUYER_SESSION_COOKIE, '', { path: '/api', maxAge: 0, httpOnly: true }),
      serializeCookie(BUYER_CSRF_COOKIE, '', { path: '/', maxAge: 0, httpOnly: false }),
    ])
  }

  /** Вход из Mini App: сырой initData → сессия. */
  @Public()
  @Post('telegram')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException({ code: 'BAD_REQUEST', message: 'initData обязателен' })
    return this.auth.loginWithTelegram(parsed.data.initData)
  }

  /** Текущий покупатель (по сессии). */
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.auth.me(req.userId)
  }
}
