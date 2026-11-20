import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** Период показателей «Обзора» (по Ташкенту); значение — в адресе `?period=`. */
export const PERIODS = [
  { id: 'today', text: 'Сегодня' },
  { id: '7d', text: '7 дней' },
  { id: '30d', text: '30 дней' },
] as const
export type Period = (typeof PERIODS)[number]['id']
export const parsePeriod = (v: unknown): Period | undefined =>
  PERIODS.find((p) => p.id === v)?.id

export type OverviewLot = {
  id: string
  title: string
  status: 'LIVE' | 'SCHEDULED'
  startPrice: string
  currentPrice: string | null
  admittedCount: number
  maxParticipants: number | null
  opensAt: string
  /** Фактическое окончание: назначенное время или раньше — по «ожиданию следующего предложения». */
  endsAt: string
}
export type OverviewAuctions = {
  serverTime: string
  live: OverviewLot[]
  upcoming: OverviewLot[]
}
/** Ключа нет — у сотрудника нет права на этот показатель. */
export type OverviewAttention = Partial<
  Record<
    | 'awaitingPickup'
    | 'awaitingPrepayment'
    | 'prepaymentDecisions'
    | 'drafts'
    | 'underReview',
    number
  >
>
export type OverviewMetrics = {
  period: Period
  from: string
  to: string
  usersTotal?: number
  usersNew?: number
  lotsSold?: number
  purchasesCompleted?: number
  completedAmount?: string
}

const REFRESH = 30_000

export const useOverviewAuctions = (enabled: boolean) =>
  useQuery({
    enabled,
    queryKey: ['overview', 'auctions'],
    queryFn: () => api<OverviewAuctions>('/admin/overview/auctions'),
    refetchInterval: REFRESH,
  })
export const useOverviewAttention = () =>
  useQuery({
    queryKey: ['overview', 'attention'],
    queryFn: () => api<OverviewAttention>('/admin/overview/attention'),
    refetchInterval: REFRESH,
  })
export const useOverviewMetrics = (period: Period) =>
  useQuery({
    queryKey: ['overview', 'metrics', period],
    queryFn: () =>
      api<OverviewMetrics>(`/admin/overview/metrics?period=${period}`),
    refetchInterval: REFRESH,
  })
