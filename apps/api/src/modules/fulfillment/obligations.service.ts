import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { RULES } from '@auksion/shared'
import { Clock } from '../../common/clock'
import { PrismaService } from '../../prisma/prisma.service'

type LockedObligation = { id: string; user_id: string; lot_id: string; status: string; confirm_deadline: Date }

/** Предложение купить лот после торгов: подтверждение → договор → оплата 30% / 70% (выкуп — следующий шаг). */
@Injectable()
export class ObligationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  /**
   * Подтверждение покупки победителем. Лидерство само по себе не продажа: договор заключается здесь,
   * после этого назначается срок оплаты 30% (2 часа). Повторное подтверждение — без изменений.
   */
  async confirm(userId: string, obligationId: string) {
    const now = this.clock.now()
    return this.prisma.$transaction(async (tx) => {
      const [o] = await tx.$queryRaw<LockedObligation[]>`
        SELECT id, "userId" AS user_id, "lotId" AS lot_id, status::text AS status, "confirmDeadline" AS confirm_deadline
        FROM "Obligation" WHERE id = ${obligationId}::uuid FOR UPDATE`
      if (!o) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Предложение не найдено' })
      if (o.user_id !== userId)
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Это предложение не для вас' })
      if (o.status !== 'AWAITING_CONFIRMATION') {
        const current = await tx.obligation.findUniqueOrThrow({ where: { id: o.id } })
        if (current.confirmedAt) return toDto(current)
        throw new ConflictException({ code: 'NOT_CONFIRMABLE', message: 'Предложение уже неактивно' })
      }
      if (now >= o.confirm_deadline) {
        throw new ConflictException({ code: 'CONFIRM_EXPIRED', message: 'Срок подтверждения истёк' })
      }
      const updated = await tx.obligation.update({
        where: { id: o.id },
        data: {
          status: 'AWAITING_PREPAYMENT',
          confirmedAt: now,
          prepaymentDeadline: new Date(now.getTime() + RULES.PREPAYMENT_WINDOW_MIN * 60_000),
        },
      })
      await tx.outboxEvent.create({
        data: {
          type: 'obligation.confirmed',
          aggregateId: o.lot_id,
          payload: { obligationId: o.id, userId, prepaymentDeadline: updated.prepaymentDeadline!.toISOString() },
        },
      })
      return toDto(updated)
    })
  }

  async mine(userId: string) {
    const list = await this.prisma.obligation.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 })
    return list.map(toDto)
  }
}

function toDto(o: {
  id: string
  lotId: string
  rank: number
  amount: bigint
  prepaymentAmount: bigint
  status: string
  confirmDeadline: Date
  confirmedAt: Date | null
  prepaymentDeadline: Date | null
}) {
  return {
    id: o.id,
    lotId: o.lotId,
    rank: o.rank,
    amount: o.amount.toString(),
    prepaymentAmount: o.prepaymentAmount.toString(),
    status: o.status,
    confirmDeadline: o.confirmDeadline.toISOString(),
    confirmedAt: o.confirmedAt?.toISOString() ?? null,
    prepaymentDeadline: o.prepaymentDeadline?.toISOString() ?? null,
  }
}
