import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common'
import { z } from 'zod'
import { StaffOnly } from '../staff/staff.decorator'
import type { StaffRequest } from '../staff/staff-auth.guard'
import { BuyoutService } from './buyout.service'

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown, message: string): z.infer<T> {
  const r = schema.safeParse(body)
  if (!r.success) throw new BadRequestException({ code: 'BAD_REQUEST', message })
  return r.data
}
const actor = (req: StaffRequest) => ({ staffId: req.staff.id, ip: req.ip ?? null })

/** Выдача (ТЗ «Админка»: сотрудник выдачи подтверждает передачу товара): выкупы, оплата на месте, выдача по коду. */
@StaffOnly('fulfillment')
@Controller('admin/fulfillment')
export class AdminFulfillmentController {
  constructor(private readonly buyout: BuyoutService) {}

  @Get()
  list(@Query('filter') filter?: string) {
    const f = filter === 'all' || filter === 'decisions' ? filter : 'active'
    return this.buyout.list(f)
  }

  @Post(':id/remainder-onsite')
  @HttpCode(200)
  remainderOnSite(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const { method } = parse(z.object({ method: z.enum(['cash', 'card']) }), body, 'Как оплачено: наличные или карта')
    return this.buyout.markRemainderOnSite(id, method, actor(req))
  }

  @Post(':id/issue')
  @HttpCode(200)
  issue(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), body, 'Введите 6 цифр кода выдачи')
    return this.buyout.issue(id, code, actor(req))
  }
}

/** Финансы: решение по 10%, если победитель не забрал товар (решение 16.11.2026 — вручную, с причиной). */
@StaffOnly('finance')
@Controller('admin/finance/buyouts')
export class AdminBuyoutDecisionsController {
  constructor(private readonly buyout: BuyoutService) {}

  @Get()
  pending() {
    return this.buyout.list('decisions')
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const { decision, reason } = parse(
      z.object({ decision: z.enum(['REFUNDED', 'RETAINED']), reason: z.string().trim().min(3).max(500) }),
      body,
      'Выберите решение и укажите причину'
    )
    return this.buyout.decidePrepayment(id, decision, reason, actor(req))
  }
}
