import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { DEMO } from '@/entities/lot/api'
import { ApiError, api } from '@/shared/api/client'

/** Уведомление покупателю (повторные торги, решение 16.11.2026). */
export type Notice = {
  id: string
  type: 'relist_invite' | 'relist_reminder' | 'relist_released' | 'relist_cancelled' | string
  lotId: string
  lotTitle: string
  opensAt: string | null
}

export function useNotices(): Notice[] {
  const q = useQuery({
    queryKey: ['notices'],
    queryFn: () =>
      api<Notice[]>('/me/notifications').catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) return []
        throw e
      }),
    enabled: !DEMO,
    retry: false,
    refetchInterval: 60_000,
  })
  return DEMO ? [] : (q.data ?? [])
}

export function useReadNotice(): (id: string) => Promise<void> {
  const qc = useQueryClient()
  return useCallback(
    async (id: string) => {
      qc.setQueryData<Notice[]>(['notices'], (list) => (list ?? []).filter((n) => n.id !== id))
      await api(`/me/notifications/${id}/read`, { method: 'POST' }).catch(() => undefined)
    },
    [qc]
  )
}
