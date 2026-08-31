# Spec — Écrans nationaux : synthèse et scores par programme

Status: ready-for-agent
Feature: ecrans-nationaux
Date: 2026-08-31

Références : `CONTEXT.md`, `ARCHITECTURE.md` §3–§4, `CLAUDE.md` §3/§8,
`DESIGN_SYSTEM.md`, `docs/guide_module_indicateurs.md`,
`.scratch/piliers-p1-p4-score-composite/spec.md` (tranche précédente, fusionnée
dans `master`).

---

## Problem Statement

Le tableau de bord n'a aucune vue agrégée. On voit chaque site isolément (liste
+ fiche) mais jamais l'état national : combien de sites conformes ce mois, quel
score composite moyen, quels piliers décrochent au niveau national, quel
programme de santé est le plus faible, quels districts sont en difficulté.

Conséquences : la coordination nationale ne peut pas ouvrir une revue de
performance avec un état des lieux ; la DAP ne peut pas produire un chiffre de
conformité par cycle pour un bailleur ; personne ne peut cibler un district ou
un programme sans éplucher les 40 fiches une par une.

`ARCHITECTURE.md` §3 et §4 réservent déjà `GET /api/synthese` →
`SyntheseNationale` et décrivent l'écran « projeté en réunion » : il n'existe
pas encore.

## Solution

1. **Vue matérialisée `mv_synthese_nationale`** : agrège `hist_score_site`
   (déjà porteur du score composite, de la classification et de la dimension
   programme depuis la tranche précédente) par mois PAQD, à trois niveaux —
   national, par district, par programme — chacun décliné « tous programmes »
   ou pour un programme donné. Rafraîchie par `rafraichir_et_geler`, après le
   gel de l'historique.

2. **`GET /api/synthese?mois=&programmeId=&region=`** → `SyntheseNationale` :
   indicateurs nationaux (score moyen, répartition des classifications,
   moyenne par pilier), ventilation par district, et section « scores par
   programme ». `moisPaqd` nullable + `moisDisponibles` comme pour la fiche
   site. `GET /api/referentiel/regions` complète les référentiels de filtre.

3. **Écran `/synthese`** (nouvelle route, la liste des sites reste l'accueil) :
   bloc national dense et lisible à distance, six moyennes de pilier, tableau
   par district, tableau des scores par programme. Sélecteurs mois / programme
   / région. Lien « Synthèse nationale » dans l'en-tête.

## User Stories

1. En tant qu'agent de coordination, je veux le score composite moyen national du mois, afin d'ouvrir une revue de performance avec un chiffre.
2. En tant qu'agent de coordination, je veux la répartition des sites du périmètre entre CONFORME, PARTIELLEMENT CONFORME, NON CONFORME et SANS MESURE, afin de voir l'ampleur du problème.
3. En tant qu'agent de coordination, je veux que les sites sans score du mois soient comptés comme SANS MESURE, jamais comme NON CONFORME ni exclus du dénominateur.
4. En tant qu'agent de coordination, je veux la moyenne nationale de chacun des six piliers, afin d'identifier le pilier qui tire le pays vers le bas.
5. En tant qu'agent de coordination, je veux une ventilation par district : nombre de sites, score moyen, répartition des classifications, afin de cibler les visites de supervision.
6. En tant qu'agent de coordination, je veux filtrer la synthèse par région, afin de préparer une réunion régionale.
7. En tant qu'agent de coordination, je veux le score national de chaque programme de santé (moyenne du score composite par programme sur les sites qui le gèrent), afin de savoir quel programme prioriser.
8. En tant qu'agent de coordination, je veux voir pour chaque programme le nombre de sites qui le gèrent et le nombre pour lesquels un score a pu être calculé, afin de juger la fiabilité du score national du programme.
9. En tant qu'agent de coordination, je veux filtrer toute la synthèse (national, districts, piliers) par programme, afin de voir l'état national d'un seul programme.
10. En tant qu'agent de coordination, je veux choisir le mois PAQD affiché quand plusieurs mois sont mesurés, et voir le plus récent par défaut.
11. En tant qu'agent de district, je veux cliquer sur une ligne de district pour ouvrir la liste des sites déjà filtrée sur ce district.
12. En tant qu'agent de coordination, je veux que seuls les sites `dans_perimetre_dqa` entrent dans les moyennes et les comptes.
13. En tant qu'agent de coordination, je veux que le score moyen national ne soit calculé que sur les sites qui ont un score (moyenne des non-nuls), et que le nombre de sites mesurés soit affiché à côté.
14. En tant qu'agent de coordination, je veux qu'un mois sans aucun site mesuré affiche un état vide explicite, pas des zéros.
15. En tant que développeur, je veux que le front rejette une réponse `SyntheseNationale` non conforme au contrat plutôt que d'afficher des `undefined`.
16. En tant qu'agent de coordination, je veux que la synthèse d'un mois déjà mesuré ne change pas lors d'un import ultérieur d'un autre mois (cohérent avec l'immutabilité de `hist_score_site`, ADR 0003).
17. En tant qu'agent de coordination, je veux que le rafraîchissement de `mv_synthese_nationale` reste hors de la transaction de promotion et n'échoue pas le lot s'il échoue (ADR 0003).
18. En tant qu'agent de coordination, je veux que la moyenne par pilier au niveau national soit la moyenne des scores de pilier gelés non nuls (100 / 0), afin qu'elle se lise comme un « pourcentage de sites conformes sur ce pilier ».
19. En tant qu'agent de coordination, je veux que la ventilation par district n'affiche que les districts ayant au moins un site du périmètre.
20. En tant qu'agent de coordination, je veux que la section « scores par programme » liste tous les programmes gérés par au moins un site du périmètre, même ceux sans aucune mesure ce mois (score national nul, couverture 0).
21. En tant qu'agent de district, je veux que l'écran reste lisible en projection : score moyen en grand, répartition en couleurs franches, tableaux denses mais aérés.

## Implementation Decisions

### Schéma

- **Nouvelle vue matérialisée `mv_synthese_nationale`** (couche indicateurs).
  Colonnes : `mois_paqd`, `programme_id` (nullable = « tous programmes »),
  `region` (nullable), `district` (nullable), `nb_sites`, `nb_mesures`,
  `score_composite_moyen` (numeric(5,1), nullable), `nb_conforme`,
  `nb_partiellement_conforme`, `nb_non_conforme`, `nb_sans_mesure`,
  `moy_p_completude`, `moy_p_promptitude`, `moy_p_regularite`,
  `moy_p_ecart_sdu`, `moy_p_concordance`, `moy_p_ajustements` (chacune
  numeric(5,1) nullable). Index unique sur
  `(mois_paqd, coalesce(programme_id,''), coalesce(region,''), coalesce(district,''))`.
  `district` non nul ⟹ `region` non nul (hiérarchie fonctionnelle).

- **Grain produit** — deux branches `UNION ALL` :
  - branche « tous programmes » (lignes `hist.programme_id IS NULL`) :
    `GROUPING SETS ((mois), (mois, region), (mois, region, district))` ;
  - branche « par programme » (lignes `hist.programme_id IS NOT NULL`,
    restreintes aux sites gérant le programme) :
    `GROUPING SETS ((mois, prog), (mois, prog, region), (mois, prog, region, district))`.
  Le filtre `region` de l'API sélectionne alors des lignes existantes, sans
  ré-agrégation applicative.

- **Source des lignes** : produit `dim_site` (périmètre) × mois PAQD présents
  dans `hist_score_site`, en `LEFT JOIN` sur `hist_score_site` :
  - pour les niveaux « tous programmes » : jointure sur les lignes
    `hist_score_site.programme_id IS NULL` ;
  - pour les niveaux « un programme » : jointure sur les lignes
    `hist_score_site.programme_id = <programme>`, en ne gardant côté `dim_site`
    que les sites qui **gèrent** ce programme (`dim_site_programme` actif).
  Un site du périmètre sans ligne `hist` pour le mois compte dans `nb_sites`
  et dans `nb_sans_mesure` (US 3, 14).

- **Agrégats** :
  - `nb_sites` = nombre de sites du périmètre concernés (pour les niveaux
    programme : sites gérant le programme) ;
  - `nb_mesures` = sites avec `score_composite` non nul ;
  - `score_composite_moyen` = `round(avg(score_composite), 1)` sur les non-nuls
    (`NULL` si `nb_mesures = 0`) ;
  - `nb_conforme` / `nb_partiellement_conforme` / `nb_non_conforme` = comptes
    par `classification` ; `nb_sans_mesure = nb_sites − nb_mesures` ;
  - `moy_p_*` = `round(avg(p_*), 1)` sur les non-nuls (US 18).

- **`rafraichir_et_geler`** : ajoute
  `REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale` **après** l'`INSERT`
  dans `hist_score_site` (elle lit l'historique fraîchement gelé). Reste hors
  de la transaction du lot (déjà le cas, `RafraichissementService`).

### Contrats (`@dqa/contracts`)

Nouveaux schémas Zod (primaires ; types par `z.infer`) :

```
repartitionClassification = {
  CONFORME: number ≥ 0 (int),
  PARTIELLEMENT_CONFORME: number,
  NON_CONFORME: number,
  SANS_MESURE: number,
}

blocSynthese = {
  nbSites: number, nbMesures: number,
  scoreCompositeMoyen: Pourcentage | null,
  repartition: repartitionClassification,
}

ligneDistrictSynthese  = blocSynthese & { district: string }
ligneProgrammeSynthese = blocSynthese & { programmeId: string, programmeNom: string, nbSitesGerant: number }

syntheseNationale = {
  moisPaqd: MoisPaqd | null,
  moisDisponibles: MoisPaqd[],
  programmeId: string | null,           // filtre programme appliqué
  region: string | null,                // filtre région appliqué
  national: blocSynthese & {
    moyennesPiliers: { pilier: Pilier, moyenne: Pourcentage | null }[],  // 6 entrées, ordre P1..P6
  },
  parDistrict: ligneDistrictSynthese[], // trié par score moyen croissant, NULL en dernier
  parProgramme: ligneProgrammeSynthese[], // trié par score national croissant, NULL en dernier
}
```

- `parProgramme` ignore le filtre `programmeId` (toujours tous les programmes) ;
  il respecte le filtre `region`.
- `MesureSousComposante`, `ScorePilier`, `ScoreSite`, `DetailSite` : inchangés.

### API

- **`GET /api/synthese`** (tout authentifié) — query `mois?`, `programmeId?`,
  `region?` validés par un `syntheseQuerySchema`. Le repository lit
  `mv_synthese_nationale` (+ `dim_programme` pour les libellés, + un compte
  `dim_site_programme` pour `nbSitesGerant`). Aucun calcul en TypeScript
  au-delà du façonnage DTO (CLAUDE.md §3, ARCHITECTURE §2).
  - `mois` : le plus récent de `moisDisponibles` par défaut ; `moisDisponibles`
    = mois distincts de `mv_synthese_nationale`.
  - `national` : ligne `(mois, programmeId|NULL, region|NULL, district=NULL)`.
  - `parDistrict` : lignes `(mois, programmeId|NULL, region, district)` avec
    `district` non nul, `region` = filtre ou toutes.
  - `parProgramme` : lignes `(mois, programme, region|NULL, district=NULL)`
    pour tous les programmes — ignore le filtre `programmeId`, respecte
    `region`.
- **`GET /api/referentiel/regions`** → `string[]` (régions distinctes des sites
  du périmètre, triées), sur le modèle de `/districts`.
- Endpoints existants inchangés.

### Front

- **Route `/synthese`** (`gardeAuthentifie`), lazy-loaded. La liste des sites
  reste `/`. En-tête : ajouter le lien « Synthèse nationale ».
- **Composant `pages/synthese.ts`** :
  - Sélecteurs mois (si `moisDisponibles.length > 1`), programme, région.
  - **Bloc national** : `scoreCompositeMoyen` en très grand (tabular-nums),
    mention « calculé sur N sites sur M » ; barre de répartition à quatre
    segments (vert / ambre / rouge / gris SANS MESURE) avec les comptes.
  - **Moyennes par pilier** : six lignes `P{n} — libellé` + valeur (barre
    horizontale sobre, pas de gradient). `—` explicite si `null`.
  - **Tableau par district** : district | nb sites | mesurés | score moyen |
    mini-répartition ; ligne cliquable → `/` (liste) avec le district
    présélectionné (query param ou route state).
  - **Section « Scores par programme »** : programme | gérés | mesurés | score
    national | mini-répartition. Toujours visible, sous les indicateurs
    nationaux.
  - **État vide** : si `moisPaqd === null` ou `national.nbMesures === 0`,
    phrase explicite (« Aucun site n'a encore de score pour ce mois »).
- **`SyntheseService`** (`core/synthese.service.ts`) : `synthese(opts)` valide
  la réponse avec `syntheseNationaleSchema` (`validerReponse`). Ajouter
  `regions()` à `SitesService` ou un petit `ReferentielService`.
- **Composant `ui/repartition-classification.ts`** : la barre à quatre segments,
  réutilisable (bloc national + lignes de tableau en version compacte).

## Testing Decisions

Base PostgreSQL **éphémère** (testcontainers), jamais mockée (CLAUDE.md §3).
Un test vérifie un **comportement observable** : un agrégat de la vue, la forme
d'une réponse HTTP — jamais la structure interne d'une vue.

### Couture B — `mv_synthese_nationale` (principale)

Nouveau `test/synthese.test.ts`. Fixtures de `hist_score_site` fabriquées à la
main (plusieurs sites, districts, régions, programmes, un mois ; scores et
classifications variés ; un site du périmètre sans ligne `hist`) →
`REFRESH MATERIALIZED VIEW mv_synthese_nationale` → assertions :

- national : `nb_sites` = sites du périmètre ; `nb_mesures` = sites avec score ;
  `score_composite_moyen` = moyenne des non-nuls ; `nb_sans_mesure` = écart ;
  somme des quatre comptes = `nb_sites`.
- par district : un district à deux sites, un à un seul ; score moyen par
  district ; le site hors périmètre exclu.
- par programme : score national d'un programme = moyenne des composites par
  programme des sites gérant ce programme ; un programme géré mais sans mesure
  → ligne présente, score `NULL`, `nb_mesures = 0`.
- filtre programme : la ligne `(mois, programme, NULL)` ne mélange pas les
  données des autres programmes.
- moyennes par pilier : `moy_p_*` = moyenne des `p_*` gelés non nuls.
- mois : deux mois gelés → deux jeux de lignes indépendants ; regeler un mois
  ne modifie pas l'autre (US 16).
- `CALL rafraichir_et_geler` rafraîchit aussi `mv_synthese_nationale`.

### Couture A — frontière HTTP

Étend `test/lecture-indicateurs.test.ts` (ou `test/synthese-http.test.ts`) :
`POST /api/imports` d'un classeur → `GET /api/synthese` rend un objet conforme
à `syntheseNationaleSchema`, avec `national`, `parDistrict`, `parProgramme`
cohérents ; `GET /api/synthese?programmeId=…` restreint le national et les
districts au programme ; `GET /api/synthese?region=…` restreint les districts
et les programmes ; `GET /api/referentiel/regions` renvoie les régions du
périmètre. `GET /api/synthese` exige une authentification (401 sinon).

### Couture D — service HTTP Angular

Nouveau `apps/web/src/app/core/synthese.service.test.ts` (ou étend
`valider-reponse.test.ts`) : une `SyntheseNationale` complète passe ; un
`scoreCompositeMoyen` hors [0, 100], une classification inconnue dans une
répartition, ou `moyennesPiliers` à 5 entrées → lève une erreur explicite.

## Out of Scope

- Les **courbes de progression** M+1 → M+4 (`GET /api/sites/:id/historique`,
  `HistoriqueSite`) : tranche distincte, bien que `hist_score_site` en soit
  déjà la source.
- Le **drill-down par produit** de l'écart SDU / écart consommation.
- Les **UI d'administration** de la grille de paramètres et des comptes.
- Un **filtre programme persistant** entre écrans (état global) : chaque écran
  garde son propre sélecteur (DESIGN_SYSTEM §5).
- L'**export** (PDF / Excel) de la synthèse.
- Les **fêtes mobiles** dans `dim_temps`.
- Toute évolution du **contrat d'extraction V2**.

## Further Notes

- `hist_score_site` porte déjà, par (site, mois, programme), le
  `score_composite`, la `classification` et les six `p_*` : la vue est une
  pure agrégation de lecture, sans nouvelle logique de calcul de pilier.
- La moyenne par pilier au niveau national se lit comme « part des sites
  conformes sur ce pilier » puisque `p_* ∈ {100, 0, NULL}` (décision de la
  tranche précédente). C'est intentionnel et suffisant pour la V1.
- Le tri des tableaux (district, programme) par score croissant met les
  situations à traiter en tête, cohérent avec le tri de `GET /api/sites`.
- `region` et `district` sont tous deux des dimensions de la vue parce que le
  filtre région doit donner un score national **ré-agrégé** (moyenne pondérée
  par site), pas une moyenne de moyennes de districts.
