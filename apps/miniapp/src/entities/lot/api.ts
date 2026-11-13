import { useQuery } from '@tanstack/react-query'
import { demoLot, demoLots, useDemoVersion } from './demo-store'
import { type Lot } from './types'

/** Демо-стенд: тестовые данные вместо API (VITE_DEMO_DATA=true). */
export const DEMO = import.meta.env.VITE_DEMO_DATA === 'true'

const API = import.meta.env.VITE_API_URL ?? '/api/v1'

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

export function useLots(): { data: Lot[] | undefined; isLoading: boolean } {
  const version = useDemoVersion()
  const q = useQuery({
    queryKey: ['lots'],
    queryFn: () => getJson<Lot[]>('/lots'),
    enabled: !DEMO,
  })
  if (DEMO) return { data: demoLots(), isLoading: version < 0 }
  return { data: q.data, isLoading: q.isLoading }
}

export function useLot(id: string): {
  data: Lot | undefined
  isLoading: boolean
} {
  const version = useDemoVersion()
  const q = useQuery({
    queryKey: ['lot', id],
    queryFn: () => getJson<Lot>(`/lots/${id}`),
    enabled: !DEMO,
  })
  if (DEMO) return { data: demoLot(id), isLoading: version < 0 }
  return { data: q.data, isLoading: q.isLoading }
}
