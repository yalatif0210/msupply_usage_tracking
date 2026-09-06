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
  saine (donc les migrations passées). Purge le core, insère 11 sites de strates
  variées (dont un district et sa zone de trois sites rattachés) + la fin du
  cycle C2 (2026-05 à 2026-08) et le début du C3 (2026-09). Les trajectoires de
  stock des 4 traceurs sont **générées** (bloc `DO` + table `_plan`) pour se
  réconcilier sur des fenêtres d'un mois : deux inventaires en mai (borne
  d'ouverture intra-mois), un inventaire de fin de mois ensuite, réception et
  dispensations mensuelles calées sur `compté(M) = compté(M-1) + réceptions -
  sorties`. Un lot d'import par mois plus un cinquième « extraction du 5
  septembre » à fenêtre de 45 jours qui chevauche août et septembre : il apporte
  les premiers jours de septembre ET les réquisitions d'août du CHU et du
  District, et le gel corrige alors le score d'août (encore ouvert) sans
  redéclaration (ADR 0010). 2026-08 et 2026-09 sont les mois en cours au regard
  de la date du jour, leur score est provisoire. `web` attend sa fin
  (`service_completed_successfully`). Rejouable :
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
| Tableau de bord | courbe de progression nationale sur 5 points (91,7 → 89,7 → 92,9 → 87,4 → 66,8 ; les deux derniers provisoires — septembre chute car aucun site n'y a fait son inventaire de fin de mois) |
| Fiche site (`/sites/SITE-HG`), mois d'août | exemple du manuel : P1/P2/P3/P6 à 100, P4 à 50 (1 produit SDU hors tolérance sur 2), P5 à 0 (concordance 98,3 % sous le seuil de 100 %) → composite 62,5 NON CONFORME |
| Fiche site (`/sites/SITE-DIST`) | district : P3 « Régularité de saisie (distribution) », seuil 80 %, réponse aux réquisitions de la zone (juin 2/3, juillet 3/3, août 2/3, sept 1/3) ; détail P3 = le couple réquisitions de zone / servies au lieu du bandeau calendaire (ADR 0011) ; « Écart distribution » à la place de « Écart consommation » |
| Fiche site 2026-09 | mois à 5 jours de données : P3 mesuré sur les jours écoulés (~100 % pour un site régulier), P1/P2 à 0 faute d'inventaire de fin de mois → composite ~75, repère « Mois en cours » |
| Fiche site (`/sites/SITE-CHR`) | vigilance chronique : P3 faible, écart SDU hors tolérance mai-juin, réquisition en retard, ajustements → NON CONFORME tous les mois |
| Fiche site (`/sites/SITE-REIMP`) | avertissement « données du core modifiées depuis le gel » |
| Fiche site (`/sites/SITE-CSU`) | réquisition jamais soumise → « rapport manquant », PARTIELLEMENT CONFORME |
| `/synthese` onglet « Rapports & inventaires » | strates CHU / CHR / HG / ESPC / CS / District ; « Non classé » pour l'Institut |
| `/admin/strates` | `Institut` sans correspondance |
| Fiche produit-mois | depuis un code produit du tableau P4·P5 de `SITE-HG` (ARV : bornes inter-mois, photos de stock) |

Pour tester l'import réel : se connecter en `coordination`, écran
**Imports**, déposer un classeur au format du canevas
(`docs/Canevas_Extraction_mSupply_DQA_v2.xlsx`).

## Production

Hors périmètre de ce dépôt à ce jour : pas de `docker-compose.prod.yml`, pas de
CI. La pile démo en est la base (mêmes images ; ajouter TLS, `NODE_ENV=production`,
secrets, sauvegardes, et un volume de base persistant).
