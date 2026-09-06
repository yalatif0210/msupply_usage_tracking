# Référentiel des structures — échéance et régime administrés

ADR : `docs/adr/0013-referentiel-des-structures-administre.md`.

## Contexte

Le `type_structure` d'un site pilote la strate d'affichage, l'échéance de
réquisition et le régime de scoring (district / site de soins). Seule la strate
était administrée (`strate_structure`, `/admin/strates`, migration 0031).
L'échéance vivait dans un `CASE` recopié dans `mv_p2_promptitude`,
`dqa.jour_limite_requisition`, le repository et quatre migrations. Le régime
était `dqa.strate_de(type_structure) = 'District'` — une comparaison sur le
libellé d'affichage.

La donnée réelle (feuille SITES, 40 sites) ne porte que trois valeurs :
`ESPC` (20), `Hôpital de référence` (10), `District sanitaire` (10). Le
sous-type (CSU/CSR, CHR/HG) n'est pas un champ. `CHU` et `INSTITUT` existent
dans le référentiel plus large, hors des 40 sites actuels.

## Ce qui change

### Schéma

- `strate_structure` gagne `jour_limite_requisition int NOT NULL` et
  `est_district boolean NOT NULL DEFAULT false`.
- Seed reconstruit : les cinq lignes du tableau de l'ADR ; les lignes
  sous-type (`CSU`, `CSR`, `HG`, `CHR`) de la migration 0031 retirées.
- `dim_site.jour_limite_requisition` **supprimée** ; `stg_sites.jour_limite_requisition`
  supprimée.

### Fonctions

- `dqa.jour_limite_requisition(text)` — signature ramenée à un argument ;
  corps = `coalesce((SELECT jour_limite_requisition FROM strate_structure
  WHERE type_structure = $1), 10)`. IMMUTABLE → STABLE (lit une table).
- `dqa.est_district(text)` — nouvelle ; `coalesce((SELECT est_district …), false)`.
  STABLE.
- `dqa.mois_est_clos` — le 10 codé en dur devient
  `(SELECT max(jour_limite_requisition) FROM strate_structure)`.

### Vues matérialisées (reconstruction en cascade)

- `mv_p2_promptitude` : `jour_limite_requisition(type_structure,
  jour_limite_requisition)` → `jour_limite_requisition(type_structure)`.
- `mv_p3_regularite` : `strate_de(type_structure) = 'District'` →
  `est_district(type_structure)` (branche district **et** grain dispensation
  ADR 0012).
- `mv_p4_ecart_produit`, `mv_p4_ecart` : CTE `sites_district` et colonne
  `est_district` passent par `dqa.est_district`.
- `mv_score_pilier` : reconstruite à l'identique (emportée par le CASCADE).
- `CALL dqa.rafraichir_et_geler(NULL)` en fin de migration.

### API

- `indicateurs.repository.ts` : les chaînes SQL
  `strate_de(type_structure) = 'District'` (≈ 4 occurrences) →
  `dqa.est_district(type_structure)` ; `jour_limite_requisition(ds.type_structure,
  ds.jour_limite_requisition)` → `jour_limite_requisition(ds.type_structure)`.
- `promotion.service.ts` : l'`INSERT dim_site` perd `jour_limite_requisition`.
- `contrat-jeux.ts` : le jeu `SITES` perd `jour_limite_requisition` de ses
  colonnes.

### Contrats

- `strateStructureSchema` gagne `jourLimiteRequisition: z.number().int().min(1).max(28)`
  et `estDistrict: z.boolean()`.
- `entreeStrateSchema` (corps du `PUT /api/admin/strates/:typeStructure`) :
  `strateStructureSchema.omit({ typeStructure: true })` — les trois champs
  éditables.

### Écran `/admin/strates`

- Titre « Strates de structure » → « Types de structure ».
- Tableau des correspondances : deux colonnes de plus (échéance, régime).
- Formulaire d'ajout / édition : champ entier « jour limite » (1–28), case
  « district » ; `strate` toujours obligatoire.
- L'onglet « à classer » : inchangé (types du périmètre sans correspondance).

### Jeu de démonstration

- `db/demo/seed.sql` : l'`INSERT dim_site` perd la colonne
  `jour_limite_requisition` ; le référentiel semé reçoit les cinq lignes (le
  seed du core purge et réinsère `strate_structure` si besoin).
- Scores attendus **inchangés** : progression 95,3 → 90,6 → 92,8 → 89,0 → 69,2 ;
  CHR de Daloa août 62,5.

### Documentation

- Canevas (`canevas_extraction_v2.md`) : en-tête de la colonne F du modèle
  SITES corrigé pour annoncer les paliers réels ; ligne `jour_limite_requisition`
  retirée du tableau SITES ; D3 réécrite.
- `specification_extraction_dap.md` : §4.2 (colonne retirée), §5.3 (le tableau
  devient le seed d'un référentiel administré, pas une règle figée).
- `guide_module_admin.md` : section strates réécrite (trois responsabilités).
- `guide_module_indicateurs.md` : P2 / P3 / P4 pointent `est_district` et
  `jour_limite_requisition` comme lectures du référentiel.
- `CONTEXT.md` : entrée « Strate de structure » → « Type de structure » ;
  nouvelle définition « Régime de scoring ».

## Ce qui ne change pas

- La strate reste non historisée (ADR 0005) ; effet à la consultation suivante.
- Le seuil district de P3 vient toujours de la grille (ADR 0011).
- Les scores gelés (ADR 0003, ADR 0010) : non recalculés.
- Le statut binaire des sous-composantes, la renormalisation du composite.
- `dqa.strate_de` : signature et sémantique inchangées.

## Périmètre exclu

- Pas de modélisation du sous-type (CSU / CSR / CHR / HG) : il reste lisible
  dans `site_nom` et `site_code`, sans champ dédié.
- Pas de rattrapage des scores historiques (les prochains imports regèlent).
- Pas d'`enum` de régime : `est_district` booléen (ADR 0013, alternative
  écartée).
- Pas de renommage de la table SQL `strate_structure` (seul le titre de
  l'écran change) — éviter le churn sur toutes les migrations qui la citent.
