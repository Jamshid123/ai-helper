import { type LotStatus } from './api'

/** Фильтры «Аукционы / Все лоты» (ТЗ 20.11.2026); значение — в адресе `?status=`, чтобы работали ссылки и «назад». */
export const LOT_FILTERS = [
  { id: undefined, text: 'Все', statuses: null },
  { id: 'draft', text: 'Черновики', statuses: ['DRAFT'] },
  { id: 'scheduled', text: 'Предстоящие', statuses: ['SCHEDULED'] },
  { id: 'live', text: 'Идут', statuses: ['LIVE'] },
  { id: 'cancelled', text: 'Отменённые', statuses: ['CANCELLED'] },
] as const satisfies readonly {
  id: string | undefined
  text: string
  statuses: readonly LotStatus[] | null
}[]
export type LotFilter = Exclude<(typeof LOT_FILTERS)[number]['id'], undefined>

export const parseLotFilter = (v: unknown): LotFilter | undefined =>
  LOT_FILTERS.find((f) => f.id !== undefined && f.id === v)?.id

/** «Аукционы / Результаты»: торги завершены — продан, без продажи или на проверке после сбоя. */
export const RESULT_STATUSES: readonly LotStatus[] = [
  'CLOSED_SOLD',
  'CLOSED_UNSOLD',
  'UNDER_REVIEW',
]
