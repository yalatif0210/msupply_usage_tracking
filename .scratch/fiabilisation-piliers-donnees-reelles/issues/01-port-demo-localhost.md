# 01: La démo n'écoute que sur le poste

**What to build:** la démo est publiée sur `127.0.0.1:8081` et non plus sur
toutes les interfaces du poste (`0.0.0.0:8081`), conformément aux règles
d'isolation des environnements locaux.

**Blocked by:** aucun (peut démarrer).

**Status:** done

- [x] `docker-compose.demo.yml` : `'127.0.0.1:8081:8080'`.
- [x] Vérifié : `netstat` montre `127.0.0.1:8081` seulement ; la démo répond.
- [x] `docs/guide_module_infra.md` à jour.
