import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import type { AuthedRequest } from '../auth/buyer-auth.guard'
import { ObligationsService } from './obligations.service'

@Controller()
export class ObligationsController {
  constructor(private readonly obligations: ObligationsService) {}

  /** Мои предложения купить (победы и приглашения следующему участнику). */
  @Get('me/obligations')
  mine(@Req() req: AuthedRequest) {
    return this.obligations.mine(req.userId)
  }

  /** Подтвердить покупку (за 15 минут после закрытия торгов или приглашения). */
  @Post('obligations/:id/confirm')
  @HttpCode(200)
  confirm(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: AuthedRequest) {
    return this.obligations.confirm(req.userId, id)
  }
}
