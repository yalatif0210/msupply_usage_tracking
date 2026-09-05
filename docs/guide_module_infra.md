# Guide — Infrastructure locale (Docker)

## Rôle

Deux usages, deux fichiers Compose :

| Fichier | Usage | Contenu |
|---|---|---|
| `docker-compose.yml` | **développement** : `npm run start:dev` sur l'hôte | `db` seule (port 5432) |
| `docker-compose.demo.yml` | **démo / recette** : toute la pile en conteneurs | `db` + `api` + `web` + `seed` |

Les tests d'intégration n'utilisent ni l'un ni l'autre : ils démarrent leur
propre PostgreSQL éphémère (testcontainers, `apps/api/test/helpers/db.ts`).

## Lancer la démo

```
docker compose -f docker-compose.demo.yml up --build
```

Puis <http://localhost:8080> — connexion `coordination` / `coordination-2026`
(ou `admin` / `admin-2026`, `lecteur` / `lecteur-2026`).

- Le front (Nginx) écoute sur `:8080` ; `3000` / `4200` sont laissés libres
  pour `elyon-erp`.
- L'API n'est pas exposée sur l'hôte : Nginx relaie `/api` vers le conteneur.
- La base de la démo est **isolée** (volume `demo_db`), aucun port publié —
  elle n'entre pas en conflit avec le `dqa-db-1` du dev.

Tout effacer :

```
docker compose -f docker-compose.demo.yml down -v
```

## Ce que fait chaque service

- **`db`** — `postgres:16-alpine`, healthcheck `pg_isready`.
- **`api`** — image `apps/api/Dockerfile` (build multi-étages, runtime
  `node:24-slim`). À chaque démarrage : `node dist/db/migrate.js up`
  (idempotent, registre `public.schema_migrations`) puis `node dist/main.js`.
  `NODE_ENV` est laissé vide : la démo est en HTTP, le cookie de session ne
  doit pas être `secure`.
- **`seed`** — `postgres:16-alpine` qui joue `db/demo/seed.sql` une fois l'API
  saine (donc les migrations passées). Purge le core, insère 8 sites de strates
  variées + la fin du cycle C2 (2026-05 à 2026-08) et le début du C3 (2026-09) +
  inventaires / mouvements sur 4 traceurs, un lot d'import par mois plus un
  cinquième lot « extraction du 5 septembre » à fenêtre de 45 jours qui
  chevauche août et septembre : il apporte les premiers jours de septembre ET
  les réquisitions d'août du CHU et du District, et le gel corrige alors le
  score d'août (encore ouvert) à la hausse sans redéclaration (ADR 0010).
  2026-08 et 2026-09 sont les mois en cours au regard de la date du jour, leur
  score est provisoire. `web` attend sa fin (`service_completed_successfully`) :
  au premier accès les écrans sont déjà peuplés. Rejouable :
  `docker compose -f docker-compose.demo.yml run --rm seed`.
- **`web`** — build Angular (`@angular/build:application` → `dist/browser/`)
  servi par `nginx:1.27-alpine` ; `apps/web/nginx.conf` : `try_files` pour le
  routing SPA, `proxy_pass` de `/api` vers `api:3000`, `client_max_body_size 32m`
  pour l'import de classeur.

## Le jeu de démonstration

`db/demo/seed.sql` illustre les écrans du chantier « données brutes des
piliers » :

| Écran | À regarder |
|---|---|
| Tableau de bord, `/synthese`, fiches site et produit | sélecteur « Mois affiché » : 2026-05 à 2026-09 ; repère « Mois en cours · score provisoire » sur 2026-08 et 2026-09 |
| Tableau de bord | courbe de progression nationale sur 5 points (34 → 46,6 → 66,4 → 60,1 → 49,3 ; les deux derniers provisoires) |
| Fiche site (`/sites/SITE-CHU`), plage « Tout » | « Progression (score composite) » 42,5 → 62,5 → 87,5 → 62,5 → 66,7 : août est passé de 51,7 (réquisitions manquantes) à 62,5 quand le lot du 5 septembre les a rapportées, sans redéclarer août |
| Fiche site 2026-09 | mois à 5 jours de données : score volatil, repère « Mois en cours », historique qui démarre au cycle C3 (bouton « Tout » pour voir les 5 mois) |
| Fiche site (`/sites/SITE-REIMP`) | avertissement « données du core modifiées depuis le gel » |
| Fiche site (`/sites/SITE-CSU`) | réquisition et inventaire manquants pour le mois |
| `/synthese` onglet « Rapports & inventaires » | strates CHU / CHR / HG / ESPC / CS / District ; « Non classé » pour l'Institut |
| `/admin/strates` | `Institut` sans correspondance |
| Fiche produit-mois | depuis un code produit du tableau P4·P5 de `SITE-CHU` (ARV : deux inventaires bornants, photos de stock) |

Pour tester l'import réel : se connecter en `coordination`, écran
**Imports**, déposer un classeur au format du canevas
(`docs/Canevas_Extraction_mSupply_DQA_v2.xlsx`).

## Production

Hors périmètre de ce dépôt à ce jour : pas de `docker-compose.prod.yml`, pas de
CI. La pile démo en est la base (mêmes images ; ajouter TLS, `NODE_ENV=production`,
secrets, sauvegardes, et un volume de base persistant).
