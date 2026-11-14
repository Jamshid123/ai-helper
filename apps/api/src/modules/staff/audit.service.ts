import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

export type AuditEntry = {
  actorType: 'staff' | 'system' | 'buyer'
  actorId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  reason?: string | null
  meta?: Prisma.InputJsonValue
  ip?: string | null
}

/** Журнал аудита (ТЗ «Админка»): изменения, решения и доступ. Только запись — правок и удаления нет. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(e: AuditEntry, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorType: e.actorType,
        actorId: e.actorId ?? null,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ?? null,
        reason: e.reason ?? null,
        meta: e.meta ?? {},
        ip: e.ip ?? null,
      },
    })
  }
}
