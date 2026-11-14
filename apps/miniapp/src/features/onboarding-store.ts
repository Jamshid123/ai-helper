import { useSyncExternalStore } from 'react'

/** Состояние онбординга: показывается один раз на устройстве (localStorage), повторно — из профиля. */
/** Версия онбординга: увеличить — и онбординг снова увидят все (v2 — сброс 14.11.2026 по просьбе заказчика). */
const VERSION = 2
const DONE_KEY = `auksion.onboarding.v${VERSION}`

function readDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    return false
  }
}

let open = !readDone()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Показан ли сейчас онбординг. */
export function useOnboardingOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => open
  )
}

/** Открыть повторно (из профиля). */
export function openOnboarding(): void {
  open = true
  emit()
}

export function finishOnboarding(): void {
  open = false
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    // не критично: покажется ещё раз
  }
  emit()
}
