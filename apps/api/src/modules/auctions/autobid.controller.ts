import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
} from '@nestjs/common'
import { z } from 'zod'
import type { AuthedRequest } from '../auth/buyer-auth.guard'
import { BidsService } from './bids.service'

const bodySchema = z.object({ maxAmount: z.string().regex(/^[1-9]\d{0,14}$/) })

/** Автопредложение до максимума. Максимум виден только владельцу. */
@Controller('lots/:lotId/autobid')
export class AutoBidController {
  constructor(private readonly bids: BidsService) {}

  @Put()
  @HttpCode(200)
  async set(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException({ code: 'BAD_REQUEST', message: 'Неверная сумма' })
    const r = await this.bids.setAutoBid(req.userId, lotId, BigInt(parsed.data.maxAmount))
    return {
      maxAmount: r.maxAmount.toString(),
      active: r.active,
      currentPrice: r.currentPrice?.toString() ?? null,
      leading: r.leading,
    }
  }

  @Get()
  async get(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Req() req: AuthedRequest) {
    const a = await this.bids.getAutoBid(req.userId, lotId)
    return a ? { maxAmount: a.maxAmount.toString(), active: a.active } : null
  }

  @Delete()
  @HttpCode(204)
  async cancel(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Req() req: AuthedRequest) {
    await this.bids.cancelAutoBid(req.userId, lotId)
  }
}
