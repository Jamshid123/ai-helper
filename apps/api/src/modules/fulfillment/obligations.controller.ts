import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import { z } from 'zod'
import { LIMITS, RateLimit } from '../../common/rate-limit'
import type { AuthedRequest } from '../auth/buyer-auth.guard'
import { BuyoutService } from './buyout.service'
import { RelistService } from './relist.service'

const paySchema = z.object({ part: z.enum(['prepayment', 'remainder']) })

/** Покупатель: мои выигранные лоты и их оплата (10% сразу после торгов, остаток — онлайн или на месте). */
@Controller()
export class ObligationsController {
  constructor(private readonly buyout: BuyoutService) {}

  @Get('me/obligations')
  mine(@Req() req: AuthedRequest) {
    return this.buyout.mine(req.userId)
  }

  @RateLimit(LIMITS.payment)
  @Post('obligations/:id/pay')
  @HttpCode(200)
  pay(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const p = paySchema.safeParse(body)
    if (!p.success) throw new BadRequestException({ code: 'BAD_REQUEST', message: 'Что оплачиваем: prepayment или remainder' })
    return this.buyout.startPayment(req.userId, id, p.data.part)
  }
}

/** Повторные торги: перенесённый участник подтверждает, что придёт (иначе место освободится за 2 ч до старта). */
@Controller()
export class RelistController {
  constructor(private readonly relist: RelistService) {}

  @RateLimit(LIMITS.admission)
  @Post('lots/:lotId/admission/confirm')
  @HttpCode(200)
  confirm(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Req() req: AuthedRequest) {
    return this.relist.confirm(req.userId, lotId)
  }
}
