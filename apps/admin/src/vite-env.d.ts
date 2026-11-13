/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый URL API. По умолчанию `/api/v1` (тот же домен через reverse proxy). */
  readonly VITE_API_URL?: string
  /** Только для `vite dev`: вход без backend. В production игнорируется. */
  readonly VITE_DEMO_AUTH?: string
  /** Роли демо-пользователя через запятую, например `EXPERT,FULFILLMENT`. */
  readonly VITE_DEMO_ROLES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
