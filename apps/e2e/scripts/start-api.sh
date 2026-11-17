#!/usr/bin/env bash
# API для сквозных тестов: чистая БД *_e2e → миграции → тестовые данные → сервер (имитация оплаты и SMS).
set -euo pipefail
cd "$(dirname "$0")/.."
E2E_DATABASE_URL="${E2E_DATABASE_URL:-postgresql://postgres@127.0.0.1:55432/auksion_e2e}"
E2E_REDIS_URL="${E2E_REDIS_URL:-redis://127.0.0.1:56379/1}"
db_name="${E2E_DATABASE_URL##*/}"; db_name="${db_name%%\?*}"
case "$db_name" in *_e2e) ;; *) echo "Отказ: БД для e2e должна называться *_e2e (сейчас $db_name)" >&2; exit 1 ;; esac
API_DIR=../api
[ -f "$API_DIR/dist/main.js" ] || { echo "Нет apps/api/dist — сначала pnpm --filter @auksion/api build" >&2; exit 1; }

export DATABASE_URL="$E2E_DATABASE_URL"
( cd "$API_DIR"
  # БД может ещё не существовать — создаём; схему пересоздаём с нуля
  pnpm exec prisma db execute --stdin --url "${E2E_DATABASE_URL%/*}/postgres" <<<"CREATE DATABASE \"$db_name\"" >/dev/null 2>&1 || true
  pnpm exec prisma db execute --stdin --schema prisma/schema.prisma <<<'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' >/dev/null
  pnpm exec prisma migrate deploy >/dev/null )
node scripts/seed.cjs

MEDIA_DIR="$(mktemp -d)"
export NODE_ENV=development PORT="${API_PORT:-3010}" REDIS_URL="$E2E_REDIS_URL" CORS_ORIGINS="${SITE_ORIGIN:-http://localhost:5180}" \
  TELEGRAM_BOT_TOKEN='123456:E2E-TOKEN-not-real-xxxxxxxx' JWT_SECRET="$(openssl rand -hex 32)" DATA_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  PAYMENTS_MODE=fake SMS_MODE=fake DEMO_STAND=true RATE_LIMIT_ENABLED=false MEDIA_DIR LOG_LEVEL=warn
exec node "$API_DIR/dist/main.js"
