import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import { z } from 'zod'
import type { AuthedRequest } from '../auth/buyer-auth.guard'
import { BidsService } from './bids.service'

const bodySchema = z.object({
  /** Целые сумы строкой (без float). */
  amount: z.string().regex(/^[1-9]\d{0,14}$/),
  idempotencyKey: z.string().uuid(),
})

@Controller('lots/:lotId/bids')
export class BidsController {
  constructor(private readonly bids: BidsService) {}

  /** Ход торгов (комната опрашивает каждые несколько секунд, пока нет WebSocket). */
  @Get()
  history(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Req() req: AuthedRequest) {
    return this.bids.history(req.userId, lotId)
  }

  /** Предложить цену. Повтор с тем же idempotencyKey возвращает исходный результат. */
  @Post()
  @HttpCode(200)
  async place(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException({ code: 'BAD_REQUEST', message: 'Неверная сумма или ключ' })
    const r = await this.bids.placeBid(req.userId, lotId, BigInt(parsed.data.amount), parsed.data.idempotencyKey)
    return {
      bid: { id: r.bid.id, seq: r.bid.seq, amount: r.bid.amount.toString(), createdAt: r.bid.createdAt.toISOString() },
      currentPrice: r.currentPrice.toString(),
      minNextBid: r.minNextBid.toString(),
      replayed: r.replayed,
    }
  }
}
