import { beforeEach, describe, expect, it, vi } from 'vitest'

const { api, ApiError } = await import('./client')

type Call = { url: string; init: RequestInit }
let calls: Call[] = []
let replies: Array<() => Response> = []
const json = (status: number, body: unknown) => () =>
  new Response(body === undefined ? null : JSON.stringify(body), { status })

beforeEach(() => {
  calls = []
  replies = []
  vi.stubGlobal('document', { cookie: 'other=1; buyer_csrf=tok%2B1' })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = replies.shift()
    if (!next) throw new Error(`unexpected fetch ${url}`)
    return next()
  })
})

describe('api client (сайт, cookie-сессия)', () => {
  it('cookie того же сайта; изменения — с CSRF-заголовком, чтение — без', async () => {
    replies.push(json(200, { a: 1 }), json(200, { ok: true }))
    expect(await api('/me/admissions')).toEqual({ a: 1 })
    expect(calls[0].init.credentials).toBe('same-origin')
    expect(new Headers(calls[0].init.headers).get('x-csrf-token')).toBeNull()
    await api('/lots/x/bids', { method: 'POST', body: { amount: '1' } })
    expect(new Headers(calls[1].init.headers).get('x-csrf-token')).toBe('tok+1')
    expect(new Headers(calls[1].init.headers).get('authorization')).toBeNull()
  })

  it('ошибка API → ApiError с кодом и телом; 204 → undefined; 401 → UNAUTHORIZED', async () => {
    replies.push(json(409, { code: 'BID_TOO_LOW', message: 'x', minBid: '2100000' }))
    const err = await api('/lots/x/bids', { method: 'POST', body: { amount: '1' } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'BID_TOO_LOW', body: { minBid: '2100000' } })
    replies.push(json(204, undefined))
    expect(await api('/lots/x/autobid', { method: 'DELETE' })).toBeUndefined()
    replies.push(json(401, { code: 'UNAUTHORIZED' }))
    await expect(api('/auth/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  })

  it('сеть недоступна → ApiError NETWORK', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(api('/lots')).rejects.toMatchObject({ code: 'NETWORK' })
  })
})
