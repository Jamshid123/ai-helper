import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'
import { RefundsService } from '../payments/refunds.service'
import { AuditService } from '../staff/audit.service'
import { StaffOnly } from '../staff/staff.decorator'
import type { StaffRequest } from '../staff/staff-auth.guard'
import { conflict, parse, reasonSchema } from './admin.schemas'

const restrictSchema = reasonSchema.extend({ days: z.number().int().min(1).max(365) })

/**
 * Участники (v1, решение 14.11.2026): поиск, карточка, ограничение на срок и снятие — только с причиной,
 * отмена допуска до начала торгов с возвратом 100%. Править предложения и победителя нельзя (ТЗ).
 * Телефон — персональные данные: виден только этим ролям.
 */
@StaffOnly('RISK', 'SUPPORT')
@Controller('admin/participants')
export class AdminParticipantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refunds: RefundsService,
    private readonly clock: Clock
  ) {}

  @Get()
  async search(@Query('q') q = '') {
    const term = q.trim().slice(0, 64)
    const digits = term.replace(/\D/g, '')
    // часть Telegram ID: у BigInt нет contains — ищем по тексту отдельным запросом
    const byTelegram =
      digits.length >= 3 && digits === term
        ? await this.prisma.$queryRaw<
            { id: string }[]
          >`SELECT id FROM "User" WHERE "telegramId"::text LIKE ${'%' + digits + '%'} LIMIT 50`
        : []
    const or: Prisma.UserWhereInput[] = [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { publicName: { contains: term, mode: 'insensitive' } },
      { username: { contains: term, mode: 'insensitive' } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ...(byTelegram.length ? [{ id: { in: byTelegram.map((r) => r.id) } }] : []),
    ]
    const now = this.clock.now()
    const users = await this.prisma.user.findMany({
      where: term ? { OR: or } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        _count: { select: { admissions: true } },
        restrictions: { where: { liftedAt: null, endsAt: { gt: now } }, take: 1, orderBy: { endsAt: 'desc' } },
      },
    })
    return users.map((u) => ({
      id: u.id,
      telegramId: u.telegramId.toString(),
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      publicName: u.publicName,
      phone: u.phone,
      admissions: u._count.admissions,
      restrictedUntil: u.restrictions[0]?.endsAt.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    }))
  }

  @Get(':id')
  async card(@Param('id', new ParseUUIDPipe()) id: string) {
    const now = this.clock.now()
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        admissions: {
          include: { lot: { select: { title: true, status: true, opensAt: true } } },
          orderBy: { createdAt: 'desc' },
        },
        restrictions: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!u) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Участник не найден' })
    const active = u.restrictions.find((r) => !r.liftedAt && r.startsAt <= now && r.endsAt > now) ?? null
    return {
      id: u.id,
      telegramId: u.telegramId.toString(),
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      publicName: u.publicName,
      phone: u.phone,
      phoneVerifiedAt: u.phoneVerifiedAt?.toISOString() ?? null,
      rulesAcceptedAt: u.rulesAcceptedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      restriction: active && restrictionDto(active),
      restrictions: u.restrictions.map(restrictionDto),
      admissions: u.admissions.map((a) => ({
        lotId: a.lotId,
        title: a.lot.title,
        lotStatus: a.lot.status,
        opensAt: a.lot.opensAt.toISOString(),
        admittedAt: a.createdAt.toISOString(),
        canCancel: ['DRAFT', 'SCHEDULED'].includes(a.lot.status) && a.lot.opensAt > now,
      })),
    }
  }

  @Post(':id/restrictions')
  async restrict(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Req() req: StaffRequest) {
    const { days, reason } = parse(restrictSchema, body, 'Укажите срок (дней) и причину')
    if (!(await this.prisma.user.findUnique({ where: { id }, select: { id: true } }))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Участник не найден' })
    }
    const now = this.clock.now()
    const r = await this.prisma.$transaction(async (tx) => {
      const created = await tx.restriction.create({
        data: { userId: id, reason, startsAt: now, endsAt: new Date(now.getTime() + days * 86_400_000) },
      })
      await this.audit.log(
        {
          actorType: 'staff',
          actorId: req.staff.id,
          action: 'restriction.created',
          entityType: 'user',
          entityId: id,
          reason,
          meta: { days },
          ip: req.ip,
        },
        tx
      )
      return created
    })
    return restrictionDto(r)
  }

  @Post(':id/restrictions/:rid/lift')
  @HttpCode(200)
  async lift(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('rid', new ParseUUIDPipe()) rid: string,
    @Body() body: unknown,
    @Req() req: StaffRequest
  ) {
    const { reason } = parse(reasonSchema, body, 'Укажите причину снятия ограничения')
    const r = await this.prisma.$transaction(async (tx) => {
      const found = await tx.restriction.findFirst({ where: { id: rid, userId: id } })
      if (!found) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ограничение не найдено' })
      if (found.liftedAt) throw conflict('ALREADY_LIFTED', 'Ограничение уже снято')
      const updated = await tx.restriction.update({
        where: { id: rid },
        data: { liftedAt: this.clock.now(), liftedBy: req.staff.id, liftReason: reason },
      })
      await this.audit.log(
        {
          actorType: 'staff',
          actorId: req.staff.id,
          action: 'restriction.lifted',
          entityType: 'user',
          entityId: id,
          reason,
          meta: { restrictionId: rid },
          ip: req.ip,
        },
        tx
      )
      return updated
    })
    return restrictionDto(r)
  }

  @Post(':id/admissions/:lotId/cancel')
  @HttpCode(200)
  cancelAdmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('lotId', new ParseUUIDPipe()) lotId: string,
    @Body() body: unknown,
    @Req() req: StaffRequest
  ) {
    const { reason } = parse(reasonSchema, body, 'Укажите причину отмены допуска')
    return this.refunds.revokeOneBeforeStart(lotId, id, {
      actorType: 'staff',
      actorId: req.staff.id,
      action: 'admission.cancelled',
      reason,
      ip: req.ip ?? null,
    })
  }
}

function restrictionDto(r: {
  id: string
  reason: string
  startsAt: Date
  endsAt: Date
  liftedAt: Date | null
  liftedBy: string | null
  liftReason: string | null
  obligationId: string | null
}) {
  return {
    id: r.id,
    reason: r.reason,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    liftedAt: r.liftedAt?.toISOString() ?? null,
    liftedBy: r.liftedBy,
    liftReason: r.liftReason,
    obligationId: r.obligationId,
  }
}
