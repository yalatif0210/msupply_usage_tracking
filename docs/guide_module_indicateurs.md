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
| `hist_score_site` | six scores de pilier + `score_composite` + `classification` gelés par (site, mois PAQD, programme) |
| `mv_p1_completude` | taux de complétude inventaires / réquisitions / réceptions (%), scores et p_completude |
| `mv_p2_promptitude` | taux de promptitude inventaires / réquisitions (%), scores et p_promptitude |
| `mv_p3_regularite` | taux de jours ouvrables avec sortie de stock (%) |
| `mv_p4_ecart` | taux de conformité écart SDU et écart consommation (%), scores et p_ecart_sdu |
| `mv_p5_concordance` | valeur mesurée de la concordance (%) |
| `mv_p6_ajustements` | valeur mesurée du ratio d'ajustements (%) |
| `grille_seuil_sous_composante` | seuil affiché, via `hist_score_site.grille_id` |
| `dim_site`, `dim_programme` | libellés, filtres |

`programme_id IS NULL` dans `hist_score_site` = agrégat « tous programmes ».
`mv_score_pilier` produit à la fois les lignes par programme et l'agrégat
(GROUPING SETS).

## Modèle de restitution

`DetailSite` porte **toujours les six `ScorePilier`** (P1..P6). Les six ont
désormais une vue d'indicateur ; une sous-composante donnée peut rester
`NON_CALCULABLE` (raison explicite) faute de données du mois, mais aucun pilier
n'est plus « pas encore outillé ».

**P1 — complétude des transactions** (`mv_p1_completude`) : trois
sous-composantes, seuil grille 100 %.
- `completude_inventaires` : programmes gérés (`dim_site_programme` actif) avec
  ≥ 1 inventaire finalisé ce mois ÷ programmes gérés.
- `completude_requisitions` : programmes gérés avec ≥ 1 réquisition
  `mois_couvert = mois PAQD` ÷ programmes gérés.
- `completude_receptions` : réceptions finalisées ce mois ÷ factures
  fournisseur du mois ; NON_CALCULABLE si aucune facture.

Une ligne P1 n'existe que pour un mois où le site a une activité (inventaire,
réquisition, réception ou facture) : un mois vide reste un état vide, pas un
score de zéro. Score de pilier P1 = moyenne simple des sous-composantes
calculables.

**P2 — promptitude des transactions** (`mv_p2_promptitude`) : deux
sous-composantes, seuil grille 65 %.
- `promptitude_inventaires` : inventaires finalisés du mois datés dans les
  trois derniers jours du mois ÷ inventaires finalisés du mois.
- `promptitude_requisitions` : réquisitions couvrant le mois soumises au plus
  tard le jour limite du mois suivant ÷ réquisitions couvrant le mois. Jour
  limite = `dim_site.jour_limite_requisition`, à défaut 5 (CSU/CSR/ESPC), 7
  (HG/CHR), 10 (autres).

Chacune NON_CALCULABLE si aucune transaction de la catégorie ce mois. Score de
pilier P2 = moyenne simple des sous-composantes calculables.

**P3 — régularité de saisie** (`mv_p3_regularite`) : jours ouvrables du mois
PAQD avec au moins une sortie de stock (`nature ∈ {dispensation, distribution}`
un jour `dim_temps.est_ouvrable`) ÷ jours ouvrables du mois. Sous-composante
unique `regularite_saisie`, seuil grille 65 %. NON_CALCULABLE si le site n'a
aucune sortie exploitable → pas de ligne dans la vue.

**P4 — écart SDU et écart consommation** (`mv_p4_ecart`) : deux sous-composantes
en **taux de conformité** (part des produits traceurs dans la tolérance de la
grille, pas une amplitude — spec §« P4 en taux de conformité »).
- `ecart_sdu` : `|théorique − compté| / compté ≤ tolérance` au dernier
  inventaire finalisé du mois par produit ; compté (réalité) au dénominateur.
  Cas limites : compté 0 / théorique 0 → conforme ; compté 0 / théorique > 0 →
  non conforme. NON_CALCULABLE si aucun produit traceur inventorié.
- `ecart_consommation` : `|déclarée − reconstituée| / reconstituée ≤ tolérance`
  entre le premier et le dernier inventaire du mois. `reconstituée =
  stock_début + réceptions − stock_fin` sur l'intervalle `(d_début, d_fin]`.
  Produit sans deux inventaires bornants ou reconstituée ≤ 0 → exclu.
  NON_CALCULABLE si aucun produit évaluable.

Le score de pilier P4 (`p_ecart_sdu`, hérité du nom historique) est la moyenne
simple des scores des deux sous-composantes calculables. Tolérance (2 %) et
seuil de taux (90 %) viennent de `grille_seuil_sous_composante.tolerance` /
`.seuil` — à confirmer avec la coordination PAQD.

- `piliersCouverts` = nombre de scores de pilier non nuls (2 aujourd'hui) ;
  `piliersTotal = 6`. L'écran affiche « Score calculé sur N piliers sur 6 »
  quand `N < 6`.
- `scoreComposite` = somme pondérée des scores de pilier calculables, divisée
  par la somme de leurs poids (renormalisation, spec §« Score composite »).
  `null` si aucun pilier n'est calculable.
- `classification` : `CONFORME` ≥ 90, `PARTIELLEMENT_CONFORME` ≥ 75, sinon
  `NON_CONFORME` (fonction SQL `classer_composite`, bornes de `CLAUDE.md` §5).
- chaque `MesureSousComposante` : `statut` = `CONFORME` (score 100) / `ALERTE`
  (score 0) / `NON_CALCULABLE` (score null), `raison` renseignée dans ce
  dernier cas.

`GET /api/sites` trie les sites par `score_composite` **croissant**, sites sans
mesure (`NULL`) en dernier — les sites en difficulté remontent en tête.

## Décisions de conception

- **Renormalisation en base, pas dans l'API** : `mv_score_pilier` calcule le
  composite via un `CROSS JOIN LATERAL` des six paires (pilier, score) filtré
  sur `score IS NOT NULL`, joint aux poids de la grille. L'API lit la valeur
  gelée, elle ne repondère jamais (CLAUDE.md §3).
- **`classer_composite(numeric)`** : fonction SQL `IMMUTABLE` isolant les
  bornes 90 / 75, testable directement et réutilisable par les écrans
  nationaux à venir.
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
- **`ui/badge-classification`** : pastille de rangement du site (vert / ambre /
  rouge), à côté de `ui/badge-statut` (statut de sous-composante). Partagé par
  la fiche site et la liste des sites.

## Administration des produits traceurs

`GET /api/admin/traceurs` (lecture, tout rôle), `PUT /api/admin/traceurs/:code`
et `DELETE /api/admin/traceurs/:code` (rôle `coordination`). La liste initiale
vient de la migration 0013 ; la coordination l'ajuste ensuite via l'écran
`/admin/traceurs`. Désactiver (`actif = false`) retire le produit des calculs
P4 et P5 au prochain rafraîchissement sans perdre l'historique. `produit_code` doit
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
