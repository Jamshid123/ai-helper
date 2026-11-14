import { useSyncExternalStore } from 'react'
import { buildDemoLots } from './demo-data'
import { placeBid, roomMinBid, type BidResult, type Room } from './engine'
import { type Lot } from './types'

/**
 * Состояние демо-стенда в памяти вкладки: лоты, допуски, комнаты торгов.
 * Имитирует других участников, чтобы комната выглядела живой.
 * На проде эти данные приходят с сервера и по WebSocket.
 */
const BOT_NAMES = ['Дилшод Р.', 'Малика Т.', 'Участник 0417', 'Азиз К.', 'Нодира А.', 'Участник 0233']

const lots: Lot[] = buildDemoLots(new Date())
const admissions = new Set<string>()
/** Автопредложения пользователя (демо): lotId → максимум. */
const autoBids = new Map<string, bigint>()
const rooms = new Map<string, Room>()
const listeners = new Set<() => void>()
let version = 0

function emit() {
  version++
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useDemoVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}

export function demoLots(): Lot[] {
  return lots.map((l) => {
    const room = rooms.get(l.id)
    const last = room?.bids.at(-1)
    return { ...l, currentPrice: last ? last.amount.toString() : null }
  })
}

export function demoLot(id: string): Lot | undefined {
  return demoLots().find((l) => l.id === id)
}

export function isAdmitted(lotId: string): boolean {
  return admissions.has(lotId)
}

export function admit(lotId: string): void {
  admissions.add(lotId)
  emit()
}

/** Демо: выход из лота до начала (на сервере — возврат 100%). */
export function leave(lotId: string): void {
  admissions.delete(lotId)
  autoBids.delete(lotId)
  emit()
}

export function admittedLotIds(): string[] {
  return [...admissions]
}

export function getRoom(lotId: string): Room {
  let room = rooms.get(lotId)
  if (!room) {
    const lot = lots.find((l) => l.id === lotId)
    if (!lot) throw new Error(`Unknown lot ${lotId}`)
    room = {
      lotId,
      start: BigInt(lot.startPrice),
      step: BigInt(lot.step),
      closesAt: Date.parse(lot.closesAt),
      bids: [],
    }
    // пара стартовых ставок, чтобы история не была пустой
    for (const who of BOT_NAMES.slice(0, 2)) {
      const r = placeBid(room, roomMinBid(room), who, false, Date.now() - 600_000)
      if (r.ok) room = r.room
    }
    rooms.set(lotId, room)
  }
  return room
}

export function getAutoBid(lotId: string): bigint | null {
  return autoBids.get(lotId) ?? null
}

export function setAutoBid(lotId: string, max: bigint | null): void {
  if (max === null) autoBids.delete(lotId)
  else autoBids.set(lotId, max)
  respondWithAutoBid(lotId)
  emit()
}

/** Если пользователя перебили и его максимум позволяет — предлагаем за него минимальную цену. */
function respondWithAutoBid(lotId: string): void {
  const max = autoBids.get(lotId)
  if (max === undefined || !admissions.has(lotId)) return
  const room = getRoom(lotId)
  if (room.bids.at(-1)?.isMe) return
  const min = roomMinBid(room)
  if (min > max) return
  const r = placeBid(room, min, 'me', true, Date.now())
  if (r.ok) rooms.set(lotId, r.room)
}

export function demoPlaceBid(lotId: string, amount: bigint): BidResult {
  const r = placeBid(getRoom(lotId), amount, 'me', true, Date.now())
  if (r.ok) {
    rooms.set(lotId, r.room)
    emit()
  }
  return r
}

/** Боты иногда перебивают ставку, пока открыта комната. Возвращает функцию остановки. */
export function startBots(lotId: string): () => void {
  let timer: ReturnType<typeof setTimeout>
  const tick = () => {
    const room = getRoom(lotId)
    if (Date.now() < room.closesAt && Math.random() < 0.6) {
      const who = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
      const r = placeBid(room, roomMinBid(room), who, false, Date.now())
      if (r.ok) {
        rooms.set(lotId, r.room)
        respondWithAutoBid(lotId)
        emit()
      }
    }
    timer = setTimeout(tick, 9_000 + Math.random() * 12_000)
  }
  timer = setTimeout(tick, 7_000)
  return () => clearTimeout(timer)
}

/** Сколько человек «в комнате» — только для отображения, на правила не влияет. */
export function demoOnline(lot: Lot): number {
  return Math.max(3, Math.round(lot.admittedCount * 0.6))
}

// Живые лоты сразу получают пару ставок, чтобы каталог и комната показывали одну цену.
lots.filter((l) => l.status === 'live').forEach((l) => getRoom(l.id))
