/**
 * Тонкая типизированная обёртка над официальным Telegram WebApp API
 * (https://core.telegram.org/bots/webapps). Скрипт подключён в index.html.
 *
 * Безопасность: `initData` (сырая строка) отправляется на сервер и проверяется там по HMAC.
 * `initDataUnsafe` — только для отображения, никаких решений на его основе.
 */
import { useEffect, useRef } from 'react'

type BottomButton = {
  setParams(p: {
    text?: string
    color?: string
    text_color?: string
    is_active?: boolean
    is_visible?: boolean
  }): void
  onClick(cb: () => void): void
  offClick(cb: () => void): void
  showProgress(leaveActive?: boolean): void
  hideProgress(): void
}

type WebApp = {
  initData: string
  initDataUnsafe: { user?: { id: number; first_name: string; language_code?: string } }
  colorScheme: 'light' | 'dark'
  platform: string
  version: string
  ready(): void
  expand(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  enableClosingConfirmation(): void
  disableClosingConfirmation(): void
  MainButton: BottomButton
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void }
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
  }
  onEvent(event: 'themeChanged', cb: () => void): void
  offEvent(event: 'themeChanged', cb: () => void): void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp }
  }
}

export const BRAND = { primary: '#F0B323', onPrimary: '#1B1A17' } as const

export function getWebApp(): WebApp | null {
  return window.Telegram?.WebApp ?? null
}

/** Открыто ли приложение внутри Telegram (у скрипта есть подписанные initData). */
export function isInTelegram(): boolean {
  return Boolean(getWebApp()?.initData)
}

/** Сырая строка initData для сервера. Пустая вне Telegram. */
export function rawInitData(): string {
  return getWebApp()?.initData ?? ''
}

export function telegramLanguage(): string | undefined {
  return getWebApp()?.initDataUnsafe.user?.language_code
}

export function initTelegram(): void {
  const wa = getWebApp()
  if (!wa) return
  wa.ready()
  wa.expand()
}

export function haptic(kind: 'success' | 'error' | 'tap'): void {
  const h = getWebApp()?.HapticFeedback
  if (!h) return
  if (kind === 'tap') h.impactOccurred('light')
  else h.notificationOccurred(kind)
}

/**
 * Нативная кнопка Telegram внизу экрана — главное действие экрана.
 * Вне Telegram возвращает false, и экран показывает свою кнопку.
 */
export function useMainButton(opts: {
  text: string
  onClick: () => void
  enabled?: boolean
  loading?: boolean
  visible?: boolean
}): boolean {
  const wa = getWebApp()
  const native = Boolean(wa?.initData)
  const cbRef = useRef(opts.onClick)
  useEffect(() => {
    cbRef.current = opts.onClick
  })

  const { text, enabled = true, loading = false, visible = true } = opts
  useEffect(() => {
    if (!native || !wa) return
    const handler = () => cbRef.current()
    wa.MainButton.setParams({
      text,
      color: BRAND.primary,
      text_color: BRAND.onPrimary,
      is_active: enabled && !loading,
      is_visible: visible,
    })
    if (loading) wa.MainButton.showProgress(false)
    else wa.MainButton.hideProgress()
    wa.MainButton.onClick(handler)
    return () => {
      wa.MainButton.offClick(handler)
      wa.MainButton.setParams({ is_visible: false })
    }
  }, [native, wa, text, enabled, loading, visible])

  return native
}

/** Нативная кнопка «Назад» Telegram. */
export function useBackButton(onBack: (() => void) | null): void {
  useEffect(() => {
    const wa = getWebApp()
    if (!wa?.initData || !onBack) return
    wa.BackButton.show()
    wa.BackButton.onClick(onBack)
    return () => {
      wa.BackButton.offClick(onBack)
      wa.BackButton.hide()
    }
  }, [onBack])
}
