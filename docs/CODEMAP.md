# Карта кода

> Обновляется при каждом добавлении/перемещении модулей (см. скилл `token-economy`). Если расходится с кодом — исправить.

## Сейчас в репозитории

| Путь | Назначение |
|---|---|
| `CLAUDE.md` | Правила работы, таблица скиллов, процесс изменений |
| `CHANGELOG.md` | Журнал изменений |
| `.claude/skills/<name>/SKILL.md` | Скиллы: backend, frontend, mobile, testing, security, deploy, spec-check, token-economy |
| `.claude/settings.json` | Запрет чтения секретов и сгенерированных артефактов |
| `docs/STATUS.md` | Текущее состояние и следующий шаг |
| `docs/PROJECT_CONTEXT.md` | Архитектура, стек, инварианты, решения, открытые вопросы |
| `docs/spec/tz.md` | ТЗ (эталон) |
| `docs/skills-sources.md` | Источники методик скиллов |
| `package.json`, `pnpm-workspace.yaml`, `.nvmrc` | Монорепо pnpm, Node 22; корневые `lint/typecheck/test/build` |
| `.github/workflows/ci.yml` | CI: gitleaks, `pnpm audit`, lint, typecheck, тесты (Chromium), build |
| `.github/workflows/server-inspect.yml` | Ручной осмотр сервера (только чтение) |
| `.github/workflows/server-bootstrap.yml` + `infra/server/bootstrap.sh` | Разовая настройка сервера: пользователь deploy, `/opt/auksion/.env`, nginx vhost + HTTPS |
| `.github/workflows/deploy.yml` | Выкладка: push в `main` (или вручную) → CI → образ → сервер → health check → откат при сбое → кнопка меню бота |
| `infra/docker-compose.prod.yml` | Сервисы на сервере: свой `postgres` (без внешнего порта), `miniapp` на `127.0.0.1:3401` |
| `infra/server/nginx-auksion.conf` | vhost `auksion.expertly.uz` для nginx хоста |
| `apps/admin` | Админка (shadcn-admin). Карта файлов — в `apps/admin/README.md` |
| `apps/miniapp` | Telegram Mini App покупателя (демо-стенд на тестовых данных). Карта — `apps/miniapp/README.md` |
| `packages/shared` | Общие правила: `rules.ts` (шаг, 30%, сроки, мин. ставка), `money.ts` (сумы, bigint), `session-time.ts` (пятница по Ташкенту) |

## Плановая структура (появится при создании каркаса)

| Путь | Назначение |
|---|---|
| `apps/api` | NestJS API + worker (BullMQ). Модули: auth, users, catalog, inspection, auctions, payments, fulfillment, antifraud, notifications, audit |
| `apps/mobile` | Expo (не в MVP) |
| `infra/` | `Dockerfile.spa`, `nginx/spa.conf`, `docker-compose.prod.yml`, `server/` (есть); backup.sh (будет вместе с API) |
