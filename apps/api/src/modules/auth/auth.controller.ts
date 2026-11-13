import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common'
import { z } from 'zod'
import { Public } from '../../common/public.decorator'
import { AuthService } from './auth.service'
import type { AuthedRequest } from './buyer-auth.guard'

const loginSchema = z.object({ initData: z.string().min(1).max(4096) })

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
