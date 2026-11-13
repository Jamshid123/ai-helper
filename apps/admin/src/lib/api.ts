/**
 * HTTP-клиент админки.
 *
 * Сессия — только httpOnly-cookie, которую ставит сервер; токенов в JS нет.
 * Для мутаций сервер ожидает CSRF-токен (double submit): значение читается из
 * cookie `csrf_token` и отправляется в заголовке `X-CSRF-Token`.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function readCookie(name: string): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined
}

export async function api<T>(
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {}
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  if (MUTATING.has(method)) {
    const csrf = readCookie('csrf_token')
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

  if (res.status === 204) return undefined as T

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (data ?? {}) as { code?: unknown; message?: unknown }
    throw new ApiError(
      res.status,
      typeof err.code === 'string' ? err.code : 'UNKNOWN',
      typeof err.message === 'string' ? err.message : 'Ошибка запроса'
    )
  }
  return data as T
}
