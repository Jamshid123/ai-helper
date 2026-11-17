#!/usr/bin/env bash
# Домены auksiongo.uz и два стенда (решение 17.11.2026). Запускается от root через workflow «Server domains».
# Идемпотентно. Что делает — и только это:
#   1) каталог прода /opt/auksion-prod и его .env (свой пароль Postgres; токен бота — из .env dev);
#   2) страница «Скоро запуск» /var/www/auksiongo-soon;
#   3) сертификаты Let's Encrypt (webroot) для dev.auksiongo.uz, dev-admin.auksiongo.uz, auksiongo.uz + www, admin.auksiongo.uz;
#   4) свои vhost-ы nginx (файлы auksiongo-*): dev → 127.0.0.1:3401/3402; прод → «Скоро запуск» (PROD_MODE=soon)
#      или 127.0.0.1:3404/3405 (PROD_MODE=app); www → auksiongo.uz;
#   5) при REDIRECT_OLD=true — старые auksion.expertly.uz / auksion-admin.expertly.uz → dev.auksiongo.uz / dev-admin.
# Не трогает: другие проекты, их vhost-ы и контейнеры, SSH, firewall. Перед заменой своих файлов делает копию;
# если nginx -t не прошёл — возвращает копии и выходит с ошибкой.
set -euo pipefail

PROD_MODE="${PROD_MODE:-soon}"
REDIRECT_OLD="${REDIRECT_OLD:-false}"
SRC=/tmp/auksion-domains
WEBROOT=/var/www/letsencrypt
SOON=/var/www/auksiongo-soon
AVAIL=/etc/nginx/sites-available
ENABLED=/etc/nginx/sites-enabled
DEV_DIR=/opt/auksion
PROD_DIR=/opt/auksion-prod

case "$PROD_MODE" in soon|app) ;; *) echo "PROD_MODE: soon или app" >&2; exit 1 ;; esac
log() { echo "==> $*"; }

points_here() {
  local ip
  ip=$(getent ahostsv4 "$1" | awk 'NR==1{print $1}')
  [ -n "$ip" ] && grep -qw "$ip" <<<"$(hostname -I)"
}

log "1/5 каталог прода"
install -d -m 750 -o deploy -g deploy "$PROD_DIR"
if [ ! -f "$PROD_DIR/.env" ]; then
  umask 077
  {
    echo "# Секреты AuksionGO (прод). Не коммитить, не копировать в чаты."
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    grep '^TELEGRAM_BOT_TOKEN=' "$DEV_DIR/.env" || true
  } > "$PROD_DIR/.env"
  echo "   .env прода создан (пароль Postgres сгенерирован на сервере)"
else
  echo "   .env прода уже есть — не трогаю"
fi
chown deploy:deploy "$PROD_DIR/.env"; chmod 600 "$PROD_DIR/.env"

log "2/5 страница «Скоро запуск»"
install -d -m 755 "$SOON" "$WEBROOT"
install -m 644 "$SRC/soon/index.html" "$SOON/index.html"

ssl_lines() {
  local name="$1"
  echo "    ssl_certificate /etc/letsencrypt/live/${name}/fullchain.pem;"
  echo "    ssl_certificate_key /etc/letsencrypt/live/${name}/privkey.pem;"
  [ -f /etc/letsencrypt/options-ssl-nginx.conf ] && echo "    include /etc/letsencrypt/options-ssl-nginx.conf;"
  [ -f /etc/letsencrypt/ssl-dhparams.pem ] && echo "    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  return 0
}

# HTTP-часть: ACME-проверка + переадресация на HTTPS
http_block() {
  cat <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $1;
    server_tokens off;
    location /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF
}

proxy_body() {
  cat <<EOF
    location / {
        proxy_pass http://127.0.0.1:$1;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
EOF
}

soon_body() {
  cat <<EOF
    root ${SOON};
    add_header Cache-Control "no-cache" always;
    add_header X-Content-Type-Options nosniff always;
    location / { try_files /index.html =404; }
EOF
}

# 443: server_name, имя сертификата, размер тела, содержимое
https_block() {
  echo "server {"
  echo "    listen 443 ssl;"
  echo "    listen [::]:443 ssl;"
  echo "    server_name $1;"
  echo "    server_tokens off;"
  echo "    client_max_body_size $3;"
  ssl_lines "$2"
  echo "$4"
  echo "}"
}

BACKUPS=()
put_vhost() { # имя файла, содержимое
  local f="$AVAIL/$1"
  if [ -f "$f" ]; then cp -p "$f" "$f.bak"; BACKUPS+=("$f"); else BACKUPS+=("$f:new"); fi
  printf '%s\n' "$2" > "$f"
  ln -sf "$f" "$ENABLED/$1"
}

restore() {
  echo "nginx -t не прошёл — возвращаю прежние файлы" >&2
  for b in "${BACKUPS[@]}"; do
    case "$b" in
      *:new) f="${b%:new}"; rm -f "$f" "$ENABLED/$(basename "$f")" ;;
      *) mv -f "$b.bak" "$b" ;;
    esac
  done
  nginx -t && systemctl reload nginx || true
  exit 1
}

apply() { nginx -t || restore; systemctl reload nginx; }

log "3/5 сертификаты"
command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y -qq certbot; }
declare -A CERT_OK=()
issue() { # имя сертификата, домены...
  local name="$1"; shift
  local d args=()
  for d in "$@"; do
    if ! points_here "$d"; then
      echo "   ${d}: DNS ещё не указывает на этот сервер — пропускаю ${name} (запустите позже)" >&2
      return 0
    fi
    args+=(-d "$d")
  done
  # временный HTTP-vhost для проверки (если своего ещё нет)
  if [ ! -f "$AVAIL/auksiongo-${name}.conf" ]; then
    put_vhost "auksiongo-${name}.conf" "$(http_block "$*")"
    apply
  fi
  if [ ! -d "/etc/letsencrypt/live/${name}" ]; then
    certbot certonly --webroot -w "$WEBROOT" --cert-name "$name" "${args[@]}" \
      --non-interactive --agree-tos --register-unsafely-without-email
  else
    echo "   сертификат ${name} уже есть"
  fi
  CERT_OK[$name]=1
}
issue dev.auksiongo.uz dev.auksiongo.uz
issue dev-admin.auksiongo.uz dev-admin.auksiongo.uz
issue auksiongo.uz auksiongo.uz www.auksiongo.uz
issue admin.auksiongo.uz admin.auksiongo.uz

log "4/5 vhost-ы (прод: ${PROD_MODE})"
vhost() { # имя сертификата, server_name, размер тела, содержимое 443
  [ -n "${CERT_OK[$1]:-}" ] || return 0
  put_vhost "auksiongo-$1.conf" "$(http_block "$2")
$(https_block "$2" "$1" "$3" "$4")"
}
vhost dev.auksiongo.uz dev.auksiongo.uz 10m "$(proxy_body 3401)"
vhost dev-admin.auksiongo.uz dev-admin.auksiongo.uz 1m "$(proxy_body 3402)"
if [ "$PROD_MODE" = app ]; then
  SITE_BODY="$(proxy_body 3404)"; ADMIN_BODY="$(proxy_body 3405)"
else
  SITE_BODY="$(soon_body)"; ADMIN_BODY="$(soon_body)"
fi
if [ -n "${CERT_OK[auksiongo.uz]:-}" ]; then
  put_vhost "auksiongo-auksiongo.uz.conf" "$(http_block "auksiongo.uz www.auksiongo.uz")
$(https_block "www.auksiongo.uz" "auksiongo.uz" 1m '    return 301 https://auksiongo.uz$request_uri;')
$(https_block "auksiongo.uz" "auksiongo.uz" 10m "$SITE_BODY")"
fi
vhost admin.auksiongo.uz admin.auksiongo.uz 1m "$ADMIN_BODY"
apply

log "5/5 старые адреса"
if [ "$REDIRECT_OLD" = true ]; then
  [ -n "${CERT_OK[dev.auksiongo.uz]:-}" ] && [ -n "${CERT_OK[dev-admin.auksiongo.uz]:-}" ] \
    || { echo "Сначала нужны сертификаты dev.auksiongo.uz и dev-admin.auksiongo.uz" >&2; exit 1; }
  for pair in "auksion.expertly.uz:dev.auksiongo.uz" "auksion-admin.expertly.uz:dev-admin.auksiongo.uz"; do
    old="${pair%%:*}"; new="${pair##*:}"
    [ -d "/etc/letsencrypt/live/${old}" ] || { echo "   нет сертификата ${old} — пропускаю"; continue; }
    put_vhost "$old" "$(http_block "$old")
$(https_block "$old" "$old" 1m "    return 301 https://${new}\$request_uri;")"
  done
  apply
else
  echo "   не трогаю (REDIRECT_OLD=false)"
fi

log "Готово."
