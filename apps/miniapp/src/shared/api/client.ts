/**
 * Клиент API сайта. Сессия — httpOnly-cookie, которую ставит сервер после входа по SMS-коду
 * (решение 15.11.2026); токенов в JS нет. Изменения шлют CSRF-токен из cookie `buyer_csrf`.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1'
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

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

function readCookie(name: string): string | undefined {
  const row = document.cookie.split('; ').find((r) => r.startsWith(`${name}=`))
  return row ? decodeURIComponent(row.slice(name.length + 1)) : undefined
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (MUTATING.has(method)) {
    const csrf = readCookie('buyer_csrf')
    if (csrf) headers['X-CSRF-Token'] = csrf
  }
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Нет соединения')
  }
  if (res.status === 204) return undefined as T
  const body: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>
    const code = typeof b.code === 'string' ? b.code : `HTTP_${res.status}`
    throw new ApiError(res.status, code, typeof b.message === 'string' ? b.message : code, b)
  }
  return body as T
}
