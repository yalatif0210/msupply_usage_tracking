# Guide du module Import

## Rôle

Transforme le classeur Excel hebdomadaire de la DAP en données exploitables :
lecture → validation → staging brut → promotion typée dans le core → gel des
scores du mois. Point d'entrée unique de toute donnée métier ; aucune autre
partie de l'application n'écrit dans les couches `stg_*` / `dim_*` / `fact_*`.

Emplacement : `apps/api/src/import/`.

## Flux

```
POST /api/imports (multipart, rôle coordination)
  │
  ├─ LectureClasseur      dézippe l'OOXML, lit chaque onglet en texte brut
  │                       (en-têtes ligne 5, données ligne 6+)
  ├─ crée import_lot      statut « en_cours », compteurs déclarés/réels
  ├─ ValidationService    7 familles de règles → anomalies typées
  │     ├─ bloquantes (gravité erreur)  → lot « rejeté », rien ne progresse
  │     └─ avertissements               → consignées, le flux continue
  │
  ├─ transaction unique ─────────────────────────────────────────────
  │   ├─ StagingService     écrit les lignes brutes dans stg_*
  │   ├─ PromotionService   upsert stg_* → dim_*/fact_* sur les clés mSupply
  │   │                     + anomalies « référence non promue »
  │   └─ import_lot         statut « validé », mois PAQD figé
  │   (tout échec ici → ROLLBACK complet, lot « rejeté »)
  │
  └─ hors transaction ──────────────────────────────────────────────
      RafraichissementService  CALL rafraichir_et_geler(lot)
      (échec → avertissement, le lot reste « validé »)
```

Réponse : `ResultatImport` (union discriminée `valide` / `rejete`).

## Écran

`pages/journal-imports.ts` (route `/imports`, **réservée au rôle coordination** —
onglet masqué et garde de route pour les autres rôles ; c'est la coordination
qui pilote le cycle PAQD) : historique des lots — reçu le, fichier, mois PAQD,
statut, compteurs, anomalies dépliables. En tête de page, un champ de dépôt
(`<input type="file" accept=".xlsx">`) envoie le classeur à `POST /api/imports`
et affiche le `ResultatImport` (validé + n avertissements, ou rejeté + motif).
La liste se rafraîchit sans remontage.

## Données manipulées

| Couche | Tables | Écrit par |
|---|---|---|
| Contrôle | `import_lot`, `import_anomalie` | `ImportService` |
| Staging | `stg_sites` … `stg_requisitions` (9, tout en `TEXT`) | `StagingService` |
| Core | `dim_site`, `dim_produit`, `dim_programme`, `dim_site_programme`, `fact_transaction`, `fact_ligne_transaction`, `fact_inventaire`, `fact_inventaire_ligne`, `fact_stock_snapshot`, `fact_requisition` | `PromotionService` (upsert) |
| Indicateurs | `mv_p5_concordance`, `mv_p6_ajustements`, `mv_score_pilier`, `hist_score_site` | procédure `rafraichir_et_geler` |

Le contrat des 9 jeux (colonnes attendues, champs requis, références croisées,
formats) vit dans un seul fichier : `contrat-jeux.ts`. Toute évolution du canevas
d'extraction se répercute là.

## Règles de validation

| Code | Gravité | Déclencheur |
|---|---|---|
| `CYCLE_PAQD_INVALIDE`, `MOIS_PAQD_INVALIDE` | erreur | METADATA `cycle_paqd` / `mois_paqd` absents ou mal formés |
| `BORNES_MOIS_INCOHERENTES` | erreur | `mois_debut` / `mois_fin` ≠ mois attendu du cycle + rang |
| `MOIS_PAQD_FUTUR`, `MOIS_PAQD_TROP_ANCIEN` | erreur | mois mesuré hors de la fenêtre [extraction − 1 mois, extraction] |
| `ONGLET_MANQUANT`, `COLONNE_MANQUANTE` | erreur | onglet obligatoire absent, nom de colonne (ligne 5) modifié |
| `COMPTEUR_METADATA` | erreur | `nb_lignes_<JEU>` ≠ nombre de lignes réel |
| `REFERENCE_CROISEE` | avertissement | `site_id` / `produit_id` / … cité mais absent du jeu de référence |
| `DATE_MAL_FORMEE`, `NOMBRE_INVALIDE`, `BOOLEEN_INVALIDE`, `CHAMP_REQUIS_VIDE` | avertissement | format de champ |
| `NATURE_INCONNUE` | avertissement | `nature` hors vocabulaire contrôlé |
| `MOIS_COUVERT_INVALIDE` | avertissement | `mois_couvert_debut` d'une réquisition absent, mal formé ou hors du cycle PAQD déclaré — la réquisition est écartée de la promotion |
| `REFERENCE_NON_PROMUE` | avertissement | ligne non promue au core faute de dépendance |
| `RAFRAICHISSEMENT_DIFFERE` | avertissement | lot promu, rafraîchissement des scores échoué |

Convention de test (CLAUDE.md §3) : un cas passant **et** un cas échouant par
règle — voir `test/import-validation.test.ts`.

## Décisions de conception

- **Pas d'empreinte SHA-256.** L'idempotence vient de la promotion en upsert sur
  les identifiants mSupply, pas d'un hash de fichier (qui ne garantissait que le
  dédoublonnage exact, déjà couvert). Voir l'ADR 0002 et l'historique du grilling.
- **Lecture OOXML maison** (`fflate` + parsing XML) plutôt qu'`exceljs` : le seul
  besoin est de lire des chaînes brutes, cellule par cellule ; une bibliothèque
  de tableur complète serait une dépendance disproportionnée (CLAUDE.md §7).
- **Valeurs lues en texte, jamais réinterprétées** à la lecture : les dates
  restent des chaînes `AAAA-MM-JJ`, la validation et la promotion font les casts
  (avec garde regex). Évite les décalages de fuseau et les reconversions Excel.
- **`nature` : extraction d'abord, dérivation en secours.** La colonne `nature`
  du canevas V2 fait foi si elle est dans le vocabulaire ; sinon la promotion la
  dérive (`stock_take.invad_*` → ajustement ; puis `type_transaction` + `mode`).
- **Mois PAQD canonique = `to_char(mois_debut, 'YYYY-MM')`.** METADATA porte
  `mois_paqd` en `M+1..M+4` (rang dans le cycle) ; le mois calendaire vient de
  `mois_debut`. `import_lot.mois_paqd` stocke la forme `AAAA-MM`.
- **Immutabilité des cycles clos** : assurée en amont par la règle
  `MOIS_PAQD_TROP_ANCIEN` — un mois de cycle clos est rejeté avant d'atteindre le
  gel. Le gel lui-même ne touche qu'un seul mois.
- **Promotion tout-ou-rien** dans la transaction du lot ; le rafraîchissement est
  volontairement **hors** transaction (ADR 0003) pour qu'un `REFRESH` lent ou
  fautif ne perde pas un lot déjà promu.
- **Mois couvert d'une réquisition dérivé à la promotion** : `fact_requisition.mois_couvert`
  = `to_char(mois_couvert_debut, 'YYYY-MM')`, jamais le mois de `date_soumission`.
  Une réquisition compte pour le mois de son inventaire de référence de fin de
  mois. Un `mois_couvert_debut` mal formé écarte la ligne de la promotion (garde
  regex) après l'avoir signalée (`MOIS_COUVERT_INVALIDE`) ; l'import reste valide.

## Pièges connus

- `import_lot.id` est un `bigint` : `pg` le renvoie en **texte**. Le repository
  applique `Number(...)` — ne pas l'oublier pour tout nouvel identifiant bigint
  exposé par un DTO.
- `fact_inventaire` (en-tête) n'a pas de dé-duplication : deux lignes INVENTAIRES
  de même `inventaire_id` dans un lot font échouer la promotion (et donc rejettent
  le lot). C'est voulu — le canevas V2 garantit l'unicité à la source. Les
  **lignes** d'inventaire, elles, sont agrégées par `GROUP BY (inventaire,
  produit, lot)`.
- `dim_produit_traceur` est seedée (migration 0013) avec les **13 produits
  traceurs** de l'onglet PRODUITS du fichier d'extraction fourni par la DAP
  (`produit_code` = `item.code`). À revoir à chaque cycle si le panier évolue.
- Le gabarit `Canevas_Extraction_mSupply_DQA_v2.xlsx` contient une ligne
  d'exemple en ligne 6 : importé tel quel, il est rejeté (compteurs à 0 vs
  lignes d'exemple). C'est le comportement attendu — la DAP supprime la ligne
  d'exemple avant envoi.
