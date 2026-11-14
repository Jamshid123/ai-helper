#!/usr/bin/env bash
# Разовая (идемпотентная) настройка сервера под AuksionGO. Запускается от root через
# workflow "Server bootstrap". Что делает — и только это:
#   1) пользователь deploy (вход только по ключу DEPLOY_PUBKEY, группа docker);
#   2) каталог /opt/auksion и .env с паролем Postgres (генерируется на сервере, chmod 600);
#   3) nginx vhost auksion.expertly.uz + сертификат Let's Encrypt (certbot --nginx);
#   4) то же для админки auksion-admin.expertly.uz (порт 127.0.0.1:3402).
# Не трогает: другие проекты, их vhost-ы и контейнеры, SSH-настройки, firewall.
set -euo pipefail

: "${DEPLOY_PUBKEY:?DEPLOY_PUBKEY is required}"
DOMAIN="auksion.expertly.uz"
ADMIN_DOMAIN="auksion-admin.expertly.uz"
APP_DIR="/opt/auksion"

log() { echo "==> $*"; }

case "$DEPLOY_PUBKEY" in
  ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*) ;;
  *) echo "DEPLOY_PUBKEY не похож на публичный SSH-ключ" >&2; exit 1 ;;
esac

log "1/4 пользователь deploy"
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
passwd -l deploy >/dev/null            # пароль отключён: только ключ
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
AUTH=/home/deploy/.ssh/authorized_keys
touch "$AUTH"
grep -qxF "$DEPLOY_PUBKEY" "$AUTH" || echo "$DEPLOY_PUBKEY" >> "$AUTH"
chown deploy:deploy "$AUTH"; chmod 600 "$AUTH"

log "2/4 каталог приложения и секреты"
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

# vhost + сертификат для домена (идемпотентно: существующий vhost не трогаем)
site() {
  local domain="$1" conf="$2" vhost="/etc/nginx/sites-available/$1"
  local server_ips dns_ip
  server_ips=$(hostname -I)
  dns_ip=$(getent ahostsv4 "$domain" | awk 'NR==1{print $1}')
  if [ -z "$dns_ip" ] || ! grep -qw "$dns_ip" <<<"$server_ips"; then
    echo "DNS ${domain} -> '${dns_ip:-нет записи}', а адреса сервера: ${server_ips}. Проверьте A-запись." >&2
    return 1
  fi
  if [ ! -f "$vhost" ]; then
    install -m 644 "/tmp/auksion-bootstrap/${conf}" "$vhost"
    ln -sf "$vhost" "/etc/nginx/sites-enabled/${domain}"
    if ! nginx -t; then
      echo "nginx -t не прошёл — откатываю наш vhost, остальные сайты не затронуты" >&2
      rm -f "/etc/nginx/sites-enabled/${domain}" "$vhost"
      return 1
    fi
    systemctl reload nginx
  else
    echo "   vhost ${domain} уже есть — не трогаю"
  fi
  command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx; }
  if [ ! -d "/etc/letsencrypt/live/${domain}" ]; then
    certbot --nginx -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email --redirect
  else
    echo "   сертификат ${domain} уже есть"
  fi
}

log "3/4 nginx + HTTPS для ${DOMAIN}"
site "$DOMAIN" nginx-auksion.conf

log "4/4 nginx + HTTPS для ${ADMIN_DOMAIN}"
site "$ADMIN_DOMAIN" nginx-auksion-admin.conf
nginx -t && systemctl reload nginx

log "Готово. Сервис ещё не запущен — его выкатывает workflow Deploy."
