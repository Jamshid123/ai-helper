import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import type { LotStatus } from '@prisma/client'
import { z } from 'zod'
import { StaffOnly } from '../staff/staff.decorator'
import type { StaffRequest } from '../staff/staff-auth.guard'
import { inspectionSchema, money, parse, reasonSchema } from './admin.schemas'
import { AdminLotsService, type LotInput } from './admin-lots.service'

const iso = z.string().datetime({ offset: true })
const editable = {
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(3000),
  inspection: inspectionSchema,
  startPrice: money,
  step: money,
  fee: z.string().regex(/^\d{1,12}$/),
  opensAt: iso,
  closesAt: iso,
  maxParticipants: z.number().int().min(1).max(100_000).nullable(),
  minParticipants: z.number().int().min(1).max(100_000).nullable(),
  /** Ожидание следующего предложения: 30 с…24 ч; null — без досрочного завершения. */
  bidTimeoutSec: z.number().int().min(30).max(86_400).nullable(),
}
const createSchema = z.object({
  productId: z.string().uuid(),
  ...editable,
  title: editable.title.optional(),
  description: editable.description.optional(),
  inspection: editable.inspection.optional(),
  fee: editable.fee.optional(),
  maxParticipants: editable.maxParticipants.optional(),
  minParticipants: editable.minParticipants.optional(),
  bidTimeoutSec: editable.bidTimeoutSec.optional(),
})
const patchSchema = z.object(editable).partial().strict()
const STATUSES: LotStatus[] = [
  'DRAFT',
  'SCHEDULED',
  'LIVE',
  'CLOSED_SOLD',
  'CLOSED_UNSOLD',
  'UNDER_REVIEW',
  'CANCELLED',
]

function toInput(d: Partial<z.infer<typeof patchSchema>>): LotInput {
  return {
    ...(d.title !== undefined && { title: d.title }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.inspection !== undefined && { inspection: d.inspection }),
    ...(d.startPrice && { startPrice: BigInt(d.startPrice) }),
    ...(d.step && { step: BigInt(d.step) }),
    ...(d.fee !== undefined && { fee: BigInt(d.fee) }),
    ...(d.opensAt && { opensAt: new Date(d.opensAt) }),
    ...(d.closesAt && { closesAt: new Date(d.closesAt) }),
    ...(d.maxParticipants !== undefined && { maxParticipants: d.maxParticipants }),
    ...(d.minParticipants !== undefined && { minParticipants: d.minParticipants }),
    ...(d.bidTimeoutSec !== undefined && { bidTimeoutSec: d.bidTimeoutSec }),
  }
}

/** Лоты: создать из товара, править до открытия, опубликовать, отменить с возвратом. Предложения и победителя не правим (ТЗ). */
@StaffOnly('lots')
@Controller('admin/lots')
export class AdminLotsController {
  constructor(private readonly lots: AdminLotsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.lots.list(STATUSES.includes(status as LotStatus) ? (status as LotStatus) : undefined)
  }

  @Get(':id')
  one(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.lots.one(id)
  }

  @Post()
  create(@Body() body: unknown, @Req() req: StaffRequest) {
    const d = parse(createSchema, body)
    const input = toInput(d)
    return this.lots.create(
      d.productId,
      {
        ...input,
        startPrice: BigInt(d.startPrice),
        step: BigInt(d.step),
        opensAt: new Date(d.opensAt),
        closesAt: new Date(d.closesAt),
      },
      { staffId: req.staff.id, ip: req.ip ?? null }
    )
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    return this.lots.update(id, toInput(parse(patchSchema, body)), { staffId: req.staff.id, ip: req.ip ?? null })
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: StaffRequest) {
    return this.lots.publish(id, { staffId: req.staff.id, ip: req.ip ?? null })
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const { reason } = parse(reasonSchema, body, 'Укажите причину отмены')
    return this.lots.cancel(id, reason, { staffId: req.staff.id, ip: req.ip ?? null })
  }
}
