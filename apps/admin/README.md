# @auksion/admin — панель сотрудников

Основа — шаблон [shadcn-admin](https://github.com/satnaing/shadcn-admin) (MIT, лицензия в `LICENSE.shadcn-admin`).
Удалены Clerk, демо-разделы, мок-данные и вход через соцсети; добавлены вход по паролю, права по ролям, разделы по ТЗ.

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
| Вход: телефон + пароль | `src/features/auth/` |
| Защита от open redirect | `src/lib/safe-redirect.ts` |
| Пятничная сессия по Ташкенту | `src/lib/session-time.ts` |

## Экраны и API

| Раздел | Где | API |
|---|---|---|
| Вход по телефону и паролю | `src/features/auth/` | `POST /admin/auth/login {login, password}` → `StaffUser` + cookie · `GET /admin/me` · `POST /admin/auth/logout` |
| Категории (ru/uz, вкл/выкл, порядок) | `src/features/manage/categories-page.tsx` | `GET/POST /admin/categories`, `PATCH /admin/categories/:id` |
| Товары (карточка, акт, IMEI шифруется) | `products-page.tsx` | `GET/POST /admin/products`, `PATCH /admin/products/:id` |
| Лоты (из товара, публикация, правка до открытия, отмена с возвратом) | `lots-page.tsx`, `lot-dialog.tsx` | `GET/POST /admin/lots`, `PATCH /admin/lots/:id`, `POST /admin/lots/:id/publish`, `POST /admin/lots/:id/cancel {reason}` |
| Участники (поиск, ограничение/снятие, отмена допуска) | `participants-page.tsx` | `GET /admin/participants?q=`, `GET /admin/participants/:id`, `POST …/restrictions {days, reason}`, `POST …/restrictions/:rid/lift {reason}`, `POST …/admissions/:lotId/cancel {reason}` |
| Журнал аудита | `audit-page.tsx` | `GET /admin/audit` |
| Сотрудники (только ADMIN) | `staff-page.tsx` | `GET/POST /admin/staff`, `PATCH /admin/staff/:id`, `POST /admin/staff/:id/password` |

Сессия — httpOnly-cookie; мутации отправляют `X-CSRF-Token` из cookie `csrf_token`. Ошибки — `{code, message}`; бизнес-отказы (400/409/422) показываются текстом сервера.
