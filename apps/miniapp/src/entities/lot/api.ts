import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isInTelegram } from '@/app/telegram'
import { API_BASE, ApiError, api } from '@/shared/api/client'
import {
  admit as demoAdmit,
  admittedLotIds,
  demoLot,
  demoLots,
  demoOnline,
  demoPlaceBid,
  getAutoBid as demoGetAutoBid,
  getRoom,
  setAutoBid as demoSetAutoBid,
  startBots,
  useDemoVersion,
} from './demo-store'
import { type Room } from './engine'
import { type Lot } from './types'

/**
 * Источник данных Mini App. Внутри Telegram — API (`/api/v1`), в обычном браузере или при
 * VITE_DEMO_DATA=true — демо-стенд на тестовых данных (решение заказчика 14.11.2026).
 */
export const DEMO = import.meta.env.VITE_DEMO_DATA === 'true' || !isInTelegram()

/** Тестовый запуск с API: оплата имитируется сервером (VITE_DEMO_STAND=true при сборке). */
export const TEST_STAND = !DEMO && import.meta.env.VITE_DEMO_STAND === 'true'

const ROOM_POLL_MS = 3_000
/** Пока поток событий подключён, опрос — только страховка. */
const ROOM_POLL_LIVE_MS = 20_000
const LOTS_POLL_MS = 15_000

export function useLots(): { data: Lot[] | undefined; isLoading: boolean } {
  const version = useDemoVersion()
  const q = useQuery({
    queryKey: ['lots'],
    queryFn: () => api<Lot[]>('/lots', { auth: false }),
    enabled: !DEMO,
    refetchInterval: LOTS_POLL_MS,
  })
  if (DEMO) return { data: demoLots(), isLoading: version < 0 }
  return { data: q.data, isLoading: q.isLoading }
}

export function useLot(id: string): { data: Lot | undefined; isLoading: boolean } {
  const version = useDemoVersion()
  const q = useQuery({
    queryKey: ['lot', id],
    queryFn: () => api<Lot>(`/lots/${id}`, { auth: false }),
    enabled: !DEMO,
    refetchInterval: (query) => (query.state.data?.status === 'live' ? ROOM_POLL_MS * 2 : LOTS_POLL_MS),
  })
  if (DEMO) return { data: demoLot(id), isLoading: version < 0 }
  return { data: q.data, isLoading: q.isLoading }
}

/* ── Допуски ─────────────────────────────────────────────── */

export function useAdmissions(): { ids: string[]; has: (lotId: string) => boolean; ready: boolean } {
  useDemoVersion()
  const q = useQuery({
    queryKey: ['admissions'],
    queryFn: () => api<{ lotId: string }[]>('/me/admissions'),
    enabled: !DEMO,
  })
  const ids = DEMO ? admittedLotIds() : (q.data ?? []).map((a) => a.lotId)
  return { ids, has: (lotId) => ids.includes(lotId), ready: DEMO || q.isSuccess }
}

type AdmissionStart =
  | { status: 'ADMITTED' }
  | { status: 'PAYMENT_REQUIRED'; orderId: string; provider: string; checkoutUrl: string | null }

/** Оформить допуск: правила приняты → заказ → оплата (на тестовом запуске — имитация сервером). */
export function useAdmit(): (lotId: string) => Promise<void> {
  const qc = useQueryClient()
  return useCallback(
    async (lotId: string) => {
      if (DEMO) return demoAdmit(lotId)
      const r = await api<AdmissionStart>(`/lots/${lotId}/admission`, { method: 'POST', body: { acceptRules: true } })
      if (r.status === 'PAYMENT_REQUIRED') {
        if (r.provider !== 'fake') throw new ApiError(503, 'PAYMENTS_DISABLED', 'Оплата скоро будет доступна')
        await api(`/payments/fake/${r.orderId}/complete`, { method: 'POST' })
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admissions'] }),
        qc.invalidateQueries({ queryKey: ['lot', lotId] }),
        qc.invalidateQueries({ queryKey: ['lots'] }),
      ])
    },
    [qc]
  )
}

/* ── Комната торгов ──────────────────────────────────────── */

type Feed = {
  currentPrice: string | null
  minNextBid: string
  lastSeq: number
  bids: { seq: number; amount: string; bidder: string; mine: boolean; createdAt: string }[]
}

export type OfferResult = { ok: true } | { ok: false; code: string; minBid: bigint | null }

export type RoomView = {
  room: Room
  /** «В комнате» (только демо); в API присутствия пока нет. */
  online: number | null
  offer: (amount: bigint) => Promise<OfferResult>
}

/**
 * Поток событий лота (SSE): на каждое событие и после (пере)подключения перечитываем состояние по HTTP.
 * Браузер сам переподключается; пока соединения нет, комната чаще опрашивает сервер.
 */
function useLiveLot(lotId: string, enabled: boolean): boolean {
  const qc = useQueryClient()
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!enabled || !lotId || typeof EventSource === 'undefined') return
    const es = new EventSource(`${API_BASE}/lots/${lotId}/events`)
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['bids', lotId] })
      void qc.invalidateQueries({ queryKey: ['lot', lotId] })
    }
    es.onopen = () => {
      setConnected(true)
      refresh()
    }
    es.onerror = () => setConnected(false)
    es.addEventListener('bid', refresh)
    es.addEventListener('lot', refresh)
    return () => {
      es.close()
      setConnected(false)
    }
  }, [lotId, enabled, qc])
  return connected
}

export function useRoom(lot: Lot | undefined): RoomView | undefined {
  useDemoVersion()
  const qc = useQueryClient()
  const lotId = lot?.id ?? ''
  const closesAt = lot ? Date.parse(lot.closesAt) : 0
  const live = useLiveLot(lotId, !DEMO && Boolean(lot))
  const q = useQuery({
    queryKey: ['bids', lotId],
    queryFn: () => api<Feed>(`/lots/${lotId}/bids`),
    enabled: !DEMO && Boolean(lot),
    // после закрытия опрос не нужен (функция вызывается вне рендера)
    refetchInterval: () => (Date.now() >= closesAt ? false : live ? ROOM_POLL_LIVE_MS : ROOM_POLL_MS),
  })
  useEffect(() => (DEMO && lotId ? startBots(lotId) : undefined), [lotId])

  const offer = useCallback(
    async (amount: bigint): Promise<OfferResult> => {
      if (DEMO) {
        const r = demoPlaceBid(lotId, amount)
        return r.ok
          ? { ok: true }
          : { ok: false, code: r.reason === 'CLOSED' ? 'LOT_CLOSED' : 'BID_TOO_LOW', minBid: r.minBid }
      }
      try {
        await api(`/lots/${lotId}/bids`, {
          method: 'POST',
          body: { amount: amount.toString(), idempotencyKey: crypto.randomUUID() },
        })
        return { ok: true }
      } catch (e) {
        if (!(e instanceof ApiError)) throw e
        const min = typeof e.body.minBid === 'string' ? BigInt(e.body.minBid) : null
        return { ok: false, code: e.code, minBid: min }
      } finally {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['bids', lotId] }),
          qc.invalidateQueries({ queryKey: ['lot', lotId] }),
          qc.invalidateQueries({ queryKey: ['autobid', lotId] }),
        ])
      }
    },
    [lotId, qc]
  )

  if (!lot) return undefined
  if (DEMO) return { room: getRoom(lot.id), online: demoOnline(lot), offer }
  if (!q.data) return undefined
  const room: Room = {
    lotId: lot.id,
    start: BigInt(lot.startPrice),
    step: BigInt(lot.step),
    closesAt: Date.parse(lot.closesAt),
    bids: q.data.bids
      .slice()
      .reverse()
      .map((b) => ({
        seq: b.seq,
        amount: BigInt(b.amount),
        bidder: b.bidder,
        isMe: b.mine,
        at: Date.parse(b.createdAt),
      })),
  }
  return { room, online: null, offer }
}

/* ── Автопредложение ─────────────────────────────────────── */

export function useAutoBid(lotId: string): { max: bigint | null; set: (max: bigint | null) => Promise<void> } {
  useDemoVersion()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['autobid', lotId],
    queryFn: () => api<{ maxAmount: string; active: boolean } | null>(`/lots/${lotId}/autobid`),
    enabled: !DEMO,
  })
  const set = useCallback(
    async (max: bigint | null) => {
      if (DEMO) return demoSetAutoBid(lotId, max)
      if (max === null) await api(`/lots/${lotId}/autobid`, { method: 'DELETE' })
      else await api(`/lots/${lotId}/autobid`, { method: 'PUT', body: { maxAmount: max.toString() } })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['autobid', lotId] }),
        qc.invalidateQueries({ queryKey: ['bids', lotId] }),
        qc.invalidateQueries({ queryKey: ['lot', lotId] }),
      ])
    },
    [lotId, qc]
  )
  const max = DEMO ? demoGetAutoBid(lotId) : q.data?.active ? BigInt(q.data.maxAmount) : null
  return { max, set }
}
