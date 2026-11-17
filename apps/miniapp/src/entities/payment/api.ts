import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '@/shared/api/client'

/** Способы оплаты (решение 17.11.2026): Click и Payme — какие настроены на сервере. */
export type PayMethod = 'click' | 'payme'
const NAMES: Record<string, string> = { click: 'Click', payme: 'Payme' }
export const payMethodName = (m: string) => NAMES[m] ?? m

const STORAGE_KEY = 'auksion.payMethod'
const DEMO = import.meta.env.VITE_DEMO_DATA === 'true'

export function usePayMethods(): string[] {
  const q = useQuery({
    queryKey: ['payment-providers'],
    queryFn: () => api<{ providers: string[] }>('/payments/providers'),
    enabled: !DEMO,
    staleTime: 10 * 60_000,
  })
  // fake (тестовый запуск) — не способ оплаты для покупателя
  return (q.data?.providers ?? []).filter((p) => p in NAMES)
}

/** Выбранный способ: прошлый выбор покупателя (на этом устройстве) или первый доступный. */
export function usePayMethod(): [string | undefined, (m: string) => void, string[]] {
  const methods = usePayMethods()
  const [picked, setPicked] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })
  const current = picked && methods.includes(picked) ? picked : methods[0]
  const pick = (m: string) => {
    setPicked(m)
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {
      // приватный режим — выбор просто не запомнится
    }
  }
  return [current, pick, methods]
}

type Checkout = { orderId: string; provider: string; checkoutUrl: string | null }

/**
 * Итог начатой оплаты: тестовый запуск — сервер имитирует оплату сразу ('paid');
 * Click / Payme — переход на их страницу оплаты, вернётся покупатель на страницу лота ('redirected').
 */
export async function completeCheckout(r: Checkout): Promise<'paid' | 'redirected'> {
  if (r.provider === 'fake') {
    await api(`/payments/fake/${r.orderId}/complete`, { method: 'POST' })
    return 'paid'
  }
  if (!r.checkoutUrl) throw new ApiError(503, 'PAYMENTS_DISABLED', 'Оплата скоро будет доступна')
  window.location.assign(r.checkoutUrl)
  return 'redirected'
}
