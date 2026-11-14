import { Injectable } from '@nestjs/common'
import { effectiveEnd, prepaymentAmount, RULES } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'
import { RefundsService } from '../payments/refunds.service'

type LockedLot = {
  id: string
  status: string
  closes_at: Date
  last_bid_at: Date | null
  bid_timeout_sec: number | null
}
type TopBid = { id: string; user_id: string; amount: bigint }

export type CloseOutcome = 'SKIPPED' | 'CLOSED_SOLD' | 'CLOSED_UNSOLD'

/**
 * Жизненный цикл лота (ТЗ «Расписание», «Закрытие торгов»): в 09:00 лот открывается, с 18:00 предложения отклоняются,
 * закрытие выполняется ровно один раз и создаёт одно предложение купить (уникальность (lotId, rank) в БД);
 * продажа заключается только после подтверждения победителем (15 мин), затем 30% за 2 часа.
 * Вызывается догоняющим sweep-ом — переживает перезапуски, не зависит от точности таймеров.
 */
@Injectable()
export class LotLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly refunds: RefundsService
  ) {}

  /**
   * Открыть все запланированные лоты, чьё время пришло. Лоты, набравшие меньше минимума участников,
   * не открываются, а отменяются: участникам — возврат 100%, товар — на склад (решение заказчика 14.11.2026).
   */
  async openDue(): Promise<string[]> {
    const now = this.clock.now()
    const underfilled = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Lot"
      WHERE status = 'SCHEDULED' AND "opensAt" <= ${now} AND "closesAt" > ${now}
        AND "minParticipants" IS NOT NULL AND "admittedCount" < "minParticipants"`
    for (const { id } of underfilled) await this.cancelUnderfilled(id, now)
    return this.prisma.$transaction(async (tx) => {
      const opened = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Lot" SET status = 'LIVE', "updatedAt" = now()
        WHERE status = 'SCHEDULED' AND "opensAt" <= ${now} AND "closesAt" > ${now}
          AND ("minParticipants" IS NULL OR "admittedCount" >= "minParticipants")
        RETURNING id`
      if (opened.length) {
        await tx.outboxEvent.createMany({
          data: opened.map((l) => ({
            type: 'lot.opened',
            aggregateId: l.id,
            payload: { lotId: l.id, serverTime: now.toISOString() },
          })),
        })
      }
      return opened.map((l) => l.id)
    })
  }

  /** Закрыть все идущие лоты, у которых наступило фактическое окончание (время или «ожидание предложения»). */
  async closeDue(): Promise<Record<string, CloseOutcome>> {
    const now = this.clock.now()
    const due = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Lot" WHERE status = 'LIVE' AND (
        "closesAt" <= ${now}
        OR ("bidTimeoutSec" IS NOT NULL AND "lastBidAt" IS NOT NULL
            AND "lastBidAt" + make_interval(secs => "bidTimeoutSec") <= ${now}))`
    const result: Record<string, CloseOutcome> = {}
    for (const { id } of due) result[id] = await this.close(id)
    return result
  }

  /** Идемпотентное закрытие одного лота: повторный вызов → SKIPPED. */
  async close(lotId: string): Promise<CloseOutcome> {
    const now = this.clock.now()
    return this.prisma.$transaction(async (tx) => {
      const [lot] = await tx.$queryRaw<LockedLot[]>`
        SELECT id, status::text AS status, "closesAt" AS closes_at, "lastBidAt" AS last_bid_at,
               "bidTimeoutSec" AS bid_timeout_sec
        FROM "Lot" WHERE id = ${lotId}::uuid FOR UPDATE`
      if (!lot || lot.status !== 'LIVE' || now < effectiveEnd(lot.closes_at, lot.last_bid_at, lot.bid_timeout_sec)) {
        return 'SKIPPED'
      }

      // Победитель — максимальная принятая сумма; при равенстве — раньше записанная.
      const [top] = await tx.$queryRaw<TopBid[]>`
        SELECT id, "userId" AS user_id, amount FROM "Bid" WHERE "lotId" = ${lotId}::uuid
        ORDER BY amount DESC, seq ASC LIMIT 1`

      if (!top) {
        await tx.lot.update({ where: { id: lotId }, data: { status: 'CLOSED_UNSOLD', closedAt: now } })
        await tx.outboxEvent.create({
          data: { type: 'lot.closed', aggregateId: lotId, payload: { lotId, sold: false } },
        })
        return 'CLOSED_UNSOLD'
      }

      await tx.lot.update({ where: { id: lotId }, data: { status: 'CLOSED_SOLD', closedAt: now } })
      const obligation = await tx.obligation.create({
        data: {
          lotId,
          userId: top.user_id,
          bidId: top.id,
          rank: 1,
          amount: top.amount,
          prepaymentAmount: prepaymentAmount(top.amount),
          confirmDeadline: new Date(now.getTime() + RULES.CONFIRM_WINDOW_MIN * 60_000),
        },
      })
      await tx.outboxEvent.createMany({
        data: [
          { type: 'lot.closed', aggregateId: lotId, payload: { lotId, sold: true } },
          {
            type: 'obligation.created',
            aggregateId: lotId,
            payload: {
              obligationId: obligation.id,
              userId: top.user_id,
              amount: top.amount.toString(),
              prepayment: obligation.prepaymentAmount.toString(),
              confirmDeadline: obligation.confirmDeadline.toISOString(),
            },
          },
        ],
      })
      return 'CLOSED_SOLD'
    })
  }

  /** Отмена лота, не набравшего минимум участников к началу (идемпотентно, под блокировкой лота). */
  private async cancelUnderfilled(lotId: string, now: Date): Promise<void> {
    const orderIds = await this.prisma.$transaction(async (tx) => {
      const [lot] = await tx.$queryRaw<
        { status: string; product_id: string | null; admitted: number; min: number | null }[]
      >`
        SELECT status::text AS status, "productId" AS product_id, "admittedCount" AS admitted, "minParticipants" AS min
        FROM "Lot" WHERE id = ${lotId}::uuid FOR UPDATE`
      if (!lot || lot.status !== 'SCHEDULED' || lot.min === null || lot.admitted >= lot.min) return []
      const ids = await this.refunds.revokeAdmissionsInTx(tx, lotId)
      await tx.lot.update({ where: { id: lotId }, data: { status: 'CANCELLED', closedAt: now } })
      if (lot.product_id) await tx.product.update({ where: { id: lot.product_id }, data: { status: 'AVAILABLE' } })
      await tx.outboxEvent.create({
        data: {
          type: 'lot.cancelled',
          aggregateId: lotId,
          payload: { lotId, reason: 'min_participants', refunds: ids.length },
        },
      })
      await tx.auditLog.create({
        data: {
          actorType: 'system',
          action: 'lot.cancelled_min_participants',
          entityType: 'lot',
          entityId: lotId,
          meta: { admitted: lot.admitted, min: lot.min },
        },
      })
      return ids
    })
    await this.refunds.settle(orderIds)
  }
}
