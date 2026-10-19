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
  │   ├─ PromotionService   calendrier complété, upsert stg_* → dim_*/fact_*
  │   │                     sur les clés mSupply, liste des traceurs reprise
  │   │                     de PRODUITS
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
| `COLONNE_V24_ABSENTE` | avertissement | colonne ajoutée par le canevas v2.4 (`date_finalisation`, `transaction_liee_id`, `date_finalisation_liee`, `type_structure_msupply`) absente : classeur d'un script antérieur, importé quand même |
| `COMPTEUR_METADATA` | erreur | `nb_lignes_<JEU>` ≠ nombre de lignes réel |
| `REFERENCE_CROISEE` | avertissement | `site_id` / `produit_id` / … cité mais absent du jeu de référence |
| `DATE_MAL_FORMEE`, `NOMBRE_INVALIDE`, `BOOLEEN_INVALIDE`, `CHAMP_REQUIS_VIDE` | avertissement | format de champ |
| `NATURE_INCONNUE` | avertissement | `nature` hors vocabulaire contrôlé |
| `MOIS_COUVERT_INVALIDE` | avertissement | `mois_couvert_debut` d'une réquisition absent, mal formé, postérieur au mois PAQD ou plus de 2 mois avant lui ; jamais pour une réquisition citée par une facture `si` du classeur ; seule une date mal formée écarte la ligne de la promotion |
| `TYPE_STRUCTURE_CONFLIT` | info | `type_structure_msupply` (catégorie mSupply) différent de `type_structure` (préfixe du nom, ADR 0021) : catégorie à corriger dans mSupply, le site est importé avec le type du préfixe |
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
  Exception : un `rc` devient toujours `encaissement` (reçu de paiement, ADR
  0018), même si un script antérieur au v2.4 l'a libellé `reception`.
- **Colonnes v2.4 facultatives.** `contrat-jeux.ts` les déclare dans
  `facultatives` : écrites en staging quand elles sont là, signalées
  (`COLONNE_V24_ABSENTE`) quand elles manquent, pour qu'un classeur produit
  par l'ancien script de la DAP reste importable pendant la transition. Les
  calculs qui en dépendent (complétude des réceptions) n'ont alors pas de
  donnée.
- **Mois PAQD canonique = `to_char(mois_debut, 'YYYY-MM')`.** METADATA porte
  `mois_paqd` en `M+1..M+4` (rang dans le cycle) ; le mois calendaire vient de
  `mois_debut`. `import_lot.mois_paqd` stocke la forme `AAAA-MM`.
- **Immutabilité des cycles clos** : assurée en amont par la règle
  `MOIS_PAQD_TROP_ANCIEN` — un mois de cycle clos est rejeté avant d'atteindre le
  gel. Le gel lui-même reconstitue **tous** les mois trouvables dans le core à
  l'instant de l'appel, pas seulement celui déclaré par le lot (ADR 0010) :
  des données arrivées en avance via la fenêtre d'extraction sont figées dès
  qu'elles apparaissent, sans attendre qu'un futur import redéclare leur mois.
- **Promotion tout-ou-rien** dans la transaction du lot ; le rafraîchissement est
  volontairement **hors** transaction (ADR 0003) pour qu'un `REFRESH` lent ou
  fautif ne perde pas un lot déjà promu.
- **Mois couvert d'une réquisition dérivé à la promotion** : `fact_requisition.mois_couvert`
  = `to_char(mois_couvert_debut, 'YYYY-MM')`, jamais le mois de `date_soumission`.
  Une réquisition compte pour le mois de son inventaire de référence de fin de
  mois. La validation accepte `mois_couvert_debut` dans `[mois PAQD - 2, mois
  PAQD]` : la fenêtre (du 1ᵉʳ jour de M-2 à la date d'extraction) déborde
  volontairement du mois mesuré et ramène des réquisitions des deux mois
  précédents (rattrapage), y compris à cheval sur deux cycles. Une réquisition
  citée par une facture `si` est admise quel que soit son mois : la
  complétude des réceptions en a besoin (ADR 0019). En dehors de cette plage : `MOIS_COUVERT_INVALIDE`
  (avertissement, non bloquant), mais la ligne est **quand même promue**. Seul
  un `mois_couvert_debut` mal formé l'écarte réellement de la promotion (garde
  regex côté SQL).

## Pièges connus

- `import_lot.id` est un `bigint` : `pg` le renvoie en **texte**. Le repository
  applique `Number(...)` — ne pas l'oublier pour tout nouvel identifiant bigint
  exposé par un DTO.
- `fact_inventaire` (en-tête) n'a pas de dé-duplication : deux lignes INVENTAIRES
  de même `inventaire_id` dans un lot font échouer la promotion (et donc rejettent
  le lot). C'est voulu — le canevas V2 garantit l'unicité à la source. Les
  **lignes** d'inventaire, elles, sont agrégées par `GROUP BY (inventaire,
  produit, lot)`.
- Même agrégation pour `fact_stock_snapshot` sur `(date_photo, site, produit,
  lot)` : quantité sommée, péremption la plus proche. mSupply répartit un même
  lot sur plusieurs `item_line`. Sans ce `GROUP BY`, l'upsert reçoit deux fois
  la même clé (« ON CONFLICT DO UPDATE command cannot affect row a second
  time ») et le lot entier est rejeté : c'est arrivé au lot du 2026-10-12
  (STOCK_ACTUEL, 3889 lignes pour 2699 clés). L'extraction agrège désormais
  aussi à la source.
- **Traceurs alimentés par l'import (ADR 0015).** Tout produit de l'onglet
  PRODUITS devient traceur actif ; un traceur absent du lot passe inactif. Un
  lot sans aucun produit ne touche pas à la liste. Conséquence : un fichier
  produit avec l'ancien script (les 5449 produits mSupply dans PRODUITS)
  ferait de tous les produits des traceurs. Les fichiers antérieurs au
  2026-10-13 sont à régénérer avant import. La migration 0013 ne sert plus que
  de liste de départ d'une base neuve.
- **`heure_inventaire` / `numero_inventaire` (canevas v2.3, ADR 0016).**
  Colonnes obligatoires en en-tête d'INVENTAIRES : leur absence rejette le
  classeur, ce qui écarte aussi tout fichier produit par un script antérieur.
  À la promotion, une heure hors `HH:MM[:SS]` valide ou un numéro non entier
  deviennent `NULL` (garde regex) plutôt que de faire échouer le lot ; le tri
  de l'inventaire retenu retombe alors sur `inventaire_id`.
- **Quantités en unités, jamais converties (ADR 0017, migration 0045).**
  `fact_ligne_transaction.quantite_unitaire` = `quantite` ; la taille de
  conditionnement est stockée pour information. En Côte d'Ivoire, mSupply
  saisit tout à l'unité de dispensation.
- **Calendrier complété à l'import** (migration 0043,
  `dqa.completer_calendrier`). La promotion ajoute les jours manquants de
  `dim_temps` de l'année précédant la fenêtre d'extraction à l'année suivant
  sa fin. Le seed 0008 s'arrêtait au 31/12/2027 alors que le programme court
  jusqu'en 2030. Les mois du lot (`mois_debut`/`mois_fin`) ne sont écrits
  dans `import_lot` qu'**après** la promotion : l'étape s'appuie sur la
  fenêtre, à défaut sur la date d'extraction.
- Le gabarit `Canevas_Extraction_mSupply_DQA_v2.xlsx` contient une ligne
  d'exemple en ligne 6 (gris italique) : importé vide, il est rejeté (compteurs
  à 0 vs lignes d'exemple). Les données s'écrivent **par-dessus** cette ligne ;
  une fois remplie, la ligne 6 est une vraie donnée et ne doit jamais être
  supprimée. Lot du 2026-10-12 : la première donnée, restée au style de
  l'exemple, a été supprimée à la main dans Excel sur 8 onglets, et le lot a
  été rejeté (compteur METADATA = réel + 1). La chaîne DAP
  (`csv_vers_canevas.py`) remet désormais une police normale et vérifie le
  classeur enregistré ; `--verifier <fichier>` refait ce contrôle.
- Le lecteur ne dépend pas de l'ordre des attributs XML. Excel écrit
  `<Relationship Id=… Target=…>`, openpyxl `<Relationship Target=… Id=…>` avec
  une cible absolue (`/xl/worksheets/…`). Une première version ne lisait que le
  premier ordre : un classeur produit par le script DAP et envoyé sans passer
  par Excel était lu sans aucun onglet, donc rejeté en bloc. Test :
  `test/lecture-classeur.test.ts`.
