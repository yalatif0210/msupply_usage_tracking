#!/usr/bin/env bash
# Restauration d'un dump `custom` dans la base de production.
#
#   ./deploy/restore.sh backups/dqa-AAAAMMJJ-HHMMSS.dump
#
# ATTENTION : écrase les données actuelles. Arrête l'API le temps de la
# restauration pour éviter les écritures concurrentes.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./deploy/.env.prod; set +a

dump="${1:?usage: ./deploy/restore.sh <fichier.dump>}"
[ -f "$dump" ] || { echo "introuvable : $dump"; exit 1; }

read -rp "Restaurer '$dump' et ECRASER la base '$POSTGRES_DB' ? [oui/non] " ok
[ "$ok" = "oui" ] || { echo "annulé"; exit 1; }

dc() { docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml "$@"; }

echo "-> arrêt de l'API"
dc stop api

echo "-> restauration (--clean --if-exists : recrée les objets)"
dc exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists --no-owner < "$dump"

echo "-> redémarrage de l'API (rejoue les migrations si besoin)"
dc up -d api

echo "OK"
