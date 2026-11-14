import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/telegram', () => ({ rawInitData: () => 'signed-init-data' }))

const { api, ApiError, resetSession } = await import('./client')

type Call = { url: string; init: RequestInit }
let calls: Call[] = []
let replies: Array<() => Response> = []

function json(status: number, body: unknown) {
  return () => new Response(body === undefined ? null : JSON.stringify(body), { status })
}

beforeEach(() => {
  calls = []
  replies = []
  resetSession()
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = replies.shift()
    if (!next) throw new Error(`unexpected fetch ${url}`)
    return next()
  })
})

describe('api client', () => {
  it('входит по initData один раз и шлёт токен в Authorization', async () => {
    replies.push(json(200, { token: 't1' }), json(200, { a: 1 }), json(200, { b: 2 }))
    const [a, b] = await Promise.all([api('/me/admissions'), api('/lots/x/autobid')])
    expect(a).toEqual({ a: 1 })
    expect(b).toEqual({ b: 2 })
    expect(calls[0].url).toBe('/api/v1/auth/telegram')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ initData: 'signed-init-data' })
    expect(calls.filter((c) => c.url.endsWith('/auth/telegram'))).toHaveLength(1)
    expect(new Headers(calls[1].init.headers).get('authorization')).toBe('Bearer t1')
  })

  it('сессия истекла (401) — входит заново и повторяет запрос один раз', async () => {
    replies.push(
      json(200, { token: 'old' }),
      json(401, { code: 'UNAUTHORIZED' }),
      json(200, { token: 'new' }),
      json(200, { ok: true })
    )
    expect(await api('/me/admissions')).toEqual({ ok: true })
    expect(new Headers(calls[3].init.headers).get('authorization')).toBe('Bearer new')
  })

  it('ошибка API → ApiError с кодом и телом; 204 → undefined; публичный запрос без входа', async () => {
    replies.push(json(200, { token: 't' }), json(409, { code: 'BID_TOO_LOW', message: 'x', minBid: '2100000' }))
    const err = await api('/lots/x/bids', { method: 'POST', body: { amount: '1' } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'BID_TOO_LOW', body: { minBid: '2100000' } })

    replies.push(json(204, undefined))
    expect(await api('/lots/x/autobid', { method: 'DELETE' })).toBeUndefined()

    replies.push(json(200, []))
    await api('/lots', { auth: false })
    expect(new Headers(calls.at(-1)!.init.headers).get('authorization')).toBeNull()
  })

  it('сеть недоступна → ApiError NETWORK', async () => {
    resetSession()
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(api('/lots', { auth: false })).rejects.toMatchObject({ code: 'NETWORK' })
  })
})
