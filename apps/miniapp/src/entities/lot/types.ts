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
  admittedCount: number
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
  /** Оттенок плашки-заглушки вместо фото (в демо фото нет). */
  hue: number
}
