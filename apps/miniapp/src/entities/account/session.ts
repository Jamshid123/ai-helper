import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { DEMO } from '@/entities/lot/api'
import { ApiError, api } from '@/shared/api/client'
import { isRegistered, publicNameOf, resetAccount, updateAccount, useAccount } from './demo-account'

/**
 * Кто вошёл на сайт (решение 15.11.2026: вход по телефону и SMS-коду).
 * На сайте — сервер (`/auth/me` по cookie-сессии); в демо-режиме — локальный аккаунт этого устройства.
 */
export type Me = {
  id: string
  firstName: string
  publicName: string
  phoneVerified: boolean
  /** Активное ограничение участия — до какого момента (решение 18.11.2026: видно заранее). */
  restrictedUntil?: string | null
}

/** Код для демо-режима: SMS не отправляются, код один для всех. */
export const DEMO_CODE = '000000'

export function useMe(): { me: Me | null; loading: boolean } {
  const account = useAccount()
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('/auth/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    enabled: !DEMO,
    retry: false,
    staleTime: 60_000,
  })
  if (DEMO)
    return {
      me: isRegistered(account)
        ? { id: 'demo', firstName: account.firstName, publicName: publicNameOf(account), phoneVerified: true }
        : null,
      loading: false,
    }
  return { me: q.data ?? null, loading: q.isLoading }
}

/** Вошёл и представился (имя есть). */
export const isSignedIn = (me: Me | null): me is Me => Boolean(me?.firstName)

export function useAuthActions() {
  const qc = useQueryClient()
  const refresh = useCallback(async () => {
    await qc.invalidateQueries()
  }, [qc])

  const requestCode = useCallback(async (phone: string) => {
    if (DEMO) return { retryAfterSec: 60, devCode: DEMO_CODE }
    return api<{ retryAfterSec: number; devCode?: string }>('/auth/otp/request', { method: 'POST', body: { phone } })
  }, [])

  const verifyCode = useCallback(
    async (phone: string, code: string): Promise<{ needsProfile: boolean }> => {
      if (DEMO) {
        if (code !== DEMO_CODE) throw new ApiError(400, 'OTP_INVALID', 'Неверный код', { attemptsLeft: 4 })
        updateAccount({ phone, rulesAccepted: true })
        return { needsProfile: true }
      }
      const r = await api<{ user: Me; needsProfile: boolean }>('/auth/otp/verify', {
        method: 'POST',
        body: { phone, code },
      })
      // сразу кладём сессию в кэш: экраны не должны видеть устаревшее «гость»
      qc.setQueryData(['me'], r.user)
      await refresh()
      return r
    },
    [qc, refresh]
  )

  const saveProfile = useCallback(
    async (firstName: string, lastName: string) => {
      if (DEMO) return updateAccount({ firstName: firstName.trim(), lastName: lastName.trim(), rulesAccepted: true })
      const me = await api<Me>('/auth/profile', {
        method: 'POST',
        body: { firstName: firstName.trim(), ...(lastName.trim() && { lastName: lastName.trim() }) },
      })
      qc.setQueryData(['me'], me)
    },
    [qc]
  )

  const logout = useCallback(async () => {
    if (DEMO) return resetAccount()
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    // сразу «гость», остальные данные (допуски, автопредложения) перечитываются
    qc.setQueryData(['me'], null)
    await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
  }, [qc])

  return { requestCode, verifyCode, saveProfile, logout }
}
