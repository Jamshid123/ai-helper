import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { DEMO } from '@/entities/lot/api'
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

/** Оплатить 10% или остаток (на тестовом запуске оплату имитирует сервер). */
export function usePayPurchase(): (id: string, part: 'prepayment' | 'remainder') => Promise<void> {
  const qc = useQueryClient()
  return useCallback(
    async (id, part) => {
      const r = await api<{ orderId: string; provider: string; checkoutUrl: string | null }>(`/obligations/${id}/pay`, {
        method: 'POST',
        body: { part },
      })
      if (r.provider !== 'fake') throw new ApiError(503, 'PAYMENTS_DISABLED', 'Оплата скоро будет доступна')
      await api(`/payments/fake/${r.orderId}/complete`, { method: 'POST' })
      await qc.invalidateQueries({ queryKey: ['purchases'] })
    },
    [qc]
  )
}
