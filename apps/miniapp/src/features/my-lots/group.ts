import type { AdmissionInfo } from '@/entities/lot/api'
import type { Purchase } from '@/entities/purchase/api'

export type HistoryItem = { kind: 'purchase'; p: Purchase } | { kind: 'admission'; a: AdmissionInfo }

export type MyLots = {
  /** Нужно действие: оплатить 10% / остаток и забрать по коду; подтвердить участие в повторных торгах. */
  action: { purchases: Purchase[]; confirm: AdmissionInfo[] }
  /** Торги идут, допуск есть — «В комнату». */
  live: AdmissionInfo[]
  /** Торги впереди, допуск есть. */
  upcoming: AdmissionInfo[]
  /** Получен / аннулирован / не победили / взнос возвращён / торги отменены. */
  history: HistoryItem[]
}

const ACTIVE_PURCHASE = new Set(['AWAITING_PREPAYMENT', 'AWAITING_PICKUP'])

/**
 * «Мои лоты» (решение 18.11.2026): раскладка по группам. Итог лота и судьба взноса приходят с сервера —
 * здесь только порядок показа. Выигранный лот показывается одной карточкой выкупа, без дубля из допусков.
 */
export function groupMyLots(admissions: AdmissionInfo[], purchases: Purchase[]): MyLots {
  const wonLots = new Set(purchases.map((p) => p.lotId))
  const out: MyLots = { action: { purchases: [], confirm: [] }, live: [], upcoming: [], history: [] }

  for (const p of purchases) {
    if (ACTIVE_PURCHASE.has(p.status)) out.action.purchases.push(p)
    else out.history.push({ kind: 'purchase', p })
  }
  for (const a of admissions) {
    if (wonLots.has(a.lotId) || a.outcome === 'WON') continue
    const admitted = a.admitted !== false
    if (admitted && a.status === 'LIVE') out.live.push(a)
    else if (admitted && (a.status === 'SCHEDULED' || a.status === 'DRAFT')) {
      if (a.carried && !a.confirmed) out.action.confirm.push(a)
      else out.upcoming.push(a)
    } else out.history.push({ kind: 'admission', a })
  }
  // ближайшие — первыми
  const byOpens = (x: AdmissionInfo, y: AdmissionInfo) => Date.parse(x.opensAt ?? '') - Date.parse(y.opensAt ?? '')
  out.upcoming.sort(byOpens)
  out.action.confirm.sort(byOpens)
  return out
}

export const isEmpty = (g: MyLots) =>
  !g.action.purchases.length && !g.action.confirm.length && !g.live.length && !g.upcoming.length && !g.history.length
