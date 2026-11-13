---
name: deploy
description: Use when working on Dockerfiles, docker-compose, Caddy/reverse proxy, GitHub Actions CI/CD, server setup, database provisioning, backups, or a production release/rollback of aukcion.expertly.us.
---

# Deploy & CI/CD

Цель: просто и надёжно. Один VPS (Европа), Docker Compose, GitHub Actions. Без Kubernetes.

## Топология

```
Internet ─▶ reverse proxy (TLS) ─┬─▶ miniapp (static, nginx-unprivileged)   aukcion.expertly.us
                                 ├─▶ api (NestJS, :3000)                     aukcion.expertly.us/api, /ws
                                 └─▶ admin (static)                          admin.aukcion.expertly.us (уточнить)
api ─▶ PostgreSQL (уже установлен на сервере, вне compose)
api ─▶ Redis (контейнер в compose, только внутренняя сеть)
worker (тот же образ api, команда worker) ─▶ BullMQ задачи
```

- Reverse proxy: если на сервере уже есть nginx/Caddy для `expertly.us` — добавляем в него виртуальный хост; иначе Caddy в compose (авто-TLS). Выяснить при получении доступа.
- DNS: A-запись `aukcion.expertly.us` (и админки) → IP сервера.

## Существующий PostgreSQL на сервере

- Отдельная БД `auksion` и две роли:
  - `auksion_migrator` — владелец схемы, используется только шагом миграций при деплое;
  - `auksion_app` — `SELECT/INSERT/UPDATE/DELETE` на таблицы, без DDL; на `audit_log` — только `INSERT, SELECT`.
- Доступ из контейнеров: Postgres слушает `localhost` + docker bridge (`172.17.0.1`), `pg_hba.conf` пускает только подсеть docker и только эти роли по `scram-sha-256`. Порт 5432 закрыт firewall-ом снаружи.
- В compose: `extra_hosts: ["host.docker.internal:host-gateway"]`, `DATABASE_URL=postgresql://auksion_app:...@host.docker.internal:5432/auksion`.

## Файлы

```
infra/
  docker-compose.prod.yml   # api, worker, miniapp, admin, redis (+ caddy при необходимости)
  Caddyfile                 # если используем Caddy
  deploy.sh                 # выполняется на сервере: pull → migrate → up → healthcheck → rollback
  backup.sh                 # pg_dump | age-шифрование | выгрузка вне сервера
apps/*/Dockerfile           # multi-stage, non-root, healthcheck
.github/workflows/ci.yml    # PR и пуши в ветки: lint, typecheck, test, build, gitleaks, audit
.github/workflows/deploy.yml# push в main: CI → build & push в GHCR → SSH deploy
```

## Dockerfile — правила

- Multi-stage: `deps` (pnpm fetch, frozen lockfile) → `build` → `runtime` на `node:22-alpine` / `nginxinc/nginx-unprivileged`.
- В runtime только prod-зависимости и собранный код, `USER node`, `HEALTHCHECK`.
- Базовые образы закреплены по версии (по digest — для прод-образов).
- Никаких секретов в `ARG`/`ENV` при сборке. `VITE_*` — только публичные значения.

## CI (`ci.yml`)

На каждый PR и пуш в любую ветку:
1. `pnpm install --frozen-lockfile`
2. `pnpm lint && pnpm typecheck`
3. `pnpm test` (Testcontainers поднимает Postgres/Redis в раннере)
4. `pnpm build`
5. gitleaks, `pnpm audit --prod --audit-level=high`

## CD (`deploy.yml`) — push в `main`

```yaml
on: { push: { branches: [main] } }
permissions: { contents: read, packages: write }
concurrency: { group: deploy-prod, cancel-in-progress: false }
jobs:
  ci:      { uses: ./.github/workflows/ci.yml }
  build:   # needs: ci — собрать и запушить образы ghcr.io/<owner>/auksion-{api,miniapp,admin}:<sha>
  deploy:  # needs: build; environment: production
    # ssh deploy@server "cd /opt/auksion && ./deploy.sh <sha>"
```

- Сторонние actions — по SHA. `environment: production` хранит `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS` (fingerprint сервера — без `StrictHostKeyChecking=no`).
- Сервер тянет образы из GHCR read-only токеном (`read:packages`).
- Секреты приложения живут **только на сервере** в `/opt/auksion/.env`, а не в GitHub.

## `deploy.sh` на сервере

1. `docker compose pull` образов с тегом `<sha>`.
2. Миграции: одноразовый контейнер api c `DATABASE_URL` мигратора → `prisma migrate deploy`. Ошибка → стоп, прод не тронут.
3. `docker compose up -d` с новым тегом.
4. Healthcheck `GET /api/v1/health` (БД + Redis) до 60 с.
5. Не прошёл → откат на предыдущий тег (хранится в `.last_successful_tag`) и exit 1.
6. Успех → записать тег, `docker image prune` старых.

Миграции пишутся обратно-совместимыми (expand → contract), чтобы откат образа не ломал БД.

## Сервер — базовая настройка (один раз)

- Пользователь `deploy` в группе `docker`, вход по SSH-ключу, `PasswordAuthentication no`, `PermitRootLogin no`.
- `ufw`: allow 22, 80, 443; всё остальное deny. `fail2ban` для SSH. `unattended-upgrades`.
- Docker: логи с ротацией (`max-size`), compose-сеть для redis без публикации портов.
- Бэкапы: cron ежедневно `backup.sh`, хранение 14 дней, ежемесячная проверка восстановления в отдельную БД.

## Релиз

- Пуш в `main` только после «да» пользователя (см. `CLAUDE.md`). Перед этим — зелёный CI на ветке и запись в `CHANGELOG.md`.
- После деплоя: проверить healthcheck и открыть Mini App, сообщить пользователю результат с фактами (тег, статус health).
- Откат: `./deploy.sh <previous_sha>`.
