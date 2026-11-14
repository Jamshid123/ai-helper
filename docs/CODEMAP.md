# Карта кода

> Обновляется при каждом добавлении/перемещении модулей (см. скилл `token-economy`). Если расходится с кодом — исправить.

## Сейчас в репозитории

| Путь | Назначение |
|---|---|
| `CLAUDE.md` | Правила работы, таблица скиллов, процесс изменений |
| `CHANGELOG.md` | Журнал изменений |
| `.claude/skills/<name>/SKILL.md` | Скиллы: backend, frontend, mobile, testing, security, deploy, spec-check, token-economy, ux-review |
| `.claude/settings.json` | Запрет чтения секретов и сгенерированных артефактов |
| `docs/STATUS.md` | Текущее состояние и следующий шаг |
| `docs/PROJECT_CONTEXT.md` | Архитектура, стек, инварианты, решения, открытые вопросы |
| `docs/spec/tz.md` | ТЗ (эталон) |
| `docs/skills-sources.md` | Источники методик скиллов |
| `docs/plans/mobile-app.md` | План мобильного приложения (Expo) |
| `docs/research/market-and-risks.md` | Что перенять у похожих платформ, мошенничество и недовольство (Узбекистан), решения для заказчика |
| `docs/reviews/` | Отчёты UX-ревью (скилл `ux-review`) |
| `docs/plans/backend-mvp.md` | Утверждённый план backend и боевого режима (выполняет ночная задача) |
| `package.json`, `pnpm-workspace.yaml`, `.nvmrc` | Монорепо pnpm, Node 22; корневые `lint/typecheck/test/build` |
| `.github/workflows/ci.yml` | CI: gitleaks, `pnpm audit`, lint, typecheck, тесты (Chromium), build |
| `.github/workflows/server-inspect.yml` | Ручной осмотр сервера (только чтение) |
| `.github/workflows/server-bootstrap.yml` + `infra/server/bootstrap.sh` | Разовая настройка сервера: пользователь deploy, `/opt/auksion/.env`, nginx vhost + HTTPS |
| `.github/workflows/deploy.yml` | Выкладка: push в `main` (или вручную) → CI → образ → сервер → health check → откат при сбое → кнопка меню бота |
| `infra/docker-compose.prod.yml` | Сервисы на сервере: `postgres`, `redis` (без внешних портов), `api` 3400, `miniapp` 3401, `admin` 3402 (все на 127.0.0.1) |
| `infra/server/nginx-auksion.conf`, `nginx-auksion-admin.conf` | vhost-ы `auksion.expertly.uz` (→ 3401) и `auksion-admin.expertly.uz` (→ 3402) для nginx хоста |
| `infra/nginx/spa.conf` | nginx внутри образов SPA: статика + прокси `/api/` → контейнер `api` |
| `.github/workflows/demo-seed.yml` | Вручную: тестовые лоты на демо-стенде (`dist/scripts/seed-demo.js`) |
| `apps/api/src/modules/live/` | Поток событий лота (SSE): `live-events.service.ts` (outbox → подписчики), `live.controller.ts` |
| `apps/api/src/modules/staff/` | Сотрудники: вход (`staff-auth.*`), guard `@StaffOnly(...roles)` (cookie + CSRF + роли), TOTP (`totp.ts`), журнал аудита (`audit.service.ts`) |
| `apps/api/src/modules/admin/` | API админки: категории, товары, лоты (`admin-lots.service.ts` — правила лота, отмена с возвратом), участники, журнал аудита |
| `apps/api/src/modules/payments/refunds.service.ts` | Снятие допуска с возвратом 100% (выход, отмена допуска/лота) |
| `apps/api/src/common/crypto-box.ts`, `cookies.ts` | AES-256-GCM для секретов в БД; разбор/сборка cookie |
| `.github/workflows/admin-create.yml` | Вручную: создать администратора (пароль из секрета `ADMIN_INITIAL_PASSWORD`) |
| `apps/api/src/scripts/` | `demo-lots.ts` (тестовые лоты демо-стенда), `seed-demo.ts` (CLI) |
| `apps/miniapp/src/shared/api/` | `client.ts` (вход по initData, сессия, ApiError), `error-text.ts` (код ошибки → текст ru/uz) |
| `apps/miniapp/src/entities/lot/api.ts` | Хуки данных: API в Telegram / демо в браузере (`useLots`, `useLot`, `useAdmissions`, `useAdmit`, `useRoom`, `useAutoBid`) |
| `apps/admin` | Админка (shadcn-admin): вход + разделы «Категории», «Товары», «Лоты», «Участники», «Журнал» (`src/features/manage/`). Карта — `apps/admin/README.md` |
| `apps/miniapp` | Telegram Mini App покупателя (демо-стенд на тестовых данных; регистрация `routes/register.tsx`, заявка продавца `routes/seller.tsx`, демо-аккаунт `entities/account/`). Карта — `apps/miniapp/README.md` |
| `apps/api` | NestJS 11 + Fastify + Prisma 6: `src/config/env.ts` (zod, без фолбэков секретов), `src/bootstrap.ts` (префикс `/api/v1`, CORS, заголовки), `src/modules/health`, `prisma/schema.prisma` + `prisma/migrations/`; тесты `test/` на настоящих PostgreSQL/Redis (`test/factories.ts`) |
| `infra/Dockerfile.api` | Образ API (node:22-bookworm-slim, non-root, healthcheck) |
| `packages/shared` | Общие правила: `rules.ts` (шаг, 30%, сроки, мин. ставка), `money.ts` (сумы, bigint), `session-time.ts` (пятница по Ташкенту) |

## Плановая структура (появится при создании каркаса)

| Путь | Назначение |
|---|---|
| `apps/mobile` | Expo (не в MVP) |
| `infra/` | `Dockerfile.spa`, `nginx/spa.conf`, `docker-compose.prod.yml`, `server/` (есть); backup.sh (будет вместе с API) |
