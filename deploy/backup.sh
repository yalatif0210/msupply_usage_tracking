#!/usr/bin/env bash
# Sauvegarde manuelle immédiate de la base (en plus du service `backup`
# automatique du compose). Produit un dump `custom` compressé dans ./backups/.
#
#   ./deploy/backup.sh
#
# Restauration : ./deploy/restore.sh backups/dqa-AAAAMMJJ-HHMMSS.dump
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./deploy/.env.prod; set +a

mkdir -p backups
ts=$(date +%Y%m%d-%H%M%S)
out="backups/dqa-$ts.dump"

docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --format=custom > "$out"

echo "OK  ->  $out  ($(du -h "$out" | cut -f1))"
