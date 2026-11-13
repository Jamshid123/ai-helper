# @auksion/admin — панель сотрудников

Основа — шаблон [shadcn-admin](https://github.com/satnaing/shadcn-admin) (MIT, лицензия в `LICENSE.shadcn-admin`).
Удалены Clerk, демо-разделы, мок-данные и вход через соцсети; добавлены вход с MFA, права по ролям, разделы по ТЗ.

## Запуск

```bash
pnpm install                      # из корня репозитория
cp apps/admin/.env.example apps/admin/.env.local
# без backend: VITE_DEMO_AUTH=true, роли — VITE_DEMO_ROLES=EXPERT,FULFILLMENT
pnpm --filter @auksion/admin dev  # http://localhost:5173, /api проксируется на :3000
```

Демо-вход работает только в `vite dev`; в production-сборке этот код вырезается.

## Проверки

```bash
pnpm --filter @auksion/admin lint
pnpm --filter @auksion/admin typecheck
PW_CHROMIUM_PATH=/path/to/chromium pnpm --filter @auksion/admin test   # браузерные тесты (Vitest + Playwright)
pnpm --filter @auksion/admin build
```

## Устройство

| Что | Где |
|---|---|
| Роли и доступ к разделам | `src/lib/rbac.ts` (+ тест) |
| Разделы, меню, описания по ТЗ | `src/config/sections.ts` |
| Guard раздела (→ 403) | `src/lib/require-section.ts`, используется в `src/routes/_authenticated/<раздел>/index.tsx` |
| Проверка сессии (→ /sign-in) | `src/routes/_authenticated/route.tsx` |
| HTTP-клиент: cookie-сессия, CSRF | `src/lib/api.ts` |
| Вход: пароль → TOTP | `src/features/auth/` |
| Защита от open redirect | `src/lib/safe-redirect.ts` |
| Пятничная сессия по Ташкенту | `src/lib/session-time.ts` |

## Ожидаемый API (backend ещё не написан)

| Метод | Путь | Ответ |
|---|---|---|
| POST | `/api/v1/admin/auth/login` `{email, password}` | `{challengeId}` · 401 / 423 / 429 |
| POST | `/api/v1/admin/auth/mfa` `{challengeId, code}` | `StaffUser` + httpOnly-cookie сессии и cookie `csrf_token` · 401 / 410 / 429 |
| GET | `/api/v1/admin/me` | `StaffUser {id, name, email, roles[]}` · 401 |
| POST | `/api/v1/admin/auth/logout` | 204 |

Мутации отправляют `X-CSRF-Token` из cookie `csrf_token`. Ошибки — `{code, message}`.
