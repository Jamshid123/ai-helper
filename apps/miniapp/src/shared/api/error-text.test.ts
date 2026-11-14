import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/telegram', () => ({ rawInitData: () => '' }))
const { ApiError } = await import('./client')
const { errorText } = await import('./error-text')

describe('errorText', () => {
  const t = (k: string) => k
  it('известные коды → свои тексты, сессия → «откройте заново», прочее → общий текст', () => {
    expect(errorText(t, 'BID_TOO_LOW')).toBe('err.BID_TOO_LOW')
    expect(errorText(t, new ApiError(503, 'PAYMENTS_DISABLED', 'x'))).toBe('err.PAYMENTS_DISABLED')
    expect(errorText(t, new ApiError(401, 'INVALID_INIT_DATA', 'x'))).toBe('err.SESSION')
    expect(errorText(t, new ApiError(500, 'HTTP_500', 'x'))).toBe('err.GENERIC')
    expect(errorText(t, new Error('boom'))).toBe('err.GENERIC')
  })
})
