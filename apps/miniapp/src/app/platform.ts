/**
 * Платформенные мелочи сайта (с 15.11.2026 вместо Telegram Mini App — решение заказчика).
 * Кнопки «главное действие» и «назад» рисует сам экран; эти хуки — совместимость со старыми вызовами.
 */

/** Лёгкая вибрация на телефонах, где браузер это умеет. */
export function haptic(kind: 'success' | 'error' | 'tap'): void {
  try {
    navigator.vibrate?.(kind === 'tap' ? 8 : kind === 'success' ? [12, 40, 12] : [30, 40, 30])
  } catch {
    // не поддерживается — не важно
  }
}

/** На сайте нативной кнопки нет: возвращает false, и экран показывает свою кнопку. */
export function useMainButton(opts: {
  text: string
  onClick: () => void
  enabled?: boolean
  loading?: boolean
  visible?: boolean
}): boolean {
  void opts
  return false
}

/** На сайте «назад» — кнопка браузера и ссылки на экранах. */
export function useBackButton(onBack: (() => void) | null): void {
  void onBack
}

/** Поддержка остаётся в Telegram (решение 15.11.2026). */
export const SUPPORT_URL = 'https://t.me/Shamsiddin_Shamsiddinov'

/** Открыть внешнюю ссылку в новой вкладке. */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener')
}
