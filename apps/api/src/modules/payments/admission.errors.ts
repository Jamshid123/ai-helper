export type AdmissionErrorCode =
  | 'LOT_NOT_FOUND'
  | 'LOT_CLOSED'
  | 'RULES_NOT_ACCEPTED'
  | 'RESTRICTED'
  | 'LOT_STARTED'
  | 'NOT_ADMITTED'
  | 'LOT_FULL'

export class AdmissionError extends Error {
  constructor(readonly code: AdmissionErrorCode) {
    super(code)
  }
}
