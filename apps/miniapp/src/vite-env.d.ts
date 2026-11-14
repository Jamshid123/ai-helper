/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_DEMO_DATA?: string
  /** Тестовый запуск с API (сервер имитирует оплату) — показывает плашку. */
  readonly VITE_DEMO_STAND?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
