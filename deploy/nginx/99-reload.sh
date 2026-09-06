#!/bin/sh
# Lancé par l'entrypoint de l'image nginx (dossier /docker-entrypoint.d/),
# juste avant `exec nginx`. Recharge Nginx toutes les 6 h pour prendre en
# compte un certificat que le service `certbot` vient de renouveler.
# La boucle passe en tâche de fond et survit au démarrage du serveur.
( while :; do sleep 6h; nginx -s reload 2>/dev/null || true; done ) &
