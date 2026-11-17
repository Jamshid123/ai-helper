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
# Только для e2e: фиксированный секрет — тестовые данные считают по нему код выдачи. Не используется нигде, кроме этой БД.
export E2E_JWT_SECRET="e2e-only-not-a-real-secret-0000000000000000"
# Владелец админки для тестов (только БД *_e2e)
export E2E_STAFF_PHONE='+998935550001' E2E_STAFF_PASSWORD='e2e admin password 123'
( cd "$API_DIR"
  # БД может ещё не существовать — создаём; схему пересоздаём с нуля
  pnpm exec prisma db execute --stdin --url "${E2E_DATABASE_URL%/*}/postgres" <<<"CREATE DATABASE \"$db_name\"" >/dev/null 2>&1 || true
  pnpm exec prisma db execute --stdin --schema prisma/schema.prisma <<<'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' >/dev/null
  pnpm exec prisma migrate deploy >/dev/null )
JWT_SECRET="$E2E_JWT_SECRET" node scripts/seed.cjs

MEDIA_DIR="$(mktemp -d)"
export NODE_ENV=development PORT="${API_PORT:-3010}" REDIS_URL="$E2E_REDIS_URL" CORS_ORIGINS="${SITE_ORIGIN:-http://localhost:5180}" \
  TELEGRAM_BOT_TOKEN='123456:E2E-TOKEN-not-real-xxxxxxxx' JWT_SECRET="$E2E_JWT_SECRET" DATA_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  PAYMENTS_MODE=fake SMS_MODE=fake DEMO_STAND=true RATE_LIMIT_ENABLED=false MEDIA_DIR LOG_LEVEL=warn
# Владелец админки для тестов (пароль — через stdin, как в боевом скрипте)
( cd "$API_DIR" && printf '%s' "$E2E_STAFF_PASSWORD" | SCHEDULER_ENABLED=false node dist/scripts/create-admin.js --phone "$E2E_STAFF_PHONE" --first Админ --last Тестов >/dev/null )
exec node "$API_DIR/dist/main.js"
