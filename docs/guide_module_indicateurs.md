# Guide du module Indicateurs

## Rôle

Expose en lecture seule les scores de qualité des données : liste des sites du
périmètre et détail par site (piliers, sous-composantes, statuts). Ne calcule
rien en TypeScript — lit les vues matérialisées et `hist_score_site`
(CLAUDE.md §3, ARCHITECTURE.md §2).

Emplacement : `apps/api/src/indicateurs/` (API) et `apps/web/src/app/pages/`
(écrans liste et détail).

## Points d'entrée

| Méthode | Chemin | Retour | Rôle |
|---|---|---|---|
| `GET` | `/api/sites` | `ScoreSite[]` | tout authentifié |
| `GET` | `/api/sites/:id?mois=&programmeId=` | `DetailSite` | tout authentifié |
| `GET` | `/api/referentiel/programmes` | `Programme[]` | tout authentifié |
| `GET` | `/api/referentiel/districts` | `string[]` | tout authentifié |

Filtres de `/api/sites` : `district`, `region`, `programmeId` (validés par
`filtreSitesSchema`).

## Données lues

| Source | Usage |
|---|---|
| `hist_score_site` | scores de pilier gelés par (site, mois PAQD, programme) |
| `mv_p5_concordance` | valeur mesurée de la concordance (%) |
| `mv_p6_ajustements` | valeur mesurée du ratio d'ajustements (%) |
| `grille_seuil_sous_composante` | seuil affiché, via `hist_score_site.grille_id` |
| `dim_site`, `dim_programme` | libellés, filtres |

`programme_id IS NULL` dans `hist_score_site` = agrégat « tous programmes ».
`mv_score_pilier` produit à la fois les lignes par programme et l'agrégat
(GROUPING SETS).

## Modèle de restitution

Cette tranche ne couvre que **P5 et P6**. `DetailSite` :

- `piliersCouverts = 2`, `piliersTotal = 6` ;
- `scoreComposite = null`, `classification = null` — **aucun score composite
  n'est affiché** tant que les six piliers ne sont pas là (décision du grilling,
  round 8) ;
- chaque `ScorePilier` porte une seule `MesureSousComposante` :
  `statut` = `CONFORME` (score 100) / `ALERTE` (score 0) / `NON_CALCULABLE`
  (score null), `raison` renseignée dans ce dernier cas.

## Décisions de conception

- **Statut binaire** (pas de PARTIEL) au niveau sous-composante : décision du
  grilling (D5). Le score de pilier vaut 100, 0 ou null.
- **`moisPaqd` nullable + `moisDisponibles`** dans `DetailSite` : permet un état
  vide propre (site sans mesure) et un sélecteur de mois qui n'apparaît que
  lorsqu'il y a plusieurs mois.
- **Seuil affiché = seuil de la grille du score gelé**, pas la grille courante :
  cohérent avec l'immutabilité des scores historisés (ADR 0003).
- **Front : validation Zod systématique des réponses** (`validerReponse`) — une
  réponse non conforme au contrat lève une erreur explicite plutôt que de
  propager des `undefined` (ARCHITECTURE.md §4). C'est la couture de test D.

## Administration des produits traceurs

`GET /api/admin/traceurs` (lecture, tout rôle), `PUT /api/admin/traceurs/:code`
et `DELETE /api/admin/traceurs/:code` (rôle `coordination`). La liste initiale
vient de la migration 0013 ; la coordination l'ajuste ensuite via l'écran
`/admin/traceurs`. Désactiver (`actif = false`) retire le produit des calculs
P5/P6 au prochain rafraîchissement sans perdre l'historique. `produit_code` doit
correspondre au `produit_code` du fichier d'extraction (= `item.code` mSupply).

## Pièges connus

- Les colonnes numériques de PostgreSQL (`numeric`) reviennent en **texte** via
  `pg` : le repository fait les `Number(...)`. Idem pour les `bigint`.
- `IS NOT DISTINCT FROM` est utilisé partout pour comparer `programme_id`
  (NULL = « tous programmes ») — ne pas remplacer par `=`, qui exclurait les
  lignes agrégées.
- La liste `/api/sites` ne montre que les sites `dans_perimetre_dqa`. Un site
  hors périmètre renvoie 404 sur le détail.
- Un site présent dans le core mais sans aucun mouvement ni inventaire du mois
  n'apparaît pas dans `mv_score_pilier` → il figure dans `/api/sites` avec des
  scores `null`, et son détail est en état vide.
