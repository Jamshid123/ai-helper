import { describe, expect, it } from 'vitest'
import { placeBid, roomMinBid, type Room } from './engine'

const base: Room = {
  lotId: 'l1',
  start: 2_000_000n,
  step: 100_000n,
  closesAt: 1_000,
  bids: [],
}

describe('demo bid engine', () => {
  it('первая ставка ниже старта отклоняется', () => {
    const r = placeBid(base, 1_900_000n, 'a', true, 0)
    expect(r).toEqual({ ok: false, reason: 'TOO_LOW', minBid: 2_000_000n })
  })

  it('пример из ТЗ: после 2 000 000 минимум 2 100 000', () => {
    const r = placeBid(base, 2_000_000n, 'a', true, 0)
    if (!r.ok) throw new Error('expected ok')
    expect(roomMinBid(r.room)).toBe(2_100_000n)
    expect(placeBid(r.room, 2_050_000n, 'b', false, 1).ok).toBe(false)
  })

  it('порядковые номера идут подряд', () => {
    let room = base
    for (const amount of [2_000_000n, 2_100_000n, 2_300_000n]) {
      const r = placeBid(room, amount, 'x', false, 0)
      if (!r.ok) throw new Error('expected ok')
      room = r.room
    }
    expect(room.bids.map((b) => b.seq)).toEqual([1, 2, 3])
  })

  it('ставка в момент закрытия отклоняется', () => {
    expect(placeBid(base, 2_000_000n, 'a', true, 1_000)).toMatchObject({
      ok: false,
      reason: 'CLOSED',
    })
    expect(placeBid(base, 2_000_000n, 'a', true, 999).ok).toBe(true)
  })
})
