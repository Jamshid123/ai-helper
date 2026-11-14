import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import { serializeCookie } from '../../common/cookies'
import { Public } from '../../common/public.decorator'
import { StaffOnly } from './staff.decorator'
import { CSRF_COOKIE, SESSION_COOKIE, type StaffRequest } from './staff-auth.guard'
import { SESSION_TTL_S, StaffAuthService } from './staff-auth.service'

const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })

@Controller('admin')
export class StaffAuthController {
  constructor(private readonly auth: StaffAuthService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: StaffRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const p = loginSchema.safeParse(body)
    if (!p.success) throw new BadRequestException({ code: 'BAD_REQUEST', message: 'Укажите email и пароль' })
    const r = await this.auth.login(p.data.email, p.data.password, req.ip ?? null)
    reply.header('Set-Cookie', [
      serializeCookie(SESSION_COOKIE, r.token, { path: '/api', maxAge: SESSION_TTL_S, httpOnly: true }),
      serializeCookie(CSRF_COOKIE, r.csrfToken, { path: '/', maxAge: SESSION_TTL_S, httpOnly: false }),
    ])
    return r.user
  }

  @StaffOnly()
  @Get('me')
  me(@Req() req: StaffRequest) {
    return this.auth.me(req.staff.id)
  }

  @StaffOnly()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: StaffRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(req.staff, req.ip ?? null)
    reply.header('Set-Cookie', [
      serializeCookie(SESSION_COOKIE, '', { path: '/api', maxAge: 0, httpOnly: true }),
      serializeCookie(CSRF_COOKIE, '', { path: '/', maxAge: 0, httpOnly: false }),
    ])
  }
}
