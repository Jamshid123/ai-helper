import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { RULES } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { RefundsService } from '../payments/refunds.service'

const H = 3_600_000

/**
 * Повторные торги (решение 16.11.2026, вариант C): приглашение перенесённых участников при публикации даты,
 * «Подтверждаю участие», напоминание за 6 ч, освобождение неподтверждённых мест за 2 ч до старта.
 * Перенесённый допуск — без нового взноса; возвращать по нему нечего.
 */
@Injectable()
export class RelistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly refunds: RefundsService
  ) {}

  /** При публикации повторных торгов: приглашение всем перенесённым участникам без действующего ограничения. */
  async inviteOnPublish(tx: Prisma.TransactionClient, lotId: string): Promise<number> {
    const now = this.clock.now()
    const carried = await tx.admission.findMany({
      where: { lotId, carriedFromLotId: { not: null } },
      select: { userId: true },
    })
    if (!carried.length) return 0
    const restricted = await tx.restriction.findMany({
      where: {
        userId: { in: carried.map((a) => a.userId) },
        liftedAt: null,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { userId: true },
    })
    const blocked = new Set(restricted.map((r) => r.userId))
    return this.notifications.create(
      tx,
      carried.filter((a) => !blocked.has(a.userId)).map((a) => ({ userId: a.userId, type: 'relist_invite', lotId }))
    )
  }

  /** Перенесённый участник подтверждает, что придёт (до освобождения мест за 2 ч до старта). */
  async confirm(userId: string, lotId: string) {
    const now = this.clock.now()
    const a = await this.prisma.admission.findUnique({
      where: { lotId_userId: { lotId, userId } },
      include: { lot: { select: { status: true, opensAt: true } } },
    })
    if (!a) throw new NotFoundException({ code: 'NOT_ADMITTED', message: 'Допуска к этому лоту нет' })
    if (!a.carriedFromLotId) return { confirmed: true } // оплаченный допуск подтверждать не нужно
    if (a.confirmedAt) return { confirmed: true }
    if (a.lot.status !== 'SCHEDULED' || now >= a.lot.opensAt) {
      throw new ConflictException({ code: 'LOT_STARTED', message: 'Торги уже начались' })
    }
    await this.prisma.admission.update({ where: { id: a.id }, data: { confirmedAt: now } })
    return { confirmed: true }
  }

  /** Напоминание неподтвердившим — за 6 ч до старта (одно на участника: уникальность уведомления). */
  async remindDue(): Promise<number> {
    const now = this.clock.now()
    const lots = await this.prisma.lot.findMany({
      where: {
        status: 'SCHEDULED',
        relistOfId: { not: null },
        opensAt: { gt: now, lte: new Date(now.getTime() + RULES.RELIST_REMIND_BEFORE_H * H) },
      },
      select: { id: true },
    })
    let n = 0
    for (const lot of lots) {
      const pending = await this.prisma.admission.findMany({
        where: { lotId: lot.id, carriedFromLotId: { not: null }, confirmedAt: null },
        select: { userId: true },
      })
      n += await this.notifications.create(
        this.prisma,
        pending.map((a) => ({ userId: a.userId, type: 'relist_reminder', lotId: lot.id }))
      )
    }
    return n
  }

  /** За 2 ч до старта неподтверждённые перенесённые места освобождаются — их могут занять новые покупатели. */
  async releaseUnconfirmed(): Promise<number> {
    const now = this.clock.now()
    const lots = await this.prisma.lot.findMany({
      where: {
        status: 'SCHEDULED',
        relistOfId: { not: null },
        opensAt: { gt: now, lte: new Date(now.getTime() + RULES.RELIST_CONFIRM_BEFORE_H * H) },
      },
      select: { id: true },
    })
    let released = 0
    for (const lot of lots) {
      released += await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Lot" WHERE id = ${lot.id}::uuid FOR UPDATE`
        const pending = await tx.admission.findMany({
          where: { lotId: lot.id, carriedFromLotId: { not: null }, confirmedAt: null },
          select: { userId: true },
        })
        if (!pending.length) return 0
        const users = pending.map((a) => a.userId)
        await this.refunds.revokeAdmissionsInTx(tx, lot.id, users) // заказов нет — возвратов тоже
        await this.notifications.create(
          tx,
          users.map((userId) => ({ userId, type: 'relist_released', lotId: lot.id }))
        )
        await tx.auditLog.create({
          data: {
            actorType: 'system',
            action: 'relist.unconfirmed_released',
            entityType: 'lot',
            entityId: lot.id,
            meta: { count: users.length },
          },
        })
        return users.length
      })
    }
    return released
  }

  /** Повторные торги отменены (не набрали минимум) — перенесённым участникам сообщаем отдельно. */
  async notifyCancelled(tx: Prisma.TransactionClient, lotId: string): Promise<void> {
    const carried = await tx.admission.findMany({
      where: { lotId, carriedFromLotId: { not: null } },
      select: { userId: true },
    })
    await this.notifications.create(
      tx,
      carried.map((a) => ({ userId: a.userId, type: 'relist_cancelled', lotId }))
    )
  }
}
