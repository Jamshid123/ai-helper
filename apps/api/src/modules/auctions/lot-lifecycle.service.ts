import { Injectable } from '@nestjs/common'
import { prepaymentAmount, RULES } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'

type LockedLot = { id: string; status: string; closes_at: Date }
type TopBid = { id: string; user_id: string; amount: bigint }

export type CloseOutcome = 'SKIPPED' | 'CLOSED_SOLD' | 'CLOSED_UNSOLD'

/**
 * Жизненный цикл лота (ТЗ «Расписание», «Закрытие торгов»): в 09:00 лот открывается, с 18:00 предложения отклоняются,
 * закрытие выполняется ровно один раз и создаёт одно обязательство оплаты (уникальность (lotId, rank) в БД).
 * Вызывается догоняющим sweep-ом — переживает перезапуски, не зависит от точности таймеров.
 */
@Injectable()
export class LotLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  /** Открыть все запланированные лоты, чьё время пришло. */
  async openDue(): Promise<string[]> {
    const now = this.clock.now()
    return this.prisma.$transaction(async (tx) => {
      const opened = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Lot" SET status = 'LIVE', "updatedAt" = now()
        WHERE status = 'SCHEDULED' AND "opensAt" <= ${now} AND "closesAt" > ${now}
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

  /** Закрыть все идущие лоты, у которых наступило время закрытия. */
  async closeDue(): Promise<Record<string, CloseOutcome>> {
    const now = this.clock.now()
    const due = await this.prisma.lot.findMany({
      where: { status: 'LIVE', closesAt: { lte: now } },
      select: { id: true },
    })
    const result: Record<string, CloseOutcome> = {}
    for (const { id } of due) result[id] = await this.close(id)
    return result
  }

  /** Идемпотентное закрытие одного лота: повторный вызов → SKIPPED. */
  async close(lotId: string): Promise<CloseOutcome> {
    const now = this.clock.now()
    return this.prisma.$transaction(async (tx) => {
      const [lot] = await tx.$queryRaw<LockedLot[]>`
        SELECT id, status::text AS status, "closesAt" AS closes_at FROM "Lot" WHERE id = ${lotId}::uuid FOR UPDATE`
      if (!lot || lot.status !== 'LIVE' || now < lot.closes_at) return 'SKIPPED'

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
          prepaymentDeadline: new Date(now.getTime() + RULES.PREPAYMENT_WINDOW_MIN * 60_000),
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
              deadline: obligation.prepaymentDeadline.toISOString(),
            },
          },
        ],
      })
      return 'CLOSED_SOLD'
    })
  }
}
