# Spec — Piliers P1 à P4, score composite et classification

Status: ready-for-agent
Feature: piliers-p1-p4-score-composite
Date: 2026-08-30

Références : `CONTEXT.md`, `docs/adr/0001`–`0005`, `docs/canevas_extraction_v2.md`,
`docs/guide_module_import.md`, `docs/guide_module_indicateurs.md`,
`.scratch/socle-import-p5-p6/spec.md` (tranche précédente).

---

## Problem Statement

Le tableau de bord ne calcule que deux piliers sur six (P5 concordance, P6 ratio
d'ajustements). L'écran de détail d'un site affiche « 2 piliers sur 6 » et aucun
score composite : impossible de classer un site, de le comparer aux autres, ou
de produire un état de conformité PAQD. Les équipes district ne peuvent pas
prioriser leurs supervisions, la coordination ne peut pas faire de revue de
performance, la DAP ne peut rien exporter pour un bailleur.

De plus, les réquisitions transmises par la DAP sont lues et stagées mais
jamais promues dans le core : la moitié des données nécessaires à P1 et P2
n'atteint jamais les calculs.

## Solution

Compléter le modèle à six piliers :

1. **`fact_requisition`** : nouvelle table de faits, alimentée par promotion
   depuis `stg_requisitions`.
2. **P1 — Complétude** (trois sous-composantes) : part des inventaires, des
   réquisitions et des réceptions attendus qui ont été saisis, sur le mois PAQD.
3. **P2 — Promptitude** (deux sous-composantes) : part des inventaires faits
   dans les trois derniers jours du mois, et des réquisitions soumises avant
   l'échéance réglementaire du mois suivant.
4. **P3 — Régularité de saisie** (une sous-composante) : part des jours
   ouvrables du mois avec au moins une sortie de stock enregistrée.
5. **P4 — Écart SDU produits traceurs** (deux sous-composantes) : amplitude de
   l'écart entre stock compté et stock théorique (**écart SDU**) ; amplitude de
   l'écart entre consommation déclarée et consommation reconstituée entre les
   deux inventaires bornant le mois (**écart consommation**).
6. **Score composite** : somme pondérée des six scores de pilier, avec
   renormalisation des poids quand un pilier entier est NON_CALCULABLE ; puis
   **classification** (CONFORME ≥ 90, PARTIELLEMENT CONFORME 75–89,
   NON CONFORME < 75).
7. Les écrans **détail site** et **liste des sites** montrent les six piliers,
   le score composite et la classification ; la liste est triée par score
   croissant (les sites en difficulté d'abord).

## User Stories

1. En tant qu'agent de district, je veux voir le score composite d'un site, afin de savoir en un coup d'œil s'il est en difficulté.
2. En tant qu'agent de district, je veux la classification du site (CONFORME / PARTIELLEMENT CONFORME / NON CONFORME), afin de prioriser mes visites.
3. En tant qu'agent de coordination, je veux la liste des sites triée par score composite croissant, afin de traiter d'abord les plus faibles.
4. En tant qu'agent de coordination, je veux filtrer la liste par district, région et programme, afin de cibler ma revue.
5. En tant qu'agent de district, je veux voir les six piliers sur la fiche d'un site, afin de comprendre ce qui tire le score vers le bas.
6. En tant qu'agent de district, je veux voir pour P1 les trois sous-composantes (inventaires, réquisitions, réceptions) séparément, afin d'identifier laquelle décroche.
7. En tant qu'agent de district, je veux voir pour P2 les deux sous-composantes (inventaires, réquisitions) séparément.
8. En tant qu'agent de district, je veux voir pour P4 les deux sous-composantes (écart SDU, écart consommation) séparément.
9. En tant qu'agent de district, je veux voir pour chaque sous-composante sa valeur mesurée, le seuil de la grille et son statut binaire.
10. En tant qu'agent de district, quand une sous-composante est NON_CALCULABLE, je veux la raison affichée, jamais un zéro muet.
11. En tant qu'agent de coordination, je veux que la complétude des inventaires soit « nombre de programmes gérés ayant un inventaire finalisé ce mois / nombre de programmes gérés ».
12. En tant qu'agent de coordination, je veux que la complétude des réquisitions soit « nombre de programmes gérés ayant une réquisition couvrant ce mois / nombre de programmes gérés ».
13. En tant qu'agent de coordination, je veux que la complétude des réceptions soit « réceptions enregistrées ce mois / factures fournisseur adressées ce mois », NON_CALCULABLE si aucune facture.
14. En tant qu'agent de coordination, je veux que la promptitude des inventaires ne compte que les inventaires datés dans les trois derniers jours du mois PAQD.
15. En tant qu'agent de coordination, je veux qu'un inventaire fait le 10 du mois ne compte pas pour la promptitude (trop tôt pour refléter le stock de fin de mois).
16. En tant qu'agent de coordination, je veux que la promptitude des réquisitions compare la date de soumission au jour limite (5 / 7 / 10) du mois suivant selon le type de structure du site.
17. En tant qu'agent de coordination, je veux que la régularité de saisie compte, pour un district, les distributions vers les sites rattachés comme des sorties de stock.
18. En tant qu'agent de coordination, je veux que la régularité ne compte que les jours ouvrables du calendrier (jours fériés exclus).
19. En tant qu'agent de coordination, je veux que l'écart SDU d'un site soit la moyenne, sur les produits traceurs, de `|compté − théorique| / théorique` au dernier inventaire du mois.
20. En tant qu'agent de coordination, je veux que l'écart consommation soit `|conso déclarée − conso reconstituée| / conso reconstituée`, où la conso reconstituée = stock du premier inventaire + réceptions − stock du dernier inventaire.
21. En tant qu'agent de coordination, je veux que l'écart consommation soit NON_CALCULABLE sans deux inventaires bornant le mois, ou si la consommation reconstituée est nulle.
22. En tant qu'agent de coordination, je veux que chaque sous-composante soit CONFORME ou ALERTE selon le seuil de la grille active pour le mois — jamais un seuil codé en dur.
23. En tant qu'agent de coordination, je veux que le seuil `écart consommation` existe dans la grille (2 %, sens « inférieur ou égal », par défaut).
24. En tant qu'agent de coordination, je veux que le score d'un pilier soit la moyenne simple de ses sous-composantes calculables (CONFORME = 100, ALERTE = 0).
25. En tant qu'agent de coordination, je veux que le score composite soit la somme pondérée des six scores de pilier.
26. En tant qu'agent de coordination, quand un pilier entier est NON_CALCULABLE, je veux qu'il sorte du score composite et que les poids des piliers restants soient renormalisés à 100 %.
27. En tant qu'agent de district, quand le score est calculé sur moins de six piliers, je veux que la fiche l'indique explicitement (« calculé sur N piliers »).
28. En tant qu'agent de coordination, je veux que le score composite et la classification soient figés dans l'historique du mois, référençant la grille utilisée (ADR 0003).
29. En tant qu'agent de coordination, je veux que les scores par programme portent aussi le composite et la classification.
30. En tant qu'agent de coordination, je veux que les réquisitions transmises par la DAP soient promues dans le core comme les autres faits, avec leur lot source.
31. En tant qu'agent de coordination, je veux qu'une réquisition compte pour son mois couvert (celui de son inventaire de référence), jamais pour le mois où elle est soumise.
32. En tant qu'agent de coordination, je veux qu'un `mois_couvert_debut` de réquisition mal formé ou hors du cycle déclaré soit signalé en avertissement, sans bloquer l'import.
33. En tant qu'agent de coordination, je veux qu'un ré-import du même classeur laisse `fact_requisition` identique (upsert sur `requisition_id`).
34. En tant qu'agent de coordination, je veux qu'une réquisition référençant un site absent du core ne soit pas promue et apparaisse en anomalie.
35. En tant qu'agent de district, je veux que la fiche site reste lisible en projection : score composite en grand, classification en couleur franche.
36. En tant qu'agent de district, je veux pouvoir changer le mois PAQD affiché quand plusieurs mois sont mesurés.
37. En tant qu'agent de district, je veux pouvoir filtrer la fiche site par programme géré, et voir le composite recalculé sur ce programme.
38. En tant qu'agent de coordination, je veux qu'un site sans aucune donnée du mois affiche un état vide, pas un score de zéro.
39. En tant qu'agent de coordination, je veux que seuls les sites `dans_perimetre_dqa` entrent dans la liste et les scores.
40. En tant qu'agent de coordination, je veux que le rafraîchissement des six vues et le gel restent hors de la transaction de promotion (ADR 0003).
41. En tant que développeur, je veux que le front rejette explicitement une réponse `DetailSite` ou `ScoreSite` non conforme au contrat plutôt que d'afficher un composite `undefined`.
42. En tant qu'agent de coordination, je veux que les scores historisés d'un mois déjà mesuré ne soient jamais recalculés rétroactivement lors d'un import ultérieur.

## Implementation Decisions

### Schéma

- **Nouvelle table `fact_requisition`** (couche core) : clé `requisition_id`
  (identifiant mSupply), `site_id` (FK `dim_site`), `programme_id` (FK
  `dim_programme`, nullable), `periode_id` (texte), `mois_couvert` (texte
  `AAAA-MM`, dérivé de `mois_couvert_debut`), `date_soumission`,
  `date_inventaire_ref`, `date_reception` (dates), `statut`,
  `statut_autorisation`, `type_requisition`, `lot_id_source`, `maj_le`.
  Index sur `(site_id, mois_couvert)`.
- **Grille** : migration ajoutant la ligne `ecart_consommation` à la grille v1
  (`seuil = 2`, `sens = inf`, `unite = pct`), en `ON CONFLICT DO NOTHING`.
- **Vues matérialisées** (une par pilier, comme `mv_p5_*` / `mv_p6_*`) :
  `mv_p1_completude`, `mv_p2_promptitude`, `mv_p3_regularite`, `mv_p4_ecart`.
  Chacune par `(site_id, mois_paqd, programme_id)` + agrégat « tous
  programmes » (`GROUPING SETS`, même motif que l'existant), filtrées sur
  `dim_site.dans_perimetre_dqa`.
- **`mv_score_pilier` refondue** : six colonnes `p_completude`,
  `p_promptitude`, `p_regularite`, `p_ecart_sdu`, `p_concordance`,
  `p_ajustements` — chacune 100 / 0 / NULL. Plus une colonne `score_composite`
  (renormalisation) et `classification`.
- **`hist_score_site`** : colonnes `p_*` déjà présentes (migration 0007) ;
  `score_composite` et `classification` désormais renseignés.
- **Procédure `rafraichir_et_geler`** : rafraîchit les six vues + `mv_score_pilier`
  dans l'ordre, puis gèle les six `p_*`, `score_composite`, `classification`
  pour le seul mois du lot.

### Définition des piliers

Toutes les grandeurs sont en pourcentage, par `(site, mois PAQD, programme)` ;
la variante « tous programmes » retire le filtre programme.

| Pilier | Sous-composante | Numérateur / Dénominateur | Seuil (grille) |
|---|---|---|---|
| **P1** | complétude inventaires | programmes gérés avec ≥ 1 `stock_take` finalisé dans le mois / nombre de programmes gérés (`dim_site_programme` actif) | = 100, sup |
| | complétude réquisitions | programmes gérés avec ≥ 1 réquisition `mois_couvert = mois PAQD` / programmes gérés | = 100, sup |
| | complétude réceptions | transactions `nature = reception` finalisées dans le mois / transactions `nature = facture_fournisseur` du mois ; **NON_CALCULABLE si dénominateur = 0** | = 100, sup |
| **P2** | promptitude inventaires | programmes gérés avec un `stock_take` finalisé daté dans **`[mois_fin − 2, mois_fin]`** / programmes gérés | ≥ 65, sup |
| | promptitude réquisitions | réquisitions du mois soumises (`date_soumission`) ≤ `jour_limite_requisition` du mois M+1 / réquisitions attendues (= programmes gérés) | ≥ 65, sup |
| **P3** | régularité de saisie | jours ouvrables du mois (`dim_temps` `est_ouvrable`) avec ≥ 1 `fact_transaction` `nature ∈ {dispensation, distribution}` confirmée ce jour / jours ouvrables du mois | ≥ 65, sup |
| **P4** | écart SDU | moyenne sur les produits traceurs de `|quantite_comptee − quantite_theorique| / quantite_theorique · 100` au **dernier** inventaire finalisé du mois ; **NON_CALCULABLE si aucun** | ≤ 2, inf |
| | écart consommation | `|conso_declaree − conso_reconstituee| / conso_reconstituee · 100` ; `conso_reconstituee = stock_debut + receptions − stock_fin` entre le **premier** et le **dernier** inventaire finalisé du mois ; `conso_declaree = Σ quantite_unitaire` des lignes de transactions `nature = dispensation` sur l'intervalle ; **NON_CALCULABLE si < 2 inventaires bornants ou `conso_reconstituee = 0`** | ≤ 2, inf |
| **P5**, **P6** | *(inchangés — tranche précédente)* | | |

`receptions` (pour l'écart consommation) = Σ `quantite_unitaire` des lignes de
transactions `nature = reception` sur l'intervalle, pour les produits traceurs.

### Score composite (renormalisation)

```
piliers_calculables = { P : score_pilier(P) ≠ NULL }
si piliers_calculables = ∅            → score_composite = NULL, classification = NULL
sinon
  poids_total = Σ poids(P) pour P ∈ piliers_calculables
  score_composite = Σ ( score_pilier(P) · poids(P) ) / poids_total    (arrondi au dixième)
  classification  = CONFORME si ≥ 90 ; PARTIELLEMENT_CONFORME si ≥ 75 ; NON_CONFORME sinon
```

Le nombre de piliers calculables est exposé (`piliersCouverts`) pour l'affichage
« calculé sur N piliers ».

### Promotion

- Nouvelle étape dans `PromotionService`, après `fact_inventaire_ligne` :
  `stg_requisitions` → `fact_requisition`. `mois_couvert = to_char(mois_couvert_debut::date, 'YYYY-MM')`
  avec garde regex ; jointure obligatoire sur `dim_site` (sinon anomalie
  `REFERENCE_NON_PROMUE`, ligne ignorée) ; `dim_programme` en jointure externe.
  Upsert `ON CONFLICT (requisition_id)`.
- `anomaliesReferences` gagne une requête pour les réquisitions non promues.

### Validation

- Nouvelle règle `MOIS_COUVERT_INVALIDE` (avertissement, non bloquante) :
  `mois_couvert_debut` absent, non `AAAA-MM-JJ`, ou hors des mois du
  `cycle_paqd` déclaré. Ajoutée à `ValidationService` et au contrat des jeux.

### Contrats (`@dqa/contracts`)

- `SOUS_COMPOSANTES` += `ecart_consommation` ; `PILIER_DE_SOUS_COMPOSANTE`,
  `LIBELLES_SOUS_COMPOSANTE`, `SOUS_COMPOSANTES_DU_PILIER` mis à jour (P4 → deux).
- `DetailSite` : `piliersCouverts` reflète le nombre de piliers calculés (≤ 6) ;
  `scoreComposite` et `classification` désormais renseignés quand calculables ;
  `piliers` contient les six `ScorePilier`.
- `ScoreSite` : `scoreComposite` et `classification` renseignés ; le tri est une
  décision serveur (voir API).
- Aucun changement de forme sur `MesureSousComposante` / `ScorePilier`.

### API

- `GET /api/sites` : tri par `score_composite` **croissant**, `NULL` en dernier
  (les sites sans mesure en fin de liste). Filtres inchangés (district, région,
  programme).
- `GET /api/sites/:id` : renvoie les six piliers. `piliersCouverts` = nombre de
  scores de pilier non nuls.
- Endpoints inchangés par ailleurs ; aucun nouvel endpoint.

### Front

- **Détail site** : bloc d'en-tête avec le score composite (grand, tabular-nums)
  et un badge de classification coloré (vert / ambre / rouge) ; mention
  « calculé sur N piliers sur 6 » si N < 6 ; les six cartes de pilier, P1 avec
  trois sous-composantes, P2 et P4 avec deux. Le badge « 2 piliers sur 6 »
  disparaît.
- **Liste des sites** : colonnes score composite + badge classification ; tri
  serveur respecté ; la colonne P5/P6 devient « score » (composite).
- Nouveau composant `badge-classification` (à côté de `badge-statut`).
- `SitesService` inchangé dans sa forme ; la validation Zod couvre les champs
  désormais renseignés.

## Testing Decisions

Un bon test vérifie un **comportement observable** : le score qu'obtient un
site, sa classification, la forme de la réponse HTTP, une ligne d'anomalie —
jamais la structure d'une vue SQL ni l'appel d'une méthode privée. Base
PostgreSQL **éphémère** (testcontainers), jamais mockée (`CLAUDE.md` §3). Une
règle de validation = un cas passant **et** un cas échouant.

### Couture B — vues d'indicateurs (principale)

Étend `test/indicateurs.test.ts`. Fixtures de core fabriquées à la main
(`dim_site_programme`, `fact_requisition`, paires d'inventaires,
`fact_transaction` réparties sur des jours ouvrables) → `CALL rafraichir_et_geler`
→ assertions sur chaque `mv_p*` et sur `mv_score_pilier` / `hist_score_site`.

Cas minimaux :
- P1a : tous les programmes inventoriés → 100 ; un programme manquant → < 100 → ALERTE.
- P1b : idem réquisitions via `mois_couvert`.
- P1c : réceptions = factures → CONFORME ; aucune facture → NON_CALCULABLE.
- P2a : inventaire dans les 3 derniers jours → compte ; inventaire le 10 → ne compte pas.
- P2b : réquisition soumise avant / après le jour limite selon `type_structure`.
- P3 : ≥ 65 % des jours ouvrables avec sortie → CONFORME ; en dessous → ALERTE ; distributions comptées pour un district.
- P4 écart SDU : moyenne des écarts ≤ 2 % → CONFORME ; au-dessus → ALERTE ; aucun inventaire traceur → NON_CALCULABLE.
- P4 écart consommation : deux inventaires + réceptions → valeur attendue ; un seul inventaire → NON_CALCULABLE ; conso reconstituée nulle → NON_CALCULABLE.
- Composite : six piliers présents → somme pondérée exacte ; un pilier NON_CALCULABLE → poids renormalisés ; bornes de classification (90, 75).
- Gel : `hist_score_site` porte les six `p_*`, `score_composite`, `classification`, `grille_id` ; un re-gel ne duplique pas.

### Couture A — frontière HTTP

Étend `test/import.test.ts` / `test/lecture-indicateurs.test.ts`. `POST /api/imports`
d'un classeur complet (REQUISITIONS peuplé, produit traceur seedé) →
`fact_requisition` alimenté → `GET /api/sites/:id` rend les six piliers +
composite + classification conformes à `detailSiteSchema` → `GET /api/sites`
trié par score croissant.

### Couture C — règle de validation

Étend `test/import-validation.test.ts` : un cas passant + un cas échouant pour
`MOIS_COUVERT_INVALIDE`.

### Couture D — services HTTP Angular

Étend `apps/web/src/app/core/valider-reponse.test.ts` : un `DetailSite` à six
piliers avec `scoreComposite` et `classification` passe ; un composite hors
[0, 100] ou une classification inconnue lève.

## Out of Scope

- Les écrans **synthèse nationale** et **scores par programme national** ; le
  filtre programme **global** (hors écran détail site).
- Les **courbes de progression** M+1 → M+4.
- L'affichage **détaillé par produit** de l'écart SDU et de l'écart consommation
  (calculés au niveau site ici ; le drill-down produit viendra plus tard).
- Les **UI d'administration** de la grille de paramètres et des comptes.
- Les **fêtes mobiles** dans `dim_temps` (Pâques, Aïd, Maouloud) : le calendrier
  ne contient que les fériés fixes de Côte d'Ivoire ; à compléter cycle par
  cycle dans `jour_ferie`, hors de cette tranche.
- Toute évolution du **contrat d'extraction V2** : les colonnes nécessaires
  (`mois_couvert_debut`, `type_structure`, `jour_limite_requisition`,
  `date_soumission`…) y sont déjà.

## Further Notes

- **Confirmations DAP** (n'empêchent pas de démarrer) : que
  `type_structure` et `jour_limite_requisition` soient bien renseignés dans
  l'extraction pour tous les sites du périmètre ; que `mois_couvert_debut` des
  réquisitions corresponde au mois de l'inventaire de référence ; sémantique
  `si` / `rc` (déjà actée : `si` = facture fournisseur, `rc` = réception).
- **Seuil `ecart_consommation`** : mis par défaut à 2 % comme l'écart SDU ;
  la coordination pourra l'ajuster via la grille (quand l'UI grille existera).
- **`score par programme` national** : `hist_score_site` porte déjà la
  dimension programme et le composite par programme ; l'agrégation nationale
  (moyenne + répartition) est un simple ajout de lecture, prévu pour la tranche
  « écrans nationaux ».
- Après cette tranche, le badge « n piliers sur 6 » n'a de sens que
  transitoirement (données incomplètes) ; en régime normal les six piliers
  sont calculés.
