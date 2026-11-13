#!/usr/bin/env bash
# Разовая (идемпотентная) настройка сервера под AuksionGO. Запускается от root через
# workflow "Server bootstrap". Что делает — и только это:
#   1) пользователь deploy (вход только по ключу DEPLOY_PUBKEY, группа docker);
#   2) каталог /opt/auksion и .env с паролем Postgres (генерируется на сервере, chmod 600);
#   3) nginx vhost auksion.expertly.uz + сертификат Let's Encrypt (certbot --nginx).
# Не трогает: другие проекты, их vhost-ы и контейнеры, SSH-настройки, firewall.
set -euo pipefail

: "${DEPLOY_PUBKEY:?DEPLOY_PUBKEY is required}"
DOMAIN="auksion.expertly.uz"
APP_DIR="/opt/auksion"
VHOST="/etc/nginx/sites-available/${DOMAIN}"

log() { echo "==> $*"; }

case "$DEPLOY_PUBKEY" in
  ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*) ;;
  *) echo "DEPLOY_PUBKEY не похож на публичный SSH-ключ" >&2; exit 1 ;;
esac

log "1/3 пользователь deploy"
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
passwd -l deploy >/dev/null            # пароль отключён: только ключ
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
AUTH=/home/deploy/.ssh/authorized_keys
touch "$AUTH"
grep -qxF "$DEPLOY_PUBKEY" "$AUTH" || echo "$DEPLOY_PUBKEY" >> "$AUTH"
chown deploy:deploy "$AUTH"; chmod 600 "$AUTH"

log "2/3 каталог приложения и секреты"
install -d -m 750 -o deploy -g deploy "$APP_DIR"
if [ ! -f "$APP_DIR/.env" ]; then
  umask 077
  {
    echo "# Секреты AuksionGO. Не коммитить, не копировать в чаты."
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
  } > "$APP_DIR/.env"
  echo "   .env создан (пароль Postgres сгенерирован на сервере)"
else
  echo "   .env уже есть — не трогаю"
fi
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ]; then
  sed -i '/^TELEGRAM_BOT_TOKEN=/d' "$APP_DIR/.env"
  echo "TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}" >> "$APP_DIR/.env"
fi
chown deploy:deploy "$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"

log "3/3 nginx + HTTPS для ${DOMAIN}"
SERVER_IPS=$(hostname -I)
DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')
if [ -z "$DNS_IP" ] || ! grep -qw "$DNS_IP" <<<"$SERVER_IPS"; then
  echo "DNS ${DOMAIN} -> '${DNS_IP:-нет записи}', а адреса сервера: ${SERVER_IPS}. Проверьте A-запись." >&2
  exit 1
fi
if [ ! -f "$VHOST" ]; then
  install -m 644 /tmp/auksion-bootstrap/nginx-auksion.conf "$VHOST"
  ln -sf "$VHOST" "/etc/nginx/sites-enabled/${DOMAIN}"
  if ! nginx -t; then
    echo "nginx -t не прошёл — откатываю наш vhost, остальные сайты не затронуты" >&2
    rm -f "/etc/nginx/sites-enabled/${DOMAIN}" "$VHOST"
    exit 1
  fi
  systemctl reload nginx
else
  echo "   vhost уже есть — не трогаю"
fi
command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx; }
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
else
  echo "   сертификат уже есть"
fi
nginx -t && systemctl reload nginx

log "Готово. Сервис ещё не запущен — его выкатывает workflow Deploy."
