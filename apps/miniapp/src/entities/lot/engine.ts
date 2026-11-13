import { minNextBid } from '@auksion/shared'

/**
 * Движок ставок для демо-стенда. Повторяет серверные правила ТЗ:
 * первая ставка ≥ старта, далее ≥ текущая + шаг, после закрытия — отказ,
 * порядковый номер монотонный. На проде решение принимает только сервер.
 */
export type Bid = { seq: number; amount: bigint; bidder: string; isMe: boolean; at: number }

export type Room = {
  lotId: string
  start: bigint
  step: bigint
  closesAt: number
  bids: Bid[]
}

export type BidResult =
  | { ok: true; room: Room; bid: Bid }
  | { ok: false; reason: 'TOO_LOW' | 'CLOSED'; minBid: bigint }

export function currentPrice(room: Room): bigint | null {
  return room.bids.length ? room.bids[room.bids.length - 1].amount : null
}

export function roomMinBid(room: Room): bigint {
  return minNextBid(room.start, room.step, currentPrice(room))
}

export function placeBid(room: Room, amount: bigint, bidder: string, isMe: boolean, now: number): BidResult {
  if (now >= room.closesAt) return { ok: false, reason: 'CLOSED', minBid: roomMinBid(room) }
  const min = roomMinBid(room)
  if (amount < min) return { ok: false, reason: 'TOO_LOW', minBid: min }
  const bid: Bid = { seq: room.bids.length + 1, amount, bidder, isMe, at: now }
  return { ok: true, room: { ...room, bids: [...room.bids, bid] }, bid }
}
