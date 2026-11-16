#!/usr/bin/env bash
# Подготовка окружения для разработки: зависимости + PostgreSQL/Redis для тестов API.
# Подходит как setup-скрипт облачного окружения Codex (и для своей машины).
#   bash scripts/agent-setup.sh            # зависимости + БД
#   SKIP_DB=1 bash scripts/agent-setup.sh  # только зависимости
# Ничего не трогает за пределами этой машины и не читает секреты.
set -euo pipefail
cd "$(dirname "$0")/.."

corepack enable >/dev/null 2>&1 || npm i -g pnpm@10 >/dev/null
pnpm install --frozen-lockfile
pnpm --filter @auksion/shared build   # API и тесты импортируют собранный пакет shared

if [ "${SKIP_DB:-}" = "1" ]; then exit 0; fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose -f infra/docker-compose.dev.yml up -d --wait
  echo "БД готовы (Docker): значения по умолчанию в тестах подходят, TEST_* задавать не нужно."
elif command -v apt-get >/dev/null 2>&1 && [ "$(id -u)" = 0 ]; then
  # Контейнер без Docker (например, облачный Codex): ставим Postgres и Redis пакетами.
  command -v pg_ctlcluster >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq postgresql redis-server >/dev/null; }
  ver=$(ls /usr/lib/postgresql | sort -n | tail -1)
  [ -d "/etc/postgresql/$ver/main" ] || pg_createcluster "$ver" main >/dev/null
  pg_ctlcluster "$ver" main start 2>/dev/null || true
  su postgres -c "psql -qc \"ALTER USER postgres PASSWORD 'postgres'\""
  su postgres -c "psql -lqt | cut -d'|' -f1 | grep -qw auksion_test || createdb auksion_test"
  redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes >/dev/null
  echo "БД готовы (пакеты). Для тестов API задайте:"
  echo "  export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/auksion_test"
  echo "  export TEST_REDIS_URL=redis://127.0.0.1:6379"
else
  echo "Нет Docker и apt: поднимите PostgreSQL 16 и Redis 7 сами и задайте TEST_DATABASE_URL / TEST_REDIS_URL." >&2
fi
