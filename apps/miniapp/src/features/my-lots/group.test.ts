import { describe, expect, it } from 'vitest'
import type { AdmissionInfo } from '@/entities/lot/api'
import type { Purchase } from '@/entities/purchase/api'
import { groupMyLots, isEmpty } from './group'

const adm = (lotId: string, over: Partial<AdmissionInfo> = {}): AdmissionInfo => ({
  lotId,
  title: lotId,
  status: 'SCHEDULED',
  opensAt: '2026-11-20T04:00:00Z',
  admitted: true,
  outcome: null,
  feeStatus: 'PAID',
  carried: false,
  confirmed: true,
  ...over,
})
const buy = (lotId: string, status: string): Purchase => ({
  id: `o-${lotId}`,
  lotId,
  lotTitle: lotId,
  status,
  amount: '3000000',
  prepaymentAmount: '300000',
  remainderAmount: '2700000',
  prepaymentDeadline: null,
  remainderDeadline: null,
  remainderPaid: false,
  pickupCode: null,
  expiredReason: null,
  completedAt: null,
})

describe('groupMyLots', () => {
  it('раскладывает по группам: действие → идут → предстоящие → история', () => {
    const g = groupMyLots(
      [
        adm('later', { opensAt: '2026-11-22T04:00:00Z' }),
        adm('soon', { opensAt: '2026-11-19T04:00:00Z' }),
        adm('live', { status: 'LIVE' }),
        adm('confirm', { carried: true, confirmed: false, feeStatus: 'CARRIED' }),
        adm('lost', { status: 'CLOSED_SOLD', outcome: 'NOT_WON' }),
        adm('left', { admitted: false, feeStatus: 'REFUND_PENDING' }),
        adm('cancelled', { status: 'CANCELLED', admitted: false, feeStatus: 'REFUNDED' }),
        adm('won', { status: 'CLOSED_SOLD', outcome: 'WON' }),
        adm('done', { status: 'CLOSED_SOLD', outcome: 'WON' }),
      ],
      [buy('won', 'AWAITING_PREPAYMENT'), buy('done', 'COMPLETED')]
    )
    expect(g.action.purchases.map((p) => p.lotId)).toEqual(['won'])
    expect(g.action.confirm.map((a) => a.lotId)).toEqual(['confirm'])
    expect(g.live.map((a) => a.lotId)).toEqual(['live'])
    expect(g.upcoming.map((a) => a.lotId)).toEqual(['soon', 'later'])
    expect(g.history.map((h) => (h.kind === 'purchase' ? h.p.lotId : h.a.lotId))).toEqual(['done', 'lost', 'left', 'cancelled'])
  })

  it('выигранный лот — одна карточка выкупа, без дубля из допусков; «не допущен» в идущие не попадает', () => {
    const g = groupMyLots(
      [adm('won', { status: 'CLOSED_SOLD', outcome: 'WON' }), adm('gone', { status: 'LIVE', admitted: false, feeStatus: 'REFUNDED' })],
      [buy('won', 'AWAITING_PICKUP')]
    )
    expect(g.action.purchases).toHaveLength(1)
    expect(g.live).toHaveLength(0)
    expect(g.history.map((h) => h.kind)).toEqual(['admission'])
    expect(isEmpty(groupMyLots([], []))).toBe(true)
  })
})
