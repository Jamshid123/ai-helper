/** Отказ в предложении цены: код для клиента + актуальная минимальная цена, чтобы клиент сразу обновился. */
export type BidRejectCode =
  | 'LOT_NOT_FOUND'
  | 'LOT_NOT_LIVE'
  | 'LOT_CLOSED'
  | 'NO_ADMISSION'
  | 'RESTRICTED'
  | 'CONFLICT_OF_INTEREST'
  | 'BID_TOO_LOW'
  | 'ALREADY_LEADING'

export class BidRejectedError extends Error {
  constructor(
    readonly code: BidRejectCode,
    readonly minBid: bigint | null = null
  ) {
    super(code)
    this.name = 'BidRejectedError'
  }
}
