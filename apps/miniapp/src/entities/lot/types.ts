/** Контракт лота, как его отдаёт API (`GET /api/v1/lots`). Деньги — строки целых сумов. */
export type Condition = 'new' | 'used'
export type LotStatus = 'scheduled' | 'live' | 'closed'

export type Lot = {
  id: string
  title: string
  /** Код категории (phones, …) — см. GET /categories. */
  category: string
  condition: Condition
  seller: 'platform'
  startPrice: string
  step: string
  currentPrice: string | null
  /** Мест нет (набран максимум). В API приходит вместо числа участников. */
  full?: boolean
  /** Только демо-данные: в API число участников видно допущенным (`/me/admissions`), решение 14.11.2026. */
  admittedCount?: number
  fee: string
  opensAt: string
  closesAt: string
  /** Фактическое окончание (с учётом «ожидания следующей ставки»); в демо нет — берётся closesAt. */
  endsAt?: string
  /** Ожидание следующей ставки, сек: столько без новых предложений — торги завершаются раньше. */
  bidTimeoutSec?: number | null
  maxParticipants?: number | null
  minParticipants?: number | null
  status: LotStatus
  inspection: {
    summary: string
    battery: number | null
    imeiChecked: boolean
    kit: string[]
    defects: string[]
  }
  /** Фото товара (адреса), первое — главное; видны всем, в т.ч. до допуска. В демо нет. */
  photos?: string[]
  /** Оттенок плашки-заглушки, когда фото нет. */
  hue: number
  /** Сделка не состоялась → повторные торги: id нового лота, когда опубликован. */
  relistLotId?: string | null
  /** Повторные торги готовятся (дата ещё не объявлена). */
  relistPending?: boolean
}
