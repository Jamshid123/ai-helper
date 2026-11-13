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
import { REMINDER_OPTIONS, RemindersService } from './reminders.service'

const bodySchema = z.object({
  minutesBefore: z.union(
    REMINDER_OPTIONS.map((m) => z.literal(m)) as [z.ZodLiteral<15>, z.ZodLiteral<60>, z.ZodLiteral<1440>]
  ),
})

/** «Напомнить о начале» по лоту. Доступно любому вошедшему покупателю, допуск не нужен. */
@Controller('lots/:lotId/reminder')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Put()
  @HttpCode(200)
  set(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success)
      throw new BadRequestException({ code: 'BAD_REQUEST', message: 'Выберите: за 15 минут, за час или накануне' })
    return this.reminders.set(req.userId, lotId, parsed.data.minutesBefore)
  }

  @Get()
  get(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Req() req: AuthedRequest) {
    return this.reminders.get(req.userId, lotId)
  }

  @Delete()
  @HttpCode(204)
  async cancel(@Param('lotId', new ParseUUIDPipe()) lotId: string, @Req() req: AuthedRequest) {
    await this.reminders.cancel(req.userId, lotId)
  }
}
