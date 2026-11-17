---
name: deploy
description: Use when working on Dockerfiles, docker-compose, Caddy/reverse proxy, GitHub Actions CI/CD, server setup, database provisioning, backups, or a release/rollback of the dev (dev.auksiongo.uz) or prod (auksiongo.uz) stand.
---

# Deploy & CI/CD

Цель: просто и надёжно. Один VPS (Европа), Docker Compose, GitHub Actions. Без Kubernetes.

## Стенды (решение 17.11.2026)

| | dev | prod |
|---|---|---|
| Адрес | `dev.auksiongo.uz`, `dev-admin.auksiongo.uz` | `auksiongo.uz` (+ `www`), `admin.auksiongo.uz` |
| Сервер | `/opt/auksion`, проект `auksion`, `127.0.0.1:3400–3402` | `/opt/auksion-prod`, проект `auksion-prod`, `127.0.0.1:3403–3405` |
| Выкладка | мерж в `main` → «Deploy dev» | «Deploy prod» вручную, environment `production` (подтверждает владелец) |
| Режимы | `DEMO_STAND=true`, оплата и SMS — имитация | реальные; `PROD_PAYMENTS_MODE` / `PROD_SMS_MODE` — переменные репозитория |
| Образы | `auksion-*:<sha12>` | `auksion-*:prod-<sha12>` (свой бандл без демо-режима) |

Один `infra/docker-compose.prod.yml` на оба стенда: порты, `SITE_URL`, `CORS_ORIGINS` — из `.deploy.env`, который пишет workflow.
Домены, сертификаты (certbot webroot) и vhost-ы — `infra/server/domains.sh` через workflow «Server domains» (root).
До запуска прод-домен отдаёт «Скоро запуск» (`infra/server/soon/index.html`, `prod_mode=soon`). DNS — Cloudflare, режим DNS only.

## Топология (исходная схема, адреса — см. «Стенды»)

```
Internet ─▶ reverse proxy (TLS) ─┬─▶ miniapp (static, nginx-unprivileged)   auksion.expertly.uz
                                 ├─▶ api (NestJS, :3000)                     auksion.expertly.uz/api, /ws
                                 └─▶ admin (static)                          auksion-admin.expertly.uz
api ─▶ PostgreSQL (уже установлен на сервере, вне compose)
api ─▶ Redis (контейнер в compose, только внутренняя сеть)
worker (тот же образ api, команда worker) ─▶ BullMQ задачи
```

- На сервере уже работает другой проект (`karnaychi-api`). Ничего чужого не останавливать и не переконфигурировать; свои сервисы — отдельный compose-проект `auksion`, свои виртуальные хосты в существующем proxy.
- Reverse proxy: **nginx на хосте** + certbot (см. `docs/PROJECT_CONTEXT.md` §11). Добавляем `/etc/nginx/sites-available/auksion*.conf` → `nginx -t` → reload. Контейнеры слушают только `127.0.0.1:3400–3409`.
- PostgreSQL: **свой** контейнер `postgres` в `infra/docker-compose.prod.yml` (сеть `db`, `internal: true`, порт наружу не публикуется). `ai-helper-postgres` — чужой проект, не трогать.
- Файлы: `infra/server/bootstrap.sh` (разово, root), `.github/workflows/deploy.yml` (каждый push в `main`). Образы передаются `docker save | ssh docker load`, без registry.
- DNS: зона `expertly.uz` в **Vercel** → A-запись `auksion` (и админки) → IP сервера.

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

- В `main` попадает только PR после зелёного CI (`AGENTS.md`, п. 3–4); мерж в `main` = автоматическая выкладка на dev. Ручной «Deploy dev» — только с `main`. «Deploy prod» — только с «да» владельца.
- После деплоя: проверить статус workflow и healthcheck, открыть сайт, сообщить результат с фактами (номер выкладки, статус health).
- Откат: `./deploy.sh <previous_sha>`.
