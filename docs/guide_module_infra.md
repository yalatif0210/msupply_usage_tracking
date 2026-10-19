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

Puis <http://localhost:8081> — connexion `coordination` / `coordination-2026`
(ou `admin` / `admin-2026`, `lecteur` / `lecteur-2026`).

- Le front (Nginx) écoute sur `:8080` ; `3000` / `4200` sont laissés libres
  pour `elyon-erp`.
- Le port 8081 est publié sur `127.0.0.1` uniquement, jamais sur toutes les
  interfaces : un collègue sur le même réseau ne peut pas atteindre la démo.
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
  saine (donc les migrations passées). Purge le core, insère 16 sites réels du
  canevas (4 districts, chacun son hôpital de référence et 2 ESPC de zone) + la
  fin du cycle C2 (2026-05 à 2026-08) et le début du C3 (2026-09). Les
  trajectoires de stock des 4 traceurs sont **générées** (bloc `DO` + table
  `_plan`) pour se réconcilier sur des fenêtres d'un mois : deux inventaires en
  mai (borne d'ouverture intra-mois), un inventaire de fin de mois ensuite,
  réception et dispensations mensuelles calées sur `compté(M) = compté(M-1) +
  réceptions - sorties`. Septembre est un mois EN COURS : 5 jours de
  dispensation, **aucun inventaire ni réquisition** — P1, P2, P4 et P5 sont
  tous **non calculables** tant que le mois n'est pas clos (ADR 0014), le
  score ne porte que sur P3 et P6. Un lot d'import par mois plus un cinquième « extraction du 5
  septembre » à fenêtre de 45 jours qui chevauche août et septembre : il apporte
  les premiers jours de septembre ET les réquisitions d'août du CHR et du
  district de Daloa, et le gel corrige alors le score d'août (encore ouvert)
  sans redéclaration (ADR 0010). 2026-08 et 2026-09 sont les mois en cours au regard
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

Sites : 16 sites RÉELS repris de la feuille SITES du canevas d'extraction
(`store.id` mSupply, 3 `type_structure` réels) — 4 districts sanitaires, chacun
avec son hôpital de référence et 2 ESPC de sa zone.

| Écran | À regarder |
|---|---|
| Tableau de bord, `/synthese`, fiches site et produit | sélecteur « Mois affiché » : 2026-05 à 2026-09 ; repère « Mois en cours · score provisoire » sur 2026-08 et 2026-09 |
| Tableau de bord | courbe de progression nationale sur 5 points (95,3 → 90,6 → 92,8 → 89,0 → 92,5 ; les deux derniers provisoires, reliés **en pointillé** ; septembre reste haut mais n'est noté que sur P3 et P6 — P1/P2/P4/P5 non calculables tant que le mois est en cours) |
| Fiche site — CHR PUBLIC de DALOA (`31600010`), mois d'août | exemple du manuel : P1/P2/P3/P6 à 100, P4 à 50 (1 produit SDU hors tolérance sur 2), P5 à 0 (concordance 98,3 % sous le seuil de 100 %) → composite 62,5 NON CONFORME |
| Fiche site — DISTRICT de NIAKARAMADOUGOU | P3 « Régularité de saisie (distribution) », seuil 80 %, réponse aux réquisitions de la zone (juin 2/3, juillet 3/3, août 2/3, sept 1/3) ; détail P3 = le couple réquisitions de zone / servies au lieu du bandeau calendaire (ADR 0011) ; « Écart distribution » à la place de « Écart consommation » |
| Fiche site 2026-09 | mois à 5 jours de données : P3 mesuré sur les jours écoulés (~83 % pour un site régulier), P6 à 100 ; P1/P2/P4/P5 non calculables (inventaire/réquisition de fin de mois pas dus) → composite élevé mais **provisoire**, « Score calculé sur 2 piliers sur 6 », repère « Mois en cours » ; la courbe d'évolution reste visible (fenêtre par défaut = 12 mois), son dernier segment en pointillé |
| Fiche site — CHR PUBLIC de BONDOUKOU | vigilance chronique : P3 faible, écart SDU hors tolérance mai-juin, réquisition en retard, ajustements → NON CONFORME tous les mois |
| Fiche site — CSU GONATE | avertissement « données du core modifiées depuis le gel » |
| Fiche site — CSR-DM PUBLIC de BOBIA | réquisition jamais soumise → « rapport manquant », PARTIELLEMENT CONFORME |
| `/synthese` onglet « Rapports & inventaires » | trois strates : District, Hôpital de référence, ESPC |
| `/admin/strates` (« Types de structure ») | les trois `type_structure` réels + `CHU` / `INSTITUT` sont mappés avec strate, jour limite (5 / 7 / 10) et régime (ADR 0013) |
| Fiche produit-mois | depuis un code produit du tableau P4·P5 du CHR de Daloa (ARV : bornes inter-mois, photos de stock) |

Pour tester l'import réel : se connecter en `coordination`, écran
**Imports**, déposer un classeur au format du canevas
(`docs/Canevas_Extraction_mSupply_DQA_v2.xlsx`).

## Production

`docker-compose.prod.yml` (racine) + `deploy/`. Mêmes images que la démo, plus :

| Élément | Fichier |
|---|---|
| Pile complète (base persistante, API, Nginx+TLS, certbot, sauvegardes) | `docker-compose.prod.yml` |
| Variables (domaine, mots de passe, fuseau, rétention) | `deploy/.env.prod.example` → `deploy/.env.prod` |
| Gabarit Nginx (TLS, en-têtes, proxy, SPA) | `deploy/nginx/default.conf.template` |
| En-têtes de sécurité partagés | `deploy/nginx/security-headers.conf` |
| Hook de rechargement Nginx (renouvellement TLS) | `deploy/nginx/99-reload.sh` |
| Émission initiale du certificat Let's Encrypt | `deploy/init-letsencrypt.sh` |
| Sauvegarde / restauration manuelles | `deploy/backup.sh`, `deploy/restore.sh` |

Différences avec la démo : base sur volume **persistant** (`db_data`), pas de
service `seed`, `NODE_ENV=production` (cookie de session `Secure`),
`restart: unless-stopped`, seul `web` publie des ports (80 / 443).

**Manuel pas à pas et pédagogique** (comment tout est écrit, directive par
directive) : `docs/manuel_deploiement.md`.

Mise en service résumée :

```
cp deploy/.env.prod.example deploy/.env.prod   # renseigner domaine, mots de passe
./deploy/init-letsencrypt.sh                    # certificat TLS (une fois)
docker compose --env-file deploy/.env.prod -f docker-compose.prod.yml up -d
```

Pas de CI à ce jour.
