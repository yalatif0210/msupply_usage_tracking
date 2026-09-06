#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  Émission INITIALE du certificat TLS Let's Encrypt.
#
#  À lancer UNE SEULE FOIS, sur le serveur, après :
#    1. cp deploy/.env.prod.example deploy/.env.prod   (puis renseigner)
#    2. un enregistrement DNS A/AAAA `DQA_DOMAIN` -> IP publique du serveur
#    3. ports 80 et 443 ouverts (pare-feu, groupe de sécurité)
#
#  Les renouvellements suivants sont automatiques : le service `certbot` du
#  compose tente `certbot renew` toutes les 12 h, et `web` recharge Nginx
#  toutes les 6 h. Détail : docs/manuel_deploiement.md §5.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f deploy/.env.prod ] || { echo "manque deploy/.env.prod (copier .env.prod.example)"; exit 1; }
set -a; . ./deploy/.env.prod; set +a
: "${DQA_DOMAIN:?renseigner DQA_DOMAIN dans deploy/.env.prod}"
: "${DQA_ACME_EMAIL:?renseigner DQA_ACME_EMAIL dans deploy/.env.prod}"

dc() { docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml "$@"; }

live="/etc/letsencrypt/live/$DQA_DOMAIN"
staging_arg=""
[ "${DQA_ACME_STAGING:-0}" != "0" ] && { staging_arg="--staging"; echo "!! mode STAGING : certificat non reconnu par les navigateurs"; }

echo "### 1/5  certificat provisoire auto-signé (pour que Nginx puisse démarrer)"
dc run --rm --entrypoint sh certbot -c "
  mkdir -p '$live' &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout '$live/privkey.pem' -out '$live/fullchain.pem' \
    -subj '/CN=$DQA_DOMAIN' &&
  cp '$live/fullchain.pem' '$live/chain.pem'
"

echo "### 2/5  démarrage de Nginx"
dc up -d web

echo "### 3/5  retrait du certificat provisoire"
dc run --rm --entrypoint sh certbot -c "
  rm -rf /etc/letsencrypt/live/$DQA_DOMAIN \
         /etc/letsencrypt/archive/$DQA_DOMAIN \
         /etc/letsencrypt/renewal/$DQA_DOMAIN.conf
"

echo "### 4/5  demande du certificat réel à Let's Encrypt"
dc run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  $staging_arg \
  -d "$DQA_DOMAIN" \
  --email "$DQA_ACME_EMAIL" \
  --agree-tos --no-eff-email --non-interactive

echo "### 5/5  rechargement de Nginx puis démarrage de la pile complète"
dc exec web nginx -s reload
dc up -d

echo
echo "OK  ->  https://$DQA_DOMAIN"
