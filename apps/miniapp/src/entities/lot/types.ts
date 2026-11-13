/** Контракт лота, как его отдаёт API (`GET /api/v1/lots`). Деньги — строки целых сумов. */
export type Condition = 'new' | 'used'
export type LotStatus = 'scheduled' | 'live' | 'closed'

export type Lot = {
  id: string
  title: string
  category: 'phones'
  condition: Condition
  seller: 'platform'
  startPrice: string
  step: string
  currentPrice: string | null
  admittedCount: number
  fee: string
  opensAt: string
  closesAt: string
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
