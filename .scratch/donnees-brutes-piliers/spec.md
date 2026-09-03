# Données brutes derrière les taux des piliers

Spec issue de la session `/grill-with-docs` du 2026-09-03. Couvre une demande :
afficher, en plus des taux par pilier et sous-composante, les chiffres bruts qui
les produisent (inventaires et réquisitions attendus / réalisés / à l'heure,
jours avec dispensation, mouvements et ajustements, stock théorique / physique
par produit).

Status: ready-for-agent

## Problem Statement

Le tableau de bord montre un taux par sous-composante, jamais le couple de
chiffres qui l'a produit. Un superviseur district ou la coordination lit
« P3 = 45 % » ou « P1 réceptions = 60 % » sans pouvoir dire que c'est « 14 jours
avec sortie sur 31 » ou « 3 réceptions sur 5 factures ». Conséquences :

- impossible de **vérifier une note** ou de l'expliquer à un site avec des
  chiffres ;
- impossible de pointer **quelle réquisition ou quel inventaire précis** est en
  retard ;
- au niveau national, aucune lecture de **combien de rapports mensuels
  (réquisitions) et d'inventaires de fin de mois** étaient attendus, ont été
  faits, l'ont été dans les délais, par type de structure ;
- pour un **produit traceur donné**, aucune vue des grandeurs sources (stock
  théorique / compté, réceptions, dispensations, ajustements).

Le drill-down P4 par produit existe déjà, mais il est isolé et ne suit pas de
patron généralisable.

## Solution

1. **Fiche site — comptes bruts dans chaque carte de pilier.** À côté du taux,
   le couple attendu / réalisé (et réalisé à l'heure quand la sous-composante
   porte un délai), lisible sans clic. Sous la carte, un dépliant `<details>`
   avec le détail ligne à ligne, cas fautifs en tête.
   - P1 : inventaires, réquisitions et réceptions du mois (attendu par programme
     géré / par facture).
   - P2 : chaque inventaire finalisé avec sa date et « dans les 3 derniers jours
     O/N » ; chaque réquisition avec date de soumission, date limite, « à
     l'heure O/N ».
   - P3 : bandeau calendaire du mois (case pleine = jour avec au moins une
     sortie de stock).
   - P4 · P5 : un seul tableau par produit traceur (théorique, compté, écart
     SDU, concordance, stock début / fin, réceptions, déclarée, reconstituée,
     écart consommation, statut). Le code produit ouvre la fiche produit-mois.
   - P6 : liste des seuls ajustements (date, produit, quantité, sens) avec
     « N ajustements sur M mouvements ».

2. **Fiche produit-mois.** Route partageable `/sites/:id/produits/:code?mois=`,
   produits traceurs uniquement : inventaires du mois pour ce produit,
   réceptions, dispensations (total + nombre de jours), ajustements, stock début
   et fin de mois.

3. **Onglet national « Rapports & inventaires »** dans `/synthese`. Par strate
   de structure : réquisitions attendues / réalisées / réalisées à l'heure, et
   les trois mêmes chiffres pour les inventaires de fin de mois. Ligne de total.
   Sélecteurs mois / région / programme (réutilisés de l'onglet existant).

4. **Gel.** Les couples de comptes sont figés mois par mois dans une table
   compagne, en même temps que les scores (extension de l'ADR 0007). Le détail
   ligne à ligne, lui, est lu en direct du core ; un avertissement apparaît
   quand le core a été ré-importé après le gel du mois consulté.

5. **Écran d'admin des strates.** Correspondance `type_structure → strate`
   éditée dans la console, comme les traceurs ou la grille.

## User Stories

### Explicabilité sur la fiche site

1. En tant que coordination, je veux voir le couple attendu / réalisé sur
   chaque carte de pilier, afin de comprendre le taux sans clic.
2. En tant qu'équipe district, je veux « 3 réceptions / 5 factures » à côté du
   taux P1 réceptions, afin de dire au site exactement ce qui manque.
3. En tant que coordination, je veux déplier un pilier pour voir chaque
   inventaire du mois avec sa date et « dans les 3 derniers jours O/N », afin
   d'identifier celui qui fait décrocher P2.
4. En tant qu'équipe district, je veux chaque réquisition listée avec sa date
   de soumission, sa date limite et « à l'heure O/N », afin d'agir sur le
   rapport en retard précis.
5. En tant que coordination, je veux les lignes fautives en tête et les lignes
   conformes repliées, afin qu'une revue projetée aille droit aux problèmes.
6. En tant que coordination, je veux P3 rendu en bandeau calendaire du mois,
   afin de voir le motif d'irrégularité d'un seul regard.
7. En tant qu'équipe district, je veux que P6 ne liste que les ajustements
   (date, produit, quantité, sens) avec « sur N mouvements », afin de voir ce
   qui a été ajusté sans parcourir les mouvements normaux.
8. En tant que coordination, je veux le tableau P4 / P5 fusionné par produit,
   afin de lire le détail des deux piliers au même endroit.
9. En tant que coordination, je veux qu'un code produit du tableau ouvre une
   fiche produit-mois, afin de creuser un produit.
10. En tant que coordination, je veux que le drill-down P4 existant suive le
    même patron que les autres piliers, afin que la fiche site soit cohérente.

### Fiche produit-mois

11. En tant que coordination, je veux une URL partageable pour une vue
    produit-mois, afin de l'envoyer en réunion.
12. En tant que coordination, je veux les inventaires du mois pour ce produit
    avec, côte à côte, le **stock théorique** (mSupply) et le **stock physique
    compté**, plus leur écart, afin de comprendre sa contribution P4 SDU / P5.
13. En tant que coordination, je veux le **stock disponible** du produit à
    chaque date de photo du mois (`fact_stock_snapshot`), afin de suivre son
    niveau réel dans le temps.
14. En tant que coordination, je veux, pour le mois, la **consommation
    reconstituée** (stock début + réceptions − stock fin) et la **consommation
    déclarée** (somme des dispensations saisies) côte à côte, avec leur écart,
    afin de voir la part « écart consommation » de P4.
15. En tant que coordination, je veux les réceptions du mois pour ce produit
    (date, quantité), afin de vérifier le terme « réceptions » de la
    consommation reconstituée.
16. En tant que coordination, je veux le total des dispensations du produit et
    le nombre de jours avec dispensation, afin de voir sa part de P3.
17. En tant que coordination, je veux les ajustements du produit (date,
    quantité, sens), afin de voir sa part de P6.
18. En tant que coordination, je veux le stock début et fin de mois du produit
    (les deux inventaires bornants), afin de suivre la formule de consommation
    reconstituée.
19. En tant que coordination, je veux la fiche produit-mois limitée aux
    produits traceurs, afin que la liste reste signifiante.

### Onglet national « Rapports & inventaires »

20. En tant que coordination, je veux un onglet national montrant, par strate
    de structure, les réquisitions attendues / réalisées / à l'heure, afin de
    piloter la complétude des rapports.
21. En tant que coordination, je veux les trois mêmes chiffres pour les
    inventaires de fin de mois, afin de suivre les deux livrables mensuels.
22. En tant que coordination, je veux filtrer cet onglet par mois, afin de
    comparer les cycles.
23. En tant que coordination, je veux filtrer par région, afin de me
    concentrer sur une zone.
24. En tant que coordination, je veux filtrer par programme, afin de voir la
    complétude d'un seul programme.
25. En tant que coordination, je veux que l'« attendu » soit compté par
    programme géré, afin que les chiffres se réconcilient avec P1 / P2.
26. En tant qu'équipe district, je veux lire les lignes de strate qui
    correspondent aux types de structure de mon district, afin de me situer.
27. En tant que coordination, je veux une ligne de total sur toutes les
    strates, afin d'avoir la vue nationale.

### Gel et historique

28. En tant que coordination, je veux les couples de comptes figés avec le
    score chaque mois, afin que les chiffres bruts d'un mois passé collent
    toujours à la note de ce mois.
29. En tant que coordination, je veux, quand je consulte un mois passé dont le
    core a été ré-importé après le gel, un avertissement visible que le détail
    live peut différer des comptes figés, afin de ne pas être induite en
    erreur.
30. En tant que coordination, je veux les couples de comptes disponibles pour
    les mois importés avant la livraison de cette fonctionnalité, afin de ne
    pas avoir de trou de plusieurs cycles.
31. En tant que coordination, je veux le détail ligne à ligne lu en direct du
    core, afin qu'il reflète toujours l'état courant de mSupply.

### Administration des strates

32. En tant que coordination, je veux éditer la correspondance
    `type_structure → strate` dans la console, afin qu'une valeur nouvelle du
    référentiel soit prise en compte sans migration.
33. En tant que coordination, je veux qu'un `type_structure` sans
    correspondance tombe dans une strate « Non classé » explicite, afin que
    rien ne disparaisse silencieusement des totaux nationaux.
34. En tant que lecteur, je veux que l'écran des strates soit en lecture seule
    pour moi, afin que seule la coordination change le classement.
35. En tant qu'admin, je veux qu'un changement de strate prenne effet à la
    consultation suivante sans ré-import, puisque la strate est un regroupement
    d'affichage, pas un chiffre gelé.

### Transverse

36. En tant qu'utilisateur, changer le mois ou un filtre ne doit jamais
    remonter la vue ni afficher un spinner plein écran (règle existante,
    `core/ressource`).
37. En tant qu'utilisateur, le détail ligne à ligne se charge au dépli, pas au
    chargement de la page, afin que la fiche site reste rapide.
38. En tant que coordination qui projette le tableau de bord, je veux des
    chiffres en `tabular-nums` et des légendes jamais tronquées.
39. En tant que développeur, je veux que les couples de comptes déjà calculés
    dans les vues soient exposés, pas recalculés, afin d'avoir une seule source
    de vérité.

## Implementation Decisions

### Schéma

- **`hist_pilier_brut`** — nouvelle table, format en lignes longues, grain
  `(site_id, mois_paqd, programme_id, mesure)`. Colonnes : `nb_attendu`,
  `nb_realise`, `nb_a_lheure` (nul quand la mesure ne porte pas de délai),
  `lot_id`, `calcule_le`. Mesures : `p1_inventaires`, `p1_requisitions`,
  `p1_receptions`, `p2_inventaires`, `p2_requisitions`, `p3_regularite`,
  `p4_ecart_sdu`, `p4_ecart_consommation` (produits dans la tolérance /
  produits évalués), `p5_concordance`, `p6_ajustements`. Alimentée par
  `rafraichir_et_geler` au même passage que `hist_score_site`.
- **`strate_structure`** — nouvelle table, `type_structure` (texte, PK) →
  `strate` (texte). Éditable dans la console. Un `type_structure` non
  référencé agrège sous une strate « Non classé ».
- **`mv_p1_completude` … `mv_p6_ajustements`** — le `SELECT` final expose les
  couples numérateur / dénominateur que les CTE calculent déjà
  (`nb_receptions` / `nb_factures`, `nb` / `nb_ot`, `nb_jours_avec_sortie` /
  `nb_jours_calendaires`, `nb_mouvements` / `nb_ajustements`, `nb_produits` /
  `nb_produits_conformes`). Le taux et le score ne changent pas.
- **`mv_synthese_rapports`** — nouvelle vue matérialisée. Agrège
  `hist_pilier_brut` (mesures `p1_requisitions`, `p1_inventaires`,
  `p2_requisitions`, `p2_inventaires`), jointe `dim_site → strate_structure`,
  groupée par `(mois_paqd, strate, region, programme_id)` avec GROUPING SETS
  pour les lignes « toutes régions » / « tous programmes », sur le modèle de
  `mv_synthese_nationale`. Rafraîchie par `rafraichir_et_geler`.
- **Backfill** — migration ou procédure idempotente rejouant le gel des comptes
  pour chaque `import_lot` validé sans lignes `hist_pilier_brut`, sur l'état
  courant du core.

### Sémantique du gel

- `rafraichir_et_geler` : REFRESH des `mv_p*` étendues, puis
  INSERT … ON CONFLICT dans `hist_pilier_brut` pour le mois du lot, puis REFRESH
  `mv_synthese_rapports`.
- Le détail ligne à ligne n'est jamais gelé : le repository le lit en direct des
  `fact_*`.
- Chaque réponse de détail porte `calculeLe` (de `hist_pilier_brut`) et
  `coreMajLe` (max `maj_le` des lignes de core sous-jacentes pour ce site / mois)
  ; le front affiche l'avertissement quand `coreMajLe > calculeLe`.

### Contrats API (`@dqa/contracts`)

- `DetailSite.piliers[]` porte `comptesBruts` : les couples figés du pilier,
  tableau de `{ mesure, libelle, attendu, realise, aLHeure | null }`.
- **`GET /api/sites/:id/piliers/:code`** (`code ∈ p1…p6`) → `DetailPilier`,
  union discriminée sur `code`. Chaque variante porte : `comptesBruts` figés, le
  détail live dans la forme propre au pilier (liste d'inventaires, de
  réquisitions, de réceptions / factures ; calendrier des jours pour P3 ; liste
  d'ajustements pour P6 ; lignes par produit pour P4 / P5), `calculeLe`,
  `coreMajLe`. La route `/piliers/p4` migre de `DetailP4Produits` vers la
  variante `p4` (lignes produit conservées ; P4 et P5 partagent le tableau
  produit).
- **`GET /api/synthese/rapports?mois=&region=&programmeId=`** →
  `SyntheseRapports` : lignes
  `{ strate, requisitions: { attendu, realise, aLHeure }, inventaires: { … } }`
  plus une ligne de total.
- **`GET /api/sites/:id/produits/:code?mois=`** → `FicheProduitMois` :
  `{ site, produit, moisPaqd, moisDisponibles,`
  `inventaires[]` (date, stock théorique mSupply, stock physique compté, écart),
  `snapshots[]` (date de photo, stock disponible),
  `receptions[]` (date, quantité),
  `dispensations: { total, nbJours }`,
  `ajustements[]` (date, quantité, sens),
  `consommation: { reconstituee, declaree, ecart }`,
  `stockDebut, stockFin` (inventaires bornants), `calculeLe, coreMajLe }`.
  404 si `code` n'est pas un traceur.
- Strates : `GET /api/admin/strates` (tout rôle),
  `PUT /api/admin/strates/:typeStructure` et `DELETE` (coordination). Forme
  `{ typeStructure, strate }`.
- Tous les nouveaux `query` params validés par des schémas Zod dans
  `@dqa/contracts` ; types par `z.infer`.

### Modules

- **API — `indicateurs`** : le repository gagne les lectures pour
  `/piliers/:code`, `/synthese/rapports`, `/produits/:code` ; le controller
  gagne les routes. Le module `admin` gagne le CRUD des strates.
- **Base** : migrations dans `/db/migrations`, numérotées, irréversibles ; les
  `mv_p*` étendues et `rafraichir_et_geler` remplacent leurs définitions
  antérieures ; nouvelles tables + `mv_synthese_rapports` + backfill.
- **Web** : `detail-site` — couples dans les cartes, `<details>` par pilier,
  composant calendrier P3, liste d'ajustements P6, tableau produit P4 / P5
  fusionné avec liens produit. Nouvelle route `/sites/:id/produits/:code` +
  page. `synthese` — onglet « Rapports & inventaires ». Nouvel écran
  `/admin/strates`. Toute la donnée via `core/ressource` (filtres synchronisés
  URL, pas de remontage).

### Interactions

- Les couples de comptes rendus dans la carte, toujours visibles,
  `tabular-nums`, sous forme « réalisé / attendu » (+ « N à l'heure » quand la
  sous-composante porte un délai).
- Détail ligne à ligne : `<details>`, lignes fautives d'abord, conformes
  ensuite — cohérent avec le rendu P4 actuel.
- P3 : bandeau de 28 à 31 cases pour le mois, case pleine = jour avec sortie,
  légende complète.
- P6 : tableau des seuls ajustements avec une légende « N ajustements sur M
  mouvements ».
- P4 / P5 : un tableau produit unique — par produit traceur, stock théorique
  (mSupply) et stock physique compté côte à côte, écart SDU, concordance,
  consommation reconstituée vs déclarée et son écart, statut. Le code produit
  est un lien vers la fiche produit-mois.
- Onglet national : tableau strate × { réquisitions, inventaires } ×
  { attendu, réalisé, à l'heure } ; sélecteurs mois / région / programme
  réutilisés ; ligne de total.
- Avertissement ré-import : note discrète en ligne sur le détail d'un pilier et
  sur la fiche produit-mois quand `coreMajLe > calculeLe`.

### Strate de structure

- Seed `strate_structure` : `CSU→CS`, `CSR→CS`, `ESPC→ESPC`, `HG→HG`,
  `CHR→CHR`, `CHU→CHU`, `District sanitaire→District`. « Institut » et toute
  valeur future : mappée par la coordination ; non mappée → « Non classé ».
- La strate est un regroupement d'affichage : un changement prend effet
  immédiatement, rien n'est gelé.

### Réconciliation

- L'« attendu » national est compté **par programme géré** (Σ programmes gérés
  des sites de la strate), dénominateur de P1 / P2. `mv_synthese_rapports`
  agrège donc les lignes par `(site, programme)` de `hist_pilier_brut`, pas par
  site.

### ADR

- Nouvel ADR « Gel des comptes bruts des piliers », extension de l'ADR 0007 :
  ce qui est gelé (les couples de comptes agrégés) vs live (le détail ligne à
  ligne) ; table compagne en lignes longues plutôt que des colonnes larges
  façon `sc_*` ; le contrat d'avertissement ré-import.

## Testing Decisions

Un bon test ici affirme le comportement externe — les chiffres qu'une méthode
de repository renvoie pour un état de core / historique fabriqué à la main —
jamais la forme d'une CTE intermédiaire ni le DOM d'un composant. Un cas
passant et un cas limite par mesure (ex. P1 réceptions avec zéro facture →
couple NON_CALCULABLE ; inventaire P2 daté pile au premier des 3 derniers jours
→ à l'heure).

Modules testés :

- **Couture 1 — vues + `rafraichir_et_geler` via `IndicateursRepository`**,
  base éphémère, lignes de core à la main : peuplement de `hist_pilier_brut`,
  couples exposés par les `mv_p*` étendues, stratification de
  `mv_synthese_rapports`, procédure de backfill, nouvelles lectures repository.
  Prior art : `test/synthese.test.ts`, `test/p4-produit.test.ts`,
  `test/historique.test.ts`.
- **Couture 2 — câblage d'import**, un test bout en bout `POST /api/imports`
  d'un classeur fabriqué, affirmant que `hist_pilier_brut` est peuplée et se
  réconcilie avec `hist_score_site`. Prior art : `test/promotion.test.ts`.
- **Couture 3 — admin des strates**, HTTP `GET` / `PUT` / `DELETE` avec
  contrôle de rôle (coordination écrit, lecteur 403). Prior art :
  `test/admin-traceurs.test.ts`.
- **Couture 4 — validation de contrat**, les nouveaux DTO (`DetailPilier`
  discriminé, `SyntheseRapports`, `FicheProduitMois`) valident des réponses
  d'API réelles ; une réponse malformée lève. Prior art : `validerReponse`
  côté front.
- **Logique pure front** : la construction du modèle de calendrier P3 (liste de
  jours → tableau de 28 à 31 cases) prend un test unitaire `apps/web` façon
  `ressource.test.ts`. Aucun test de composant (règle du dépôt).

## Out of Scope

- La vue opérationnelle sur **tous** les produits (pas seulement les traceurs)
  — différée ; la fiche produit-mois est traceur seulement pour l'instant.
- Une courbe de stock **quotidienne** sur la fiche produit-mois —
  `fact_stock_snapshot.date_photo` = date d'extraction (une poignée de photos
  par mois) : la fiche liste ces photos, elle n'interpole pas une série
  quotidienne.
- Le gel du détail ligne à ligne — il reste live par choix.
- Les agrégats nationaux des comptes bruts de P3, P5, P6 — l'onglet national
  couvre réquisitions + inventaires seulement (matière P1 / P2). P3 / P5 / P6
  restent au grain site.
- Un regroupement « type de programme » — le filtre programme existant suffit.
- Des grands livres transaction par transaction sur la fiche site — rôle de
  mSupply.
- Toute repondération ou recalcul d'un score — intouché ; cette fonctionnalité
  ne fait qu'exposer et geler des chiffres que les vues calculent déjà.

## Further Notes

- Les couples de comptes existent déjà dans chaque CTE des `mv_p*` (`nb` /
  `nb_ot`, `nb_jours_avec_sortie` / `nb_ouvrables`, `nb_receptions` /
  `nb_factures`, `nb_mouvements` / `nb_ajustements`, `nb_produits`) : le gros du
  travail est de les projeter, les geler, les exposer et les rendre, pas un
  nouveau calcul.
- « Rapport » = réquisition (formulaire R&R) ; voir `CONTEXT.md`. L'onglet
  national suit réquisitions et inventaires de fin de mois en parallèle, mêmes
  trois chiffres.
- La promptitude des inventaires au national reprend la règle P2 (finalisé
  dans les 3 derniers jours du mois).
- Glossaire déjà à jour (`CONTEXT.md`) : *Compte brut*, *Rapport mensuel*,
  *Strate de structure*.
