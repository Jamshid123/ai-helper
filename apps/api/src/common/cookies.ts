/** Минимальные утилиты cookie (без зависимости): разбор заголовка Cookie и сборка Set-Cookie. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    const name = part.slice(0, i).trim()
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      // битое значение — пропускаем
    }
  }
  return out
}

type CookieOptions = { maxAge: number; path: string; httpOnly: boolean }

/** Всегда Secure и SameSite=Strict (админка — только HTTPS, без кросс-сайтовых запросов). */
export function serializeCookie(name: string, value: string, o: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${o.path}`,
    `Max-Age=${o.maxAge}`,
    'Secure',
    'SameSite=Strict',
  ]
  if (o.httpOnly) parts.push('HttpOnly')
  return parts.join('; ')
}
