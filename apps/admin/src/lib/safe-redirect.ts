/**
 * Возвращает безопасный внутренний путь для редиректа после входа.
 * Защита от open redirect: допускаются только пути вида `/section...`
 * в пределах этого приложения, без схемы, хоста и `//`.
 */
export function safeRedirect(target: unknown, fallback = '/'): string {
  if (typeof target !== 'string' || target.length === 0) return fallback
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return fallback
  }
  // Управляющие символы и обратные слэши браузеры трактуют непредсказуемо.
  for (const ch of target) {
    if (ch === '\\' || ch.charCodeAt(0) < 0x20) return fallback
  }
  try {
    const url = new URL(target, 'https://admin.invalid')
    if (url.origin !== 'https://admin.invalid') return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
