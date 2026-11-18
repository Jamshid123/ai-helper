import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { DEMO } from '@/entities/lot/api'
import { completeCheckout } from '@/entities/payment/api'
import { ApiError, api } from '@/shared/api/client'

/** Выигранный лот и его выкуп (решения 14.11 и 16.11.2026): 10% за 15 минут → 24 часа на остаток и получение. */
export type Purchase = {
  id: string
  lotId: string
  lotTitle: string
  status: 'AWAITING_PREPAYMENT' | 'AWAITING_PICKUP' | 'COMPLETED' | 'EXPIRED' | string
  amount: string
  prepaymentAmount: string
  remainderAmount: string
  prepaymentDeadline: string | null
  remainderDeadline: string | null
  remainderPaid: boolean
  pickupCode: string | null
  expiredReason: 'PREPAYMENT_MISSED' | 'PICKUP_MISSED' | null
  completedAt: string | null
  /** Не оплатил 10% → ограничение участия до этой даты (решение 18.11.2026). */
  restrictedUntil?: string | null
}

export function usePurchases(): Purchase[] {
  const q = useQuery({
    queryKey: ['purchases'],
    queryFn: () =>
      api<Purchase[]>('/me/obligations').catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) return []
        throw e
      }),
    enabled: !DEMO,
    retry: false,
    // сроки короткие (15 минут) — держим статус свежим
    refetchInterval: 30_000,
  })
  return DEMO ? [] : (q.data ?? [])
}

/** Оплатить 10% или остаток выбранным способом (Click / Payme — переход на их страницу; тестовый запуск — имитация). */
export function usePayPurchase(): (
  id: string,
  part: 'prepayment' | 'remainder',
  pay?: { provider?: string; locale?: 'ru' | 'uz' }
) => Promise<'paid' | 'redirected'> {
  const qc = useQueryClient()
  return useCallback(
    async (id, part, pay = {}) => {
      const r = await api<{ orderId: string; provider: string; checkoutUrl: string | null }>(`/obligations/${id}/pay`, {
        method: 'POST',
        body: { part, ...pay },
      })
      const outcome = await completeCheckout(r)
      if (outcome === 'paid') await qc.invalidateQueries({ queryKey: ['purchases'] })
      return outcome
    },
    [qc]
  )
}
