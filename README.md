# AuksionGO

Английские аукционы проверенной техники (Узбекистан). Покупатель заходит на сайт с телефона или компьютера,
входит по номеру телефона и SMS-коду, оплачивает допуск к лоту и предлагает цену в комнате торгов в реальном времени.
Продавец на пилоте — сама площадка. Демо-стенд: https://auksion.expertly.uz

Правила работы (для людей и AI-агентов) — [`AGENTS.md`](AGENTS.md). Процесс: ветки, PR, проверки — [`CONTRIBUTING.md`](CONTRIBUTING.md).
Где мы сейчас — [`docs/STATUS.md`](docs/STATUS.md), карта кода — [`docs/CODEMAP.md`](docs/CODEMAP.md),
архитектура и решения — [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md), ТЗ — [`docs/spec/tz.md`](docs/spec/tz.md).

## Состав

| Папка | Что это |
|---|---|
| `apps/api` | API: NestJS + Fastify + Prisma (PostgreSQL) + Redis |
| `apps/miniapp` | Сайт покупателя (React + Vite; папка названа исторически — раньше был Telegram Mini App) |
| `apps/admin` | Панель сотрудников (React + Vite, shadcn-admin) |
| `packages/shared` | Общие правила торгов, деньги, расписание |
| `infra/` | Dockerfile, compose для сервера и для локальной разработки, nginx |
| `.github/workflows/` | CI (каждый push и PR) и выкладка (мерж в `main`) |

## Быстрый старт

Нужны Node 22 (`.nvmrc`), pnpm 10 (`corepack enable`) и Docker (для локальных PostgreSQL и Redis).

```bash
bash scripts/agent-setup.sh          # зависимости, сборка shared, PostgreSQL :55432 и Redis :56379
cp apps/api/.env.example apps/api/.env
cp apps/miniapp/.env.example apps/miniapp/.env.local    # VITE_DEMO_DATA=false — работать с локальным API
cp apps/admin/.env.example apps/admin/.env.local
pnpm --filter @auksion/api db:migrate
```

В `apps/api/.env` впишите `DATA_ENCRYPTION_KEY` (`openssl rand -hex 32`) и `JWT_SECRET` (`openssl rand -base64 48`) — только локальные значения, в git они не попадают.

```bash
pnpm --filter @auksion/api dev        # http://localhost:3000/api/v1/health
pnpm --filter @auksion/miniapp dev    # http://localhost:5173 (запросы /api проксируются на :3000)
pnpm --filter @auksion/admin dev      # следующий свободный порт, обычно http://localhost:5174
```

С `SMS_MODE=fake` (по умолчанию в `.env.example`) код входа показывается прямо на экране — SMS не отправляются.
Владелец для локальной админки (пароль — из stdin, не в аргументах и не в истории):
`read -rs PW && printf '%s' "$PW" | pnpm --filter @auksion/api exec tsx src/scripts/create-admin.ts --phone +998901234567 --first Имя`.

## Проверки (то же самое запускает CI)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
scripts/check-agent-skills.sh         # скиллы общие для Claude Code и Codex
```

Тесты API идут на настоящих PostgreSQL и Redis (по умолчанию `127.0.0.1:55432` и `:56379`; другие адреса — через
`TEST_DATABASE_URL` / `TEST_REDIS_URL`). Схема пересоздаётся только в базе с суффиксом `_test`.
Тесты админки идут в браузере: один раз `pnpm --filter @auksion/admin exec playwright install chromium`.
