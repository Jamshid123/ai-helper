import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { RULES } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'

/** Варианты «напомнить за»: 15 минут, 1 час, накануне (24 часа). */
export const REMINDER_OPTIONS = [15, 60, 1440] as const
export type ReminderMinutes = (typeof REMINDER_OPTIONS)[number]

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  /** Поставить/изменить напоминание. Время напоминания уже прошло — отказ (выберите вариант поближе). */
  async set(userId: string, lotId: string, minutesBefore: ReminderMinutes) {
    const lot = await this.prisma.lot.findUnique({ where: { id: lotId }, select: { status: true, opensAt: true } })
    if (!lot || !['SCHEDULED', 'LIVE'].includes(lot.status))
      throw new NotFoundException({ code: 'LOT_NOT_FOUND', message: 'Лот не найден' })
    const remindAt = new Date(lot.opensAt.getTime() - minutesBefore * 60_000)
    if (remindAt <= this.clock.now()) {
      throw new BadRequestException({ code: 'REMINDER_TOO_LATE', message: 'До начала меньше выбранного времени' })
    }
    const r = await this.prisma.lotReminder.upsert({
      where: { lotId_userId: { lotId, userId } },
      create: { lotId, userId, minutesBefore, remindAt },
      update: { minutesBefore, remindAt, sentAt: null },
    })
    return { minutesBefore: r.minutesBefore, remindAt: r.remindAt.toISOString() }
  }

  async get(userId: string, lotId: string) {
    const r = await this.prisma.lotReminder.findUnique({ where: { lotId_userId: { lotId, userId } } })
    return r ? { minutesBefore: r.minutesBefore, remindAt: r.remindAt.toISOString(), sent: Boolean(r.sentAt) } : null
  }

  async cancel(userId: string, lotId: string) {
    await this.prisma.lotReminder.deleteMany({ where: { lotId, userId, sentAt: null } })
  }

  /**
   * Наступившие напоминания → событие `reminder.due` в outbox (отправит бот) и отметка sentAt — в одной транзакции,
   * под SKIP LOCKED: ровно один раз, даже при параллельных проходах.
   */
  async dispatchDue(): Promise<number> {
    const now = this.clock.now()
    return this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<{ id: string; lot_id: string; user_id: string; minutes_before: number }[]>`
        SELECT r.id, r."lotId" AS lot_id, r."userId" AS user_id, r."minutesBefore" AS minutes_before
        FROM "LotReminder" r JOIN "Lot" l ON l.id = r."lotId"
        WHERE r."sentAt" IS NULL AND r."remindAt" <= ${now} AND l.status IN ('SCHEDULED', 'LIVE') AND l."closesAt" > ${now}
        ORDER BY r."remindAt" LIMIT 500
        FOR UPDATE OF r SKIP LOCKED`
      if (!due.length) return 0
      await tx.lotReminder.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { sentAt: now } })
      await tx.outboxEvent.createMany({
        data: due.map((d) => ({
          type: 'reminder.due',
          aggregateId: d.lot_id,
          payload: { lotId: d.lot_id, userId: d.user_id, minutesBefore: d.minutes_before },
        })),
      })
      return due.length
    })
  }

  /**
   * «Готовы предложить больше?» (решение 14.11.2026): участник предлагал цену, его перебили, и с его последнего
   * предложения прошло 30 минут, а торги ещё идут → событие `bid.nudge` в outbox (отправит бот) и отметка
   * `Admission.nudgedAt` — одно напоминание на лот, ровно один раз (SKIP LOCKED).
   */
  async dispatchIdleBidders(): Promise<number> {
    const now = this.clock.now()
    const idleSince = new Date(now.getTime() - RULES.IDLE_NUDGE_MIN * 60_000)
    return this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<{ id: string; lot_id: string; user_id: string; current_price: bigint }[]>`
        SELECT a.id, a."lotId" AS lot_id, a."userId" AS user_id, l."currentPrice" AS current_price
        FROM "Admission" a JOIN "Lot" l ON l.id = a."lotId"
        WHERE a."nudgedAt" IS NULL AND l.status = 'LIVE' AND l."closesAt" > ${now}
          AND l."leaderUserId" IS DISTINCT FROM a."userId"
          AND (l."bidTimeoutSec" IS NULL OR l."lastBidAt" IS NULL
               OR l."lastBidAt" + make_interval(secs => l."bidTimeoutSec") > ${now})
          AND (SELECT max(b."createdAt") FROM "Bid" b WHERE b."lotId" = a."lotId" AND b."userId" = a."userId")
              <= ${idleSince}
        LIMIT 500
        FOR UPDATE OF a SKIP LOCKED`
      if (!due.length) return 0
      await tx.admission.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { nudgedAt: now } })
      await tx.outboxEvent.createMany({
        data: due.map((d) => ({
          type: 'bid.nudge',
          aggregateId: d.lot_id,
          payload: { lotId: d.lot_id, userId: d.user_id, currentPrice: d.current_price.toString() },
        })),
      })
      return due.length
    })
  }
}
