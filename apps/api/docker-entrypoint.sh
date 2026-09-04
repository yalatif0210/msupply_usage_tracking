#!/bin/sh
# Applique les migrations puis démarre l'API. `migrate up` est idempotent
# (registre `public.schema_migrations`), donc rejouable à chaque démarrage.
set -e

echo "-> migrations"
node dist/db/migrate.js up

echo "-> demarrage de l'API"
exec node dist/main.js
