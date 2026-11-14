import { Controller, Get, Query } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { StaffOnly } from '../staff/staff.decorator'

/** Журнал аудита — только чтение и только ADMIN (ТЗ: журналируем изменения, решения и доступ). */
@StaffOnly('ADMIN')
@Controller('admin/audit')
export class AdminAuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('before') before?: string
  ) {
    const where: Prisma.AuditLogWhereInput = {
      ...(entityType && { entityType: entityType.slice(0, 40) }),
      ...(entityId && { entityId: entityId.slice(0, 64) }),
      ...(before && /^\d+$/.test(before) && { id: { lt: BigInt(before) } }),
    }
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take: 100 })
    const staffIds = [...new Set(rows.filter((r) => r.actorType === 'staff' && r.actorId).map((r) => r.actorId!))]
    const staff = await this.prisma.staff.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, firstName: true, lastName: true },
    })
    const names = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]))
    return rows.map((r) => ({
      id: r.id.toString(),
      createdAt: r.createdAt.toISOString(),
      actorType: r.actorType,
      actor:
        r.actorType === 'staff'
          ? (names.get(r.actorId ?? '') ?? 'Сотрудник')
          : r.actorType === 'system'
            ? 'Система'
            : 'Участник',
      actorId: r.actorId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      reason: r.reason,
      meta: r.meta,
      ip: r.ip,
    }))
  }
}
