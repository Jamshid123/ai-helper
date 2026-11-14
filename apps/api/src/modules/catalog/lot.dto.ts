import type { Category, Lot } from '@prisma/client'
import { effectiveEnd } from '@auksion/shared'

/**
 * Лот в формате, который ждёт Mini App (apps/miniapp/src/entities/lot/types.ts).
 * Деньги — строки целых сумов. Полный IMEI и внутренние поля наружу не отдаются.
 */
export type LotDto = {
  id: string
  title: string
  /** Код категории (phones, travel, …). */
  category: string
  condition: 'new' | 'used'
  seller: 'platform' | 'external'
  startPrice: string
  step: string
  currentPrice: string | null
  admittedCount: number
  fee: string
  opensAt: string
  closesAt: string
  /** Фактическое окончание: closesAt или раньше — после «ожидания следующего предложения». */
  endsAt: string
  /** Ожидание следующего предложения, сек (null — без досрочного завершения). */
  bidTimeoutSec: number | null
  maxParticipants: number | null
  minParticipants: number | null
  status: 'scheduled' | 'live' | 'closed'
  inspection: { summary: string; battery: number | null; imeiChecked: boolean; kit: string[]; defects: string[] }
  hue: number
}

const STATUS: Record<Lot['status'], LotDto['status'] | null> = {
  DRAFT: null,
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  CLOSED_SOLD: 'closed',
  CLOSED_UNSOLD: 'closed',
  UNDER_REVIEW: 'closed',
  CANCELLED: null,
}

/** Публичные статусы (черновики и отменённые не показываются). */
export const PUBLIC_STATUSES = Object.entries(STATUS)
  .filter(([, v]) => v !== null)
  .map(([k]) => k as Lot['status'])

/** Видимый покупателю лот: публичный статус и включённая категория (решение 14.11.2026). */
export const PUBLIC_LOT_WHERE = { status: { in: PUBLIC_STATUSES }, category: { enabled: true } }

function hueOf(id: string): number {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

function inspectionOf(raw: unknown): LotDto['inspection'] {
  const o = (raw ?? {}) as Record<string, unknown>
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return {
    summary: typeof o.summary === 'string' ? o.summary : '',
    battery: typeof o.battery === 'number' ? o.battery : null,
    imeiChecked: o.imeiChecked === true,
    kit: strings(o.kit),
    defects: strings(o.defects),
  }
}

export type LotWithCategory = Lot & { category: Pick<Category, 'slug'> }

export function toLotDto(lot: LotWithCategory): LotDto {
  return {
    id: lot.id,
    title: lot.title,
    category: lot.category.slug,
    condition: lot.condition === 'NEW' ? 'new' : 'used',
    seller: lot.sellerType === 'PLATFORM' ? 'platform' : 'external',
    startPrice: lot.startPrice.toString(),
    step: lot.step.toString(),
    currentPrice: lot.currentPrice?.toString() ?? null,
    admittedCount: lot.admittedCount,
    fee: lot.fee.toString(),
    opensAt: lot.opensAt.toISOString(),
    closesAt: lot.closesAt.toISOString(),
    endsAt: effectiveEnd(lot.closesAt, lot.lastBidAt, lot.bidTimeoutSec).toISOString(),
    bidTimeoutSec: lot.bidTimeoutSec,
    maxParticipants: lot.maxParticipants,
    minParticipants: lot.minParticipants,
    status: STATUS[lot.status] ?? 'closed',
    inspection: inspectionOf(lot.inspection),
    hue: hueOf(lot.id),
  }
}
