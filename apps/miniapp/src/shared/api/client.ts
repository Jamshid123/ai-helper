import { rawInitData } from '@/app/telegram'

/**
 * Клиент API Mini App. Вход — по подписанной строке initData Telegram (проверяется на сервере),
 * сессия — короткий JWT в памяти вкладки (не в localStorage). Истёкшая сессия (401) → один повторный вход.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1'
const BASE = API_BASE

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; auth?: boolean }

let token: string | null = null
let signingIn: Promise<string> | null = null

/** Для тестов и выхода. */
export function resetSession(): void {
  token = null
  signingIn = null
}

async function send(path: string, opts: Options, bearer: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  try {
    return await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Нет соединения')
  }
}

async function read(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined
  const body: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>
    const code = typeof b.code === 'string' ? b.code : `HTTP_${res.status}`
    throw new ApiError(res.status, code, typeof b.message === 'string' ? b.message : code, b)
  }
  return body
}

async function signIn(): Promise<string> {
  const initData = rawInitData()
  if (!initData) throw new ApiError(401, 'NO_INIT_DATA', 'Откройте приложение из Telegram')
  const body = (await read(await send('/auth/telegram', { method: 'POST', body: { initData } }, null))) as {
    token: string
  }
  token = body.token
  return token
}

function session(): Promise<string> {
  if (token) return Promise.resolve(token)
  signingIn ??= signIn().finally(() => {
    signingIn = null
  })
  return signingIn
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  if (opts.auth === false) return (await read(await send(path, opts, null))) as T
  let res = await send(path, opts, await session())
  if (res.status === 401) {
    token = null
    res = await send(path, opts, await session())
  }
  return (await read(res)) as T
}
