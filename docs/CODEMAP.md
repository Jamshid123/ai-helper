# Карта кода

> Обновляется при каждом добавлении/перемещении модулей (см. скилл `token-economy`). Если расходится с кодом — исправить.

## Сейчас в репозитории

| Путь | Назначение |
|---|---|
| `AGENTS.md` | **Единые правила** для людей и агентов (Codex читает напрямую): таблица скиллов, процесс `main` + PR |
| `CLAUDE.md` | Подключает `AGENTS.md` (`@AGENTS.md`) + заметки только для Claude Code |
| `README.md` | Что это, состав, быстрый старт, команды проверок |
| `CONTRIBUTING.md` | Ветки, PR, конфликты (миграции, lock-файл), подключение Codex |
| `CHANGELOG.md` | Журнал изменений (`merge=union` в `.gitattributes`) |
| `.claude/skills/<name>/SKILL.md` | Скиллы: backend, frontend, mobile, testing, security, deploy, spec-check, token-economy, ux-review, product, risk-review, idea-review |
| `.agents/skills/<name>` | Ссылки на `.claude/skills/<name>` — те же скиллы для Codex |
| `docs/reviews/ideas/` | Цепочка `idea-review`: бриф, четыре независимых ревью, сводка и решение владельца по каждой идее |
| `.claude/settings.json` | Запрет чтения секретов и сгенерированных артефактов (Claude Code) |
| `scripts/agent-setup.sh` | Зависимости + локальные PostgreSQL/Redis (Docker или пакеты); setup-скрипт облачного Codex |
| `scripts/check-agent-skills.sh` | Проверка в CI: у каждого скилла есть ссылка для Codex, `CLAUDE.md` подключает `AGENTS.md` |
| `infra/docker-compose.dev.yml` | Локальные PostgreSQL :55432 (+ база `auksion_test`) и Redis :56379 |
| `.github/pull_request_template.md` | Шаблон PR с чек-листом из `AGENTS.md` |
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
| `apps/api/src/modules/staff/` | Сотрудники: вход по телефону (`staff-auth.*`), guard `@StaffOnly('<модуль>' | 'owner')` (cookie + CSRF + права роли), модули и уровни (`permissions.ts`), журнал аудита (`audit.service.ts`) |
| `apps/api/src/modules/admin/` | API админки: категории, товары, лоты (`admin-lots.service.ts` — правила лота, отмена с возвратом), участники, журнал аудита |
| `apps/api/src/scripts/seed-catalog.ts`, `demo-catalog*.ts`, `apps/api/demo-media/` | Наполнение демо-стенда: категории, товары с фото, торги (workflow «Demo catalog»); фото и их авторы — `demo-media/CREDITS.md` |
| `apps/api/src/modules/media/` | Фото товаров на диске (`MEDIA_DIR`, том Docker `media`): `media.service.ts` (сохранение, тип по байтам), `GET /api/v1/media/:file` (публично, кэш на год). Загрузка — `POST /admin/products/:id/photos` (тело — файл) |
| `apps/admin/src/features/manage/product-photos.tsx` | Блок фото в карточке товара; сжатие в браузере — `src/lib/image.ts` |
| `apps/miniapp/src/shared/ui/photo-carousel.tsx` | Карусель фото лота (свайп, на весь экран) |
| `apps/api/src/modules/payments/refunds.service.ts` | Снятие допуска с возвратом 100% (выход, отмена допуска/лота) |
| `apps/api/src/modules/fulfillment/buyout.service.ts` | Выкуп: оплата 10% и остатка, просрочки (sweep: 7 дней / решение по 10%), повторные торги (черновик + перенос допуска), выдача по коду, решение финансов |
| `apps/api/src/modules/fulfillment/admin-fulfillment.controller.ts` | `/admin/fulfillment` (список, остаток на месте, выдача по коду), `/admin/finance/buyouts` (решение по 10%) |
| `apps/api/src/common/pickup-code.ts` | Код выдачи: 6 цифр из секрета и id обязательства, в БД — только хэш |
| `apps/miniapp/src/entities/purchase/api.ts`, `features/purchase-card.tsx`, `features/win-banner.tsx` | Сайт: мои покупки, карточка победителя (10%, таймер, код, остаток), баннер «оплатите 10%» |
| `apps/admin/src/features/manage/fulfillment-page.tsx` | Админка: раздел «Выдача» (остаток на месте, выдача по коду, решение по 10%) |
| `apps/api/src/common/crypto-box.ts`, `cookies.ts` | AES-256-GCM для секретов в БД; разбор/сборка cookie |
| `apps/api/src/common/rate-limit.ts` | Ограничение частоты запросов: `@RateLimit(LIMITS.x)` на эндпоинте, глобальный перехватчик, окно в Redis |
| `.github/workflows/admin-create.yml` | Вручную: создать администратора по телефону (пароль из секрета `ADMIN_INITIAL_PASSWORD`) |
| `.github/workflows/staff-set-phone.yml` | Вручную: перевести учётку со старого email-логина на телефон |
| `apps/api/src/scripts/` | `demo-lots.ts` (тестовые лоты демо-стенда), `seed-demo.ts` (CLI) |
| `apps/miniapp/src/shared/api/` | `client.ts` (cookie-сессия + CSRF, ApiError), `error-text.ts` (код ошибки → текст ru/uz) |
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
