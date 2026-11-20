import { Controller, Get, Query, Req } from '@nestjs/common'
import { effectiveEnd } from '@auksion/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { type AdminModule, allows } from '../staff/permissions'
import type { StaffRequest } from '../staff/staff-auth.guard'
import { StaffOnly } from '../staff/staff.decorator'

export const PERIODS = ['today', '7d', '30d'] as const
export type Period = (typeof PERIODS)[number]

/** Ташкент — UTC+5 круглый год (без перехода на летнее время). */
const TASHKENT_OFFSET_MS = 5 * 3_600_000
const DAY_MS = 86_400_000

/** Начало периода по Ташкенту: «сегодня» — с полуночи, «7 дней» — сегодня и 6 предыдущих суток. */
export function periodStart(period: Period, now: Date): Date {
  const local = now.getTime() + TASHKENT_OFFSET_MS
  const midnight = local - (local % DAY_MS) - TASHKENT_OFFSET_MS
  const days = period === 'today' ? 0 : period === '7d' ? 6 : 29
  return new Date(midnight - days * DAY_MS)
}

const parsePeriod = (v: unknown): Period => (PERIODS.includes(v as Period) ? (v as Period) : '7d')

/**
 * «Обзор» админки (ТЗ 20.11.2026): рабочая сводка вместо карточек-ссылок. Три независимых запроса —
 * ошибка одного блока не ломает остальные. Каждый показатель отдаётся только при праве на свой модуль:
 * группировка в обзоре прав не расширяет. Только счётчики и суммы — без персональных данных и максимумов
 * автопредложений. Подписок и «товарного бюджета» нет (вне задачи, решение владельца 20.11.2026).
 */
@Controller('admin/overview')
export class AdminOverviewController {
  constructor(private readonly prisma: PrismaService) {}

  /** Идущие и ближайшие торги. Время окончания — фактическое (с «ожиданием следующего предложения»). */
  @StaffOnly('lots')
  @Get('auctions')
  async auctions() {
    const now = new Date()
    const select = {
      id: true,
      title: true,
      status: true,
      startPrice: true,
      currentPrice: true,
      admittedCount: true,
      maxParticipants: true,
      opensAt: true,
      closesAt: true,
      lastBidAt: true,
      bidTimeoutSec: true,
    } as const
    const [live, upcoming] = await Promise.all([
      this.prisma.lot.findMany({ where: { status: 'LIVE' }, orderBy: { closesAt: 'asc' }, take: 20, select }),
      this.prisma.lot.findMany({
        where: { status: 'SCHEDULED', opensAt: { gt: now } },
        orderBy: { opensAt: 'asc' },
        take: 5,
        select,
      }),
    ])
    const dto = (l: (typeof live)[number]) => ({
      id: l.id,
      title: l.title,
      status: l.status,
      startPrice: l.startPrice.toString(),
      currentPrice: l.currentPrice?.toString() ?? null,
      admittedCount: l.admittedCount,
      maxParticipants: l.maxParticipants,
      opensAt: l.opensAt.toISOString(),
      endsAt: effectiveEnd(l.closesAt, l.lastBidAt, l.bidTimeoutSec).toISOString(),
    })
    return { serverTime: now.toISOString(), live: live.map(dto), upcoming: upcoming.map(dto) }
  }

  /** «Требуют внимания»: только необработанные записи, по правам сотрудника. */
  @StaffOnly()
  @Get('attention')
  async attention(@Req() req: StaffRequest) {
    const can = this.can(req)
    const count = (allowed: boolean, q: () => Promise<number>) => (allowed ? q() : Promise.resolve(undefined))
    const [awaitingPickup, awaitingPrepayment, prepaymentDecisions, drafts, underReview] = await Promise.all([
      count(can('fulfillment'), () => this.prisma.obligation.count({ where: { status: 'AWAITING_PICKUP' } })),
      count(can('fulfillment'), () => this.prisma.obligation.count({ where: { status: 'AWAITING_PREPAYMENT' } })),
      count(can('finance'), () => this.prisma.obligation.count({ where: { prepaymentDecision: 'PENDING' } })),
      count(can('lots'), () => this.prisma.lot.count({ where: { status: 'DRAFT' } })),
      count(can('lots'), () => this.prisma.lot.count({ where: { status: 'UNDER_REVIEW' } })),
    ])
    return { awaitingPickup, awaitingPrepayment, prepaymentDecisions, drafts, underReview }
  }

  /** Показатели: «всего» — на текущий момент, остальное — за выбранный период по Ташкенту. */
  @StaffOnly()
  @Get('metrics')
  async metrics(@Req() req: StaffRequest, @Query('period') rawPeriod?: string) {
    const can = this.can(req)
    const now = new Date()
    const period = parsePeriod(rawPeriod)
    const from = periodStart(period, now)
    const inPeriod = { gte: from, lte: now }
    const opt = <T>(allowed: boolean, q: () => Promise<T>) => (allowed ? q() : Promise.resolve(undefined))
    const [usersTotal, usersNew, lotsSold, purchasesCompleted, completedAmount] = await Promise.all([
      opt(can('participants'), () => this.prisma.user.count()),
      opt(can('participants'), () => this.prisma.user.count({ where: { createdAt: inPeriod } })),
      opt(can('lots'), () =>
        this.prisma.lot.count({ where: { status: 'CLOSED_SOLD', closedAt: inPeriod } })
      ),
      opt(can('fulfillment'), () =>
        this.prisma.obligation.count({ where: { status: 'COMPLETED', completedAt: inPeriod } })
      ),
      opt(can('finance'), async () => {
        const r = await this.prisma.obligation.aggregate({
          where: { status: 'COMPLETED', completedAt: inPeriod },
          _sum: { amount: true },
        })
        return (r._sum.amount ?? 0n).toString()
      }),
    ])
    return {
      period,
      from: from.toISOString(),
      to: now.toISOString(),
      usersTotal,
      usersNew,
      lotsSold,
      purchasesCompleted,
      completedAmount,
    }
  }

  private can(req: StaffRequest) {
    const s = req.staff
    return (m: AdminModule) => s.isOwner || allows(s.permissions, m, 'view')
  }
}
