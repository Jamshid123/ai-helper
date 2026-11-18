import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { API_BASE, ApiError, api } from '@/shared/api/client'
import { completeCheckout } from '@/entities/payment/api'
import {
  admit as demoAdmit,
  leave as demoLeave,
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
 * Источник данных сайта: API (`/api/v1`). VITE_DEMO_DATA=true — локальные тестовые данные без сервера
 * (разработка и скриншоты). С 15.11.2026 — сайт вместо Telegram Mini App (решение заказчика).
 */
export const DEMO = import.meta.env.VITE_DEMO_DATA === 'true'

/** Тестовый запуск с API: оплата имитируется сервером (VITE_DEMO_STAND=true при сборке). */
export const TEST_STAND = !DEMO && import.meta.env.VITE_DEMO_STAND === 'true'

const ROOM_POLL_MS = 3_000

/** Число участников — видно всем, в т.ч. до оплаты (решение заказчика 14.11.2026). */
export const participantsOf = (lot: Lot) => lot.admittedCount ?? 0
/** Мест нет: набран максимум участников (решение 14.11.2026). */
export const isFull = (lot: Lot) =>
  lot.full ?? (lot.maxParticipants != null && (lot.admittedCount ?? 0) >= lot.maxParticipants)
/** Фактическое окончание торгов (с «ожиданием следующей ставки»), мс. */
export const endsAtOf = (lot: Lot) => Date.parse(lot.endsAt ?? lot.closesAt)
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

/* ── Категории ───────────────────────────────────────────── */

export type Category = { slug: string; name: { ru: string; uz: string } }
const DEMO_CATEGORIES: Category[] = [{ slug: 'phones', name: { ru: 'Телефоны', uz: 'Telefonlar' } }]

/** Включённые категории каталога (названия ru/uz задаются в админке). */
export function useCategories(): Category[] {
  const q = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories', { auth: false }),
    enabled: !DEMO,
    staleTime: 60_000,
  })
  return DEMO ? DEMO_CATEGORIES : (q.data ?? [])
}

/* ── Допуски ─────────────────────────────────────────────── */

/**
 * Допуск покупателя (GET /me/admissions). carried — перенесён на повторные торги без нового взноса.
 * «Мои лоты» (решение 18.11.2026): итог и судьба взноса — с сервера; admitted=false — допуска нет, взнос возвращается/возвращён.
 */
export type AdmissionInfo = {
  lotId: string
  title?: string
  status?: string
  opensAt?: string
  closesAt?: string
  carried?: boolean
  confirmed?: boolean
  admitted?: boolean
  outcome?: 'WON' | 'NOT_WON' | null
  feeStatus?: 'PAID' | 'CARRIED' | 'REFUND_PENDING' | 'REFUNDED' | string
}
type Admissions = {
  ids: string[]
  has: (lotId: string) => boolean
  info: (lotId: string) => AdmissionInfo | undefined
  list: AdmissionInfo[]
  ready: boolean
}

export function useAdmissions(): Admissions {
  useDemoVersion()
  const q = useQuery({
    queryKey: ['admissions'],
    // гость (401) — просто без допусков, без ошибки
    queryFn: () =>
      api<AdmissionInfo[]>('/me/admissions').catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) return []
        throw e
      }),
    enabled: !DEMO,
    retry: false,
  })
  const list: AdmissionInfo[] = DEMO ? admittedLotIds().map((lotId) => ({ lotId })) : (q.data ?? [])
  // в списке есть и возвращённые взносы (допуска уже нет) — «допущен» только по действующим
  const active = list.filter((a) => a.admitted !== false)
  const ids = active.map((a) => a.lotId)
  return {
    ids,
    has: (lotId) => ids.includes(lotId),
    info: (lotId) => active.find((a) => a.lotId === lotId),
    list,
    ready: DEMO || q.isSuccess,
  }
}

type AdmissionStart =
  | { status: 'ADMITTED' }
  | { status: 'PAYMENT_REQUIRED'; orderId: string; provider: string; checkoutUrl: string | null }

/**
 * Оформить допуск: правила приняты → заказ → оплата выбранным способом (Click / Payme — переход на их страницу;
 * на тестовом запуске оплату имитирует сервер). 'redirected' — покупатель ушёл на страницу оплаты.
 */
export function useAdmit(): (
  lotId: string,
  pay?: { provider?: string; locale?: 'ru' | 'uz' }
) => Promise<'paid' | 'redirected'> {
  const qc = useQueryClient()
  return useCallback(
    async (lotId: string, pay: { provider?: string; locale?: 'ru' | 'uz' } = {}) => {
      if (DEMO) {
        await demoAdmit(lotId)
        return 'paid' as const
      }
      const r = await api<AdmissionStart>(`/lots/${lotId}/admission`, {
        method: 'POST',
        body: { acceptRules: true, ...pay },
      })
      if (r.status === 'PAYMENT_REQUIRED' && (await completeCheckout(r)) === 'redirected') return 'redirected' as const
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admissions'] }),
        qc.invalidateQueries({ queryKey: ['lot', lotId] }),
        qc.invalidateQueries({ queryKey: ['lots'] }),
      ])
      return 'paid' as const
    },
    [qc]
  )
}

/** Выйти из лота до начала торгов — сервер возвращает взнос полностью (решение 14.11.2026). */
export function useLeave(): (lotId: string) => Promise<void> {
  const qc = useQueryClient()
  return useCallback(
    async (lotId: string) => {
      if (DEMO) return demoLeave(lotId)
      await api(`/lots/${lotId}/admission`, { method: 'DELETE' })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['admissions'] }),
        qc.invalidateQueries({ queryKey: ['lot', lotId] }),
        qc.invalidateQueries({ queryKey: ['lots'] }),
        qc.invalidateQueries({ queryKey: ['autobid', lotId] }),
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

const DEMO_CODES = { CLOSED: 'LOT_CLOSED', TOO_LOW: 'BID_TOO_LOW', TOO_HIGH: 'BID_TOO_HIGH' } as const

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
      void qc.invalidateQueries({ queryKey: ['admissions'] })
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
  const closesAt = lot ? endsAtOf(lot) : 0
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
        return r.ok ? { ok: true } : { ok: false, code: DEMO_CODES[r.reason], minBid: r.minBid }
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
    closesAt: endsAtOf(lot),
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

/** Повторные торги: «Подтверждаю участие» для перенесённого допуска (иначе место освободится за 2 ч до старта). */
export function useConfirmParticipation(): (lotId: string) => Promise<void> {
  const qc = useQueryClient()
  return useCallback(
    async (lotId: string) => {
      await api(`/lots/${lotId}/admission/confirm`, { method: 'POST' })
      await qc.invalidateQueries({ queryKey: ['admissions'] })
    },
    [qc]
  )
}
