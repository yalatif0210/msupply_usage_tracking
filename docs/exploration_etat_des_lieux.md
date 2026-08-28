# État des lieux — exploration du dépôt DQA mSupply

**Date :** 2026-08-27
**Objet :** comprendre la logique existante avant toute modification. Aucune
modification de code n'a été faite. Aucun correctif n'est proposé ici : ce
document constate.
**Méthode :** lecture intégrale des fichiers présents, vérification de chaque
affirmation des documents contre le SQL et contre le jeu de données réel fourni
dans le classeur Excel.

---

## 1. Inventaire réel du dépôt

Le dépôt est un **socle de démarrage**, pas une base de code en fonctionnement.

| Fichier | Nature | Constat |
|---|---|---|
| `CLAUDE.md` | Instructions projet | Présent, révisé récemment (voir §7) |
| `ARCHITECTURE.md` | Doc cible d'implémentation | Présent, révisé récemment |
| `initial.sql` (780 l.) | Modèle SQL complet, à plat | Présent, **non numéroté**, hors `db/migrations` |
| `Canevas_Extraction_mSupply_DQA.xlsx` | Gabarit d'extraction rempli d'un jeu réel | Extraction 2026-08-18, 40 sites |
| `paqd.ts` (121 l.) | Contrat partagé — vocabulaire PAQD | À la racine |
| `dto.ts` (178 l.) | Contrat partagé — DTO API ↔ front | À la racine |
| `package.json` / `tsconfig.json` | Manifeste + config TS | Minimalistes |
| `docs/agents/` | Config des skills d'ingénierie | Créé en préalable |

**N'existent pas** alors que la documentation les référence : `apps/api`,
`apps/web`, `packages/contracts`, `db/migrations/`, `docs/guide_module_import.md`,
`DESIGN_SYSTEM.md`, `CONTEXT.md`. `git` n'est pas initialisé. Aucune dépendance
installée (`zod`, `typescript` absents) — impossible de compiler ou tester en
l'état.

Il n'y a donc **aucun flux métier exécutable** : ni contrôleur, ni service, ni
composant Angular. Tout ce qui suit confronte l'*intention* (docs) aux
*artefacts* (SQL + contrats + données).

---

## 2. Architecture cible (d'après les documents)

Flux d'entrée **manuel et discontinu** : la DAP produit un classeur Excel
hebdomadaire (fenêtre glissante de 45 jours), le dépose via l'interface.

```
Excel (8 onglets)  →  stg_*  →  dim_*/fact_*  →  mv_*  →  API (lecture seule)  →  Angular
```

**Modules API prévus** (`ARCHITECTURE.md` §2) :

- `ImportModule` : `FichierController` (SHA-256) → `LectureExcelService` →
  `ValidationService` (compteurs METADATA **bloquants**, formats, références
  croisées) → `StagingService` → `PromotionService` (transaction unique) →
  `RafraichissementService` (`dqa.rafraichir_indicateurs()`, hors transaction,
  fige `hist_score_site`).
- `IndicateursModule` : lecture seule sur `mv_*` et `hist_score_site`, ne
  recalcule jamais.
- `ReferentielModule` : sites, produits, districts pour les filtres.

**8 points d'entrée HTTP** (`ARCHITECTURE.md` §3), tous typés par `@dqa/contracts`.

**4 écrans Angular** : synthèse nationale (projetée en réunion), liste des sites
(tri par score croissant), détail d'un site (six composantes pondérées), journal
des imports.

---

## 3. Le modèle SQL (`initial.sql`) — ce qu'il fait

**Couche 0 — contrôle des imports**
`import_lot` (PK `id`, `empreinte_sha256` UNIQUE, `statut` CHECK
`recu/en_cours/valide/rejete`, compteurs `nb_lignes_declarees` /
`nb_lignes_reelles` en JSONB) ; `import_anomalie` (`gravite` CHECK
`info/avertissement/erreur`, FK `lot_id` ON DELETE CASCADE).
→ Concorde avec `lotImportSchema` / `anomalieImportSchema` de `dto.ts`.

**Couche 1 — staging**
7 tables `stg_*` tout en `TEXT`, sans contrainte, `lot_id` en FK :
`stg_sites`, `stg_produits`, `stg_transactions`, `stg_lignes_transactions`,
`stg_stock_actuel`, `stg_inventaires`, `stg_requisitions`.
METADATA et MODE_EMPLOI ne sont pas stagés.

**Couche 2 — core**
Dimensions : `dim_site` (PK `site_id`, `dans_perimetre_dqa` défaut `FALSE`),
`dim_produit` (PK `produit_id`, `est_traceur` défaut `FALSE`), `dim_temps`
(calendrier, PK `jour`, `periode_dqa` ∈ M+1…M+4).
Faits : `fact_transaction` (PK `transaction_id`), `fact_ligne_transaction`
(colonne générée `quantite_unitaire = quantite * taille_conditionnement`),
`fact_stock_snapshot` (UNIQUE `date_photo, site_id, produit_id, lot_produit`),
`fact_inventaire` (colonne générée `ecart_absolu`, UNIQUE `inventaire_id,
produit_id`), `fact_requisition` (colonne générée `delai_soumission_j =
date_saisie - date_inventaire_ref`).

**Paramétrage** : `param_seuil` (PK `code_indicateur`, `pilier`, `poids_pct`,
`seuil_conforme`, `seuil_partiel`, `sens` sup/inf, `unite`), alimentée par un
`INSERT` de 7 lignes.

**Couche 3 — indicateurs** (`initial.sql` l. 385-743)

| Vue | Grain | Filtre types | Seuils |
|---|---|---|---|
| `mv_p2_regularite` | site (période globale) | `type='si'` & `statut='fn'` | ≥65 / ≥50 |
| `mv_p2_completude` | site × mois | `type IN ('ci','si','sc','ri','im+')`, `/5` | =5 types |
| `mv_p2_delai_reception` | transaction | `type='ci'` & `date_livraison IS NOT NULL` | ≤1 / ≤3 j |
| `mv_p3_ecart_sdu` | site × produit | conso `type='si'` ; 2 inventaires bornants | ≤2 / ≤5 % |
| `mv_p4_ajustements` | site × mois | `type IN ('im+','im-')` | ≤5 / ≤10 % |
| `mv_p5_concordance` | site × produit | dernier comptage vs snapshot | ≥90 / ≥75 % |
| `mv_score_composite` | site | — | 90 / 75 |
| `v_synthese_nationale` | national | — | — |

`mv_score_composite` (l. 677-683) code en dur :
`completude*0.25 + regularite*0.15 + precision*0.25 + concordance*0.25 + ajustements*0.10`.

`rafraichir_indicateurs()` (l. 749-780) : `REFRESH MATERIALIZED VIEW
CONCURRENTLY` des 7 vues dans l'ordre, puis `INSERT … ON CONFLICT DO UPDATE`
dans `hist_score_site` avec `date_mesure = CURRENT_DATE`.

---

## 4. Les contrats (`paqd.ts`, `dto.ts`)

- Schémas Zod primaires, types dérivés par `z.infer` — la règle de `CLAUDE.md`
  §3 est respectée.
- `PILIERS` = `P1…P6`. `COMPOSANTES` = `completude, promptitude,
  regularite des saisies, precision, concordance, ajustements`.
- `POIDS` (somme = 1) : completude .10, promptitude .15, regularite .15,
  precision .25, concordance .25, ajustements .10.
- `PILIER_DE_COMPOSANTE` : completude→P1, promptitude→P2, regularite→P3,
  precision→P4, concordance→P5, ajustements→P6.
- `classifier()` : `≥90 CONFORME`, `≥75 PARTIELLEMENT_CONFORME`, sinon
  `NON_CONFORME` — aligné sur `CLAUDE.md` §5.
- `STATUTS_INDICATEUR` : `CONFORME / PARTIEL / ALERTE / NON_CALCULABLE`
  (statut d'un indicateur, distinct de la classification d'un site).
- Les 8 types des endpoints existent tous dans `dto.ts`.

---

## 5. Données réelles de l'Excel — faits établis

Classeur = **9 feuilles** : MODE_EMPLOI (instructions) + 8 remplissables
(METADATA + 7 onglets de données). Extraction du 2026-08-18, mSupply V09.01.03,
réalisée par Wilfried Akosso.

### 5.1 Codes `type_transaction` réellement présents (14 462 lignes)

| Code | Occurrences | Indice d'interprétation |
|---|---:|---|
| `ci` | 11 497 | sorties / dispensations — **jamais** de `date_livraison` |
| `rc` | 2 021 | **réceptions** — commentaires « Reçu pour facture(s) NNN » |
| `si` | 692 | **seul** type portant une `date_livraison` (108 lignes) |
| `sc` | 240 | |
| `cc` | 12 | |

- `ri`, `im+`, `im-` : **totalement absents**.
- **Aucun suffixe `/INVAD`** nulle part (ni SQL ni Excel).
- `rc` et `cc` ne figurent dans aucune liste des documents.
- Statuts : `fn` 13 259, `cn` 1 085, `sg` 62, `nw` 56 (les vues gardent `fn`).

### 5.2 Compteurs METADATA vs comptage réel

| Onglet | Déclaré | Réel | |
|---|---:|---:|---|
| SITES | 40 | 40 | OK |
| PRODUITS | **13** | **42** | écart — 42 lignes pour 13 `produit_id` distincts (grain produit × programme) |
| TRANSACTIONS | 14 462 | 14 462 | OK |
| LIGNES_TRANSACTIONS | 5 350 | 5 350 | OK |
| STOCK_ACTUEL | 549 | 549 | OK |
| INVENTAIRES | 2 154 | 2 154 | OK en nombre de lignes, mais 274 `inventaire_id` distincts / 445 couples (`inventaire_id`, `produit_id`) → duplication lourde |
| REQUISITIONS | 319 | 319 | OK |

### 5.3 Autres faits

- Période METADATA : **2026-07-01 → 2026-08-18**. Or `date_confirmation` des
  transactions va de **2026-06-03 à 2026-08-13** → le fichier contient des
  données hors de sa période déclarée.
- `STOCK_ACTUEL.date_photo` : une seule valeur (2026-08-18).
- `LIGNES_TRANSACTIONS.quantite` = `1` sur 5 349 lignes / 5 350 ;
  `taille_conditionnement` = `1` partout ; 32 lignes à quantité ≤ 0.
  → `quantite_unitaire` ≈ 1 partout : `mv_p3_ecart_sdu.conso_msupply` compte
  des lignes, pas des quantités.
- `REQUISITIONS.date_reception` : renseignée 99/319 (l'observation METADATA
  dit « la date de réception est NULL »). Toutes `fn`, type ∈ {Ordinaire,
  Urgente}. Aucune vue ne consomme `fact_requisition` ni `delai_soumission_j`.
- SITES : 40 lignes, toutes `actif = OUI`. L'onglet **n'a pas** de colonne
  `dans_perimetre_dqa`.
- PRODUITS : 42 lignes, toutes `est_traceur = OUI`, 13 produits distincts.
- MODE_EMPLOI : fenêtre = 45 derniers jours (recouvrement volontaire pour
  rattraper une semaine oubliée) ; dates `AAAA-MM-JJ` ; cellule vide laissée
  vide ; chaque onglet a une ligne d'exemple à supprimer avant envoi.

---

## 6. Registre des contradictions

Statut : **[ouvert]** = présent au 2026-08-27 · **[résolu]** = corrigé dans une
révision récente des docs pendant l'exploration.

### C2 — « cinq » vs « six » piliers/composantes — [résolu dans les docs]

`CLAUDE.md` §5 (« Les six piliers PAQD ») et `ARCHITECTURE.md` §4 (« six
composantes ») ont été alignés sur `PILIERS` = P1…P6 de `paqd.ts`.
`ARCHITECTURE.md` §5/§6 référencent désormais `mv_p6_ajustements`.

### C3 — modèles de piliers incompatibles entre les docs/contrats et le SQL — [ouvert]

| Source | Schéma | Poids clés |
|---|---|---|
| `CLAUDE.md` §5 + `paqd.ts` | **P1…P6**, ajustements = **P6** | complétude **10 %**, promptitude 15, régularité 15, SDU 25, concordance 25, ajustements 10 |
| `initial.sql` (`param_seuil`, l. 368-376) | **P2…P5** (pas de P1 ni P6), P2 = {complétude, régularité, délai récep.}, ajustements = **P4** | complétude **25 %**, régularité 15, SDU 25, ajustements 10, concordance 25 |

Le score SQL (l. 677-683) applique **complétude à 25 %** et **n'a aucune
composante « promptitude »**. Les docs référencent `mv_p6_ajustements`, le SQL
définit `mv_p4_ajustements`. Le commentaire `fact_transaction` (l. 259) évoque
encore un autre découpage (« P2 (complétude, promptitude) et P4 (ajustements) »).
→ Le SQL est désormais le seul à ne pas suivre le modèle à 6 piliers.

### C4 — libellés de piliers divergents entre sources — [partiellement ouvert]

Dans `paqd.ts`, `LIBELLES_PILIER` diverge de `LIBELLES_COMPOSANTE` pour le même
concept : P3 « Régularité de saisie (dispensation) » vs « Régularité des
saisies » ; P4 « Précision des données » vs « Écart SDU produits traceurs » ;
P6 « Analyse des ajustements » vs « Ratio d'ajustements ». `param_seuil` ajoute
« Régularité de saisie des dispensations » et « Ratio des ajustements ».

### C11 — chaîne de classification incompatible SQL ↔ contrats — [ouvert]

`mv_score_composite` (l. 696-697) et `v_synthese_nationale` (l. 737-738)
émettent `'PARTIELLEMENT CONFORME'` / `'NON CONFORME'` (avec espaces).
`paqd.ts` `CLASSIFICATIONS` = `'PARTIELLEMENT_CONFORME'` / `'NON_CONFORME'`
(underscores). `hist_score_site.classification` (TEXT libre) stocke la forme à
espaces. → Toute réponse API validée par `classificationSchema` échoue.

### C12 — codes de types codés en dur et faux, prouvés par les données — [ouvert]

Contredit directement `CLAUDE.md` §6 (« Ne jamais coder en dur une liste de
codes de types sans l'avoir vérifiée contre les données réelles »).

- `mv_p2_completude` (l. 441-446) : `IN ('ci','si','sc','ri','im+')` puis
  `/5*100`, `>=5 → CONFORME`. `ri` et `im+` n'existant pas, le maximum
  atteignable est **3/5 = 60 %** → **tous les sites en `ALERTE` permanente**.
- `mv_p2_delai_reception` (l. 473-476) : `type='ci' AND date_livraison IS NOT
  NULL`. Les `ci` n'ont **jamais** de `date_livraison` (seuls les `si` en ont),
  et les réceptions réelles sont des `rc`. → **La vue est toujours vide.**
- `mv_p4_ajustements` (l. 557-572) : `FILTER (WHERE type IN ('im+','im-'))` →
  **toujours 0** → ratio 0 % → **tous les sites `CONFORME`** sur ce pilier.
  `idx_tx_ajustements` (l. 254-256) n'indexe rien.

### C13 — `param_seuil` écrite mais jamais lue — [ouvert]

`initial.sql` l. 353-354 justifie l'externalisation des seuils « plutôt qu'en
dur dans les vues », puis `mv_score_composite` code en dur poids **et** seuils
90/75 (l. 677-698). Aucune vue ne lit `param_seuil`. Contredit sa raison d'être
et `CLAUDE.md` §5.

### C14 — `dim_temps` jamais alimentée — [ouvert]

Table créée (l. 221-230), aucun seed (`INSERT` / `generate_series`).
`mv_p2_regularite` en dépend (l. 388-397) → `jours_attendus = 0` →
`taux_regularite_pct = NULL` → **régularité `NULL`/`ALERTE` pour tous** et
composante `regularite` = 0 dans le score composite.

### C15 — `dans_perimetre_dqa` jamais mis à `TRUE` — [ouvert]

Défaut `FALSE` (l. 190), l'onglet SITES n'a pas cette colonne, aucun seed ni
migration ne la renseigne. Les 7 vues filtrent `s.dans_perimetre_dqa`.
→ **Après un import, tout `mv_*` renvoie 0 ligne, le tableau de bord est vide.**

### C16 — grain PRODUITS incompatible avec la PK — [ouvert]

L'onglet PRODUITS a un grain (produit × programme) : 42 lignes, 13 `produit_id`.
`dim_produit` PK = `produit_id` → la promotion écrase 42 → 13, `programme` prend
la dernière ligne. Le compteur METADATA (13) suppose le grain « produit
distinct ». → Soit rejet du fichier (42 ≠ 13), soit perte silencieuse de
l'information programme. Règle de déduplication non spécifiée.

### C17 — INVENTAIRES : duplication vs `UNIQUE (inventaire_id, produit_id)` — [ouvert]

2 154 lignes pour 445 couples. Un `INSERT` naïf en promotion échoue ;
`PromotionService` doit agréger/dédupliquer — non documenté. De plus,
`mv_p3_ecart_sdu` (l. 502-513) fait `HAVING COUNT(*) >= 2` : les doublons d'un
même inventaire réel satisfont artificiellement la condition « deux bornes » et
produisent un `stock_debut - stock_fin` fabriqué.

### C18 — `SyntheseNationale` non satisfiable par `v_synthese_nationale` — [ouvert]

`syntheseNationaleSchema` (`dto.ts` l. 101-110) attend `moyennesParComposante`
et `derniereMiseAJour` ; `v_synthese_nationale` (l. 732-743) ne fournit ni l'un
ni l'autre.

### C19 — composante `promptitude` sans source SQL — [ouvert]

`COMPOSANTES` / `POIDS` de `paqd.ts` incluent `promptitude` (15 %).
`mv_score_composite` ne calcule aucune promptitude ; `mv_p2_delai_reception`
(seul candidat) est hors score et toujours vide (voir C12).

### C20 — inversion probable `si` / `ci` — [ouvert, à confirmer]

`mv_p2_regularite` (l. 402) et `mv_p3_ecart_sdu` (l. 497) prennent `type='si'`
pour « saisie des dispensations » / « consommation déclarée ». En logique
mSupply, la dispensation patient est `ci` (11 497 lignes), pas `si` (692).
À vérifier contre la doc mSupply.

### C5 — seuils « jamais en dur » vs seuils en dur dans `paqd.ts` — [ouvert]

`CLAUDE.md` §5 : « pas en dur dans le code ». `paqd.ts` l. 54-55 code
`SEUIL_CONFORME = 90` / `SEUIL_PARTIEL = 75`, appliqués par `classifier()`. Le
commentaire l. 53 assume la duplication. Tension à trancher (tolérée pour le
front, ou à supprimer).

### C1 — bug de type dans `paqd.ts` : clé de composante — [ouvert]

`COMPOSANTES` déclare `'regularite des saisies'` **avec espaces** (l. 68), mais
`POIDS`, `PILIER_DE_COMPOSANTE` et `LIBELLES_COMPOSANTE` utilisent la clé
`regularite_des_saisies` **avec underscores** (l. 86, 92, 103). Comme
`type Composante = z.infer<typeof composanteSchema>`, les trois
`Record<Composante, …>` ont une clé en trop et une clé manquante → **erreur de
compilation sous `strict`**. De plus l'API émettrait des clés JSON contenant une
espace via `z.record(composanteSchema, …)`.

### C6 — message d'erreur `dateIsoSchema` faux — [ouvert]

`paqd.ts` l. 117-119 : la regex impose `AAAA-MM-JJ` (commentaire l. 116
confirme), mais le `message` dit « JJ-MM-AAAA ».

### C7 — `pourcentageSchema` : commentaire non tenu — [ouvert]

`paqd.ts` l. 112 annonce « arrondi au dixième » ; le schéma l. 113 ne fait que
`min(0).max(100)`.

### C8 — emplacement des fichiers vs `tsconfig.json` — [ouvert]

`rootDir: "src"` et `include: ["src/**/*.ts"]`, mais `paqd.ts` / `dto.ts` sont à
la racine → `tsc` ne les compile pas. Destinés à `packages/contracts/src/`.

### C9 — ESM incomplet — [ouvert]

`dto.ts` importe `./paqd.js` (NodeNext) et `tsconfig` a `verbatimModuleSyntax`,
mais `package.json` racine n'a pas `"type": "module"` et il n'existe pas de
`packages/contracts/package.json`.

### C10 — scripts `package.json` non fonctionnels — [ouvert]

`build:contracts` cible `@dqa/contracts` qui n'existe pas comme workspace ;
aucune dépendance `zod` déclarée alors que les deux fichiers l'importent.
`ARCHITECTURE.md` §5 marque « packages/contracts — fait » (optimiste : mauvais
dossier + C1).

---

## 7. Effet net observé

Avec le schéma livré + ce fichier d'exemple :

- `dans_perimetre_dqa` jamais mis → **toutes les vues renvoient 0 ligne**
  (C15). Il faut d'abord lever ce point pour que quoi que ce soit s'affiche.
- En supposant ce point corrigé : `completude` ≈ 60 (plafond, C12),
  `regularite` = 0 (C14), `ajustements` = 100 (vacuité, C12), `precision` et
  `concordance` très bruités (C7 données : quantités = 1, inventaires
  dupliqués). Score composite ≈ `15 + 0 + precision·0,25 + concordance·0,25 +
  10` → **quasi tous les sites « NON CONFORME » par câblage, pas par
  performance réelle.**

---

## 8. Zones encore incomprises / questions ouvertes

1. **Sémantique exacte des codes mSupply** `ci` / `rc` / `si` / `sc` / `cc` —
   lequel est dispensation, réception, ajustement. Décisif pour P1/P2/P3/P6.
   Nécessite la doc mSupply ou l'auteur des requêtes d'extraction.
2. **Alimentation de `dim_temps`** : seed dans une migration ? job séparé ?
   Et le sens de `periode_dqa` (M+1…M+4) sur une fenêtre glissante de 45 jours.
3. **Mise en périmètre** : comment `dim_site.dans_perimetre_dqa` passe à `TRUE`.
4. **`LIGNES_TRANSACTIONS.quantite = 1` partout** : données de gabarit, ou grain
   réel « une ligne = une unité » ? Détermine si P3 est calculable.
5. **Règles de déduplication** attendues de `PromotionService` pour INVENTAIRES
   et PRODUITS.
6. **`date_livraison` uniquement sur `si`** : « réception » = `si` dans ce
   modèle ? Alors `fact_transaction.date_livraison` (« ship_date ») et
   `mv_p2_delai_reception` sont à revoir ensemble.
7. **Numérotation cible des piliers** : le produit livre-t-il 6 piliers
   (docs + `paqd.ts`) ou le SQL doit-il être réécrit ? Les docs semblent
   désormais faire autorité (P1…P6), le SQL est à réaligner.
8. **`REFRESH MATERIALIZED VIEW CONCURRENTLY` dans une procédure plpgsql**
   (l. 749-758) : à vérifier en conditions réelles (contrainte « hors bloc
   transactionnel »).
9. **`P2_DELAI_RECEP` sans poids** (`poids_pct = NULL`, unité `jours`) :
   indicateur d'information seulement, ou composante oubliée du score ?

---

## 9. Fichiers / références manquants cités par la doc

- `/docs/guide_module_import.md` (`CLAUDE.md` §4)
- `DESIGN_SYSTEM.md` (`CLAUDE.md` §8)
- `/db/migrations/` numéroté (partout) — `initial.sql` en tient lieu, à plat
- `packages/contracts/`, `apps/api/`, `apps/web/`
- `CONTEXT.md` (attendu par `docs/agents/domain.md`)

---

## 10. Recommandation de séquencement (pour mémoire, non exécutée)

1. Figer le vocabulaire et **le schéma de piliers** (6 piliers ? poids ?
   mapping composante → pilier ?) dans un `CONTEXT.md` — c'est le nœud qui
   bloque tout le reste (C3, C4, C19).
2. Confirmer la sémantique des codes de transaction contre la doc mSupply
   (C12, C20) et la stratégie `/INVAD` (C6 docs).
3. Décider comment `dim_temps` et `dans_perimetre_dqa` sont alimentés (C14,
   C15) — sans quoi le tableau de bord reste vide.
4. Reprendre `initial.sql` en migrations numérotées une fois 1–3 tranchés.
5. Aligner les contrats (`paqd.ts` C1, C11) sur les décisions.
