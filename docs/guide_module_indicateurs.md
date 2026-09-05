# Guide du module Indicateurs

## Rôle

Expose en lecture seule les scores de qualité des données : synthèse nationale,
liste des sites du périmètre, détail par site (piliers, sous-composantes,
statuts). Ne calcule rien en TypeScript — lit les vues matérialisées et
`hist_score_site` (CLAUDE.md §3, ARCHITECTURE.md §2).

Emplacement : `apps/api/src/indicateurs/` (API) et `apps/web/src/app/pages/`
(écrans synthèse, liste, détail).

## Points d'entrée

| Méthode | Chemin | Retour | Rôle |
|---|---|---|---|
| `GET` | `/api/sites` | `ScoreSite[]` | tout authentifié |
| `GET` | `/api/sites/:id?mois=&programmeId=` | `DetailSite` | tout authentifié |
| `GET` | `/api/sites/:id/historique?cycle=&de=&a=&programmeId=` | `HistoriqueSite` | tout authentifié |
| `GET` | `/api/sites/:id/piliers/:code?mois=&programmeId=` | `DetailPilier` (union sur `code` ; `p4` = tableau produit P4 · P5) | tout authentifié |
| `GET` | `/api/sites/:id/produits/:code?mois=&programmeId=` | `FicheProduitMois` (produits traceurs uniquement) | tout authentifié |
| `GET` | `/api/synthese?mois=&programmeId=&region=` | `SyntheseNationale` | tout authentifié |
| `GET` | `/api/tableau-de-bord?mois=` | `TableauDeBord` | tout authentifié |
| `GET` | `/api/referentiel/programmes` | `Programme[]` | tout authentifié |
| `GET` | `/api/referentiel/districts` | `string[]` | tout authentifié |
| `GET` | `/api/referentiel/regions` | `string[]` | tout authentifié |

Filtres de `/api/sites` : `district`, `region`, `programmeId` (validés par
`filtreSitesSchema`).

## Données lues

| Source | Usage |
|---|---|
| `hist_score_site` | six scores de pilier + `score_composite` + `classification` + dix valeurs `sc_*` gelés par (site, mois PAQD, programme) |
| `hist_pilier_brut` | couples attendu / réalisé (et réalisé à l'heure) figés par (site, mois PAQD, programme, mesure) au même passage que `hist_score_site` — ADR 0009 |
| `v_mois_cycle` | rang M+1..M+4 de chaque mois PAQD dans son cycle (depuis `dim_temps`) |
| `v_sous_composante_atteinte` | taux d'atteinte du seuil + statut par (site, mois, programme, sous-composante), depuis `hist_score_site.sc_*` |
| `mv_p4_ecart_produit` | détail par produit traceur : écarts SDU / consommation (P4) + quantités du dernier inventaire dont se déduit la concordance par produit (P5) |
| `mv_synthese_nationale` | agrégats nationaux / région / district / programme par mois PAQD |
| `mv_synthese_sous_composante` | mêmes grains, par sous-composante : comptes de statut + taux d'atteinte moyen |
| `mv_synthese_rapports` | comptes P1 / P2 des réquisitions et inventaires de fin de mois, agrégés par strate de structure (× région × programme) par mois PAQD |
| `mv_p1_completude` | taux de complétude inventaires / réquisitions / réceptions (%), scores et p_completude |
| `mv_p2_promptitude` | taux de promptitude inventaires / réquisitions (%), scores et p_promptitude |
| `mv_p3_regularite` | taux de jours du mois avec sortie de stock (%) |
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

### Comptes bruts gelés (ADR 0009)

Chaque vue `mv_pN` expose, à côté de son taux, le **couple attendu / réalisé**
qui le produit (les CTE le calculaient déjà, la migration 0028 le projette).
`rafraichir_et_geler` fige ces couples dans `hist_pilier_brut`, une ligne par
`(site, mois PAQD, programme, mesure)` parmi les dix mesures (`p1_inventaires`,
`p1_requisitions`, `p1_receptions`, `p2_inventaires`, `p2_requisitions`,
`p3_regularite`, `p4_ecart_sdu`, `p4_ecart_consommation`, `p5_concordance`,
`p6_ajustements`) ; une mesure NON_CALCULABLE n'est pas figée. Les migrations
0029 (P1) et 0030 (P2..P6) ont posé la table et rattrapé les mois déjà clos.

`DetailSite.piliers[].comptesBruts` sert ces couples dans la carte du pilier ;
le **détail transaction par transaction** derrière un couple n'est jamais gelé,
il est lu en direct du core par `/piliers/:code` avec un avertissement si le
core a été ré-importé après le gel (`coreMajLe > calculeLe`).

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
sous-composantes, **seuil grille 100 %**, dénominateur = **programmes gérés**
(comme P1 — arbitrage coordination du 2026-08-31, migration 0020).
- `promptitude_inventaires` : programmes gérés avec ≥ 1 inventaire finalisé
  daté dans les trois derniers jours du mois ÷ programmes gérés.
- `promptitude_requisitions` : programmes gérés avec ≥ 1 réquisition couvrant
  le mois soumise au plus tard le jour limite du mois suivant ÷ programmes
  gérés. Jour limite = `dqa.jour_limite_requisition(type_structure,
  jour_limite_requisition)` (fonction unique, migration 0033) :
  `dim_site.jour_limite_requisition`, à défaut 5 (CSU/CSR/ESPC), 7 (HG/CHR),
  10 (autres). Le détail P2 ligne à ligne réutilise cette fonction.

Un programme géré sans inventaire (ou sans réquisition) du mois compte **0**,
jamais NON_CALCULABLE : ne rien soumettre pénalise P2. NON_CALCULABLE seulement
si le site n'a aucun programme géré déclaré. Score de pilier P2 = moyenne
simple des deux sous-composantes.

**P3 — régularité de saisie** (`mv_p3_regularite`, branche `UNION ALL`) :

- **Sites qui dispensent** : jours du mois PAQD avec au moins une sortie de
  stock (`nature ∈ {dispensation, distribution}`) ÷ jours calendaires du mois.
  Aucun jour n'est retranché — en milieu hospitalier la dispensation a lieu
  7 j/7, le PAQD ne défalque ni week-ends ni fériés (arbitrage coordination du
  2026-08-31, migration 0024). Seuil grille `regularite_saisie` = 65 %.
- **Districts** (`strate_de(type_structure) = 'District'`, ADR 0011, migration
  0036) : réquisitions DISTINCTES de la zone (sites du périmètre du même
  `dim_site.district`, hors le district lui-même) couvrant M-1, servies dans le
  mois PAQD M par une distribution du district liée (`fact_transaction.requisition_id`,
  date entre le 1er et le dernier jour de M) ÷ réquisitions DISTINCTES de la
  zone couvrant M-1. Plusieurs distributions pour une réquisition comptent
  pour une. Seuil grille `regularite_saisie.seuil_district` = 80 %.

Sous-composante unique `regularite_saisie` : calcul, seuil et libellé
(« (dispensation) » vs « (distribution) ») s'adaptent au type de site. La
colonne `est_district` de `mv_p3_regularite` dit quelle branche a produit la
valeur ; `mv_score_pilier` et `v_sous_composante_atteinte` choisissent le
seuil en conséquence, la synthèse en hérite. NON_CALCULABLE si aucune donnée
exploitable (aucune sortie, ou aucune réquisition de zone) → pas de ligne.
`DetailSite.estDistrict` sert au front pour le libellé ; le détail P3 d'un
district porte `reponseZone` (le couple de comptes) au lieu de `jours`.

**P4 · Taux de conformité** (`mv_p4_ecart`) : libellé de pilier « Taux de
conformité » ; deux sous-composantes (`ecart_sdu`, `ecart_consommation`) en
**taux de conformité** (part des produits traceurs dans la tolérance de la
grille, pas une amplitude d'écart).
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

**Tableau produit P4 · P5** (`mv_p4_ecart_produit`, variante `p4` de
`GET /api/sites/:id/piliers/:code`) : une ligne par produit traceur inventorié,
avec l'écart SDU (théorique / compté au dernier inventaire, statut), l'écart
consommation (stock début-fin / réceptions / déclarée / reconstituée, statut,
ou « non évaluable » + raison) **et** la concordance P5 par produit
(`concordance_pct` / `concordance_conforme`, colonnes de `mv_p4_ecart_produit`
depuis la migration 0033 : `least(|théo|, |compté|) / greatest(…) · 100`
comparée au seuil `concordance` de la grille, `NULL` quand une quantité manque —
même sémantique que `mv_p5_concordance`, qui l'exclut alors de son agrégat ; le
repository ne fait que lire ces colonnes). La route `/piliers/p4` a remplacé
l'ancien endpoint
`DetailP4Produits` : P4 et P5 partagent désormais ce tableau. Rendu dans un
`<details>` sous les cartes de pilier ; les cartes P4 et P5 l'ouvrent toutes
deux, le code produit est un lien vers la fiche produit-mois. Comme les autres
variantes de `DetailPilier`, la réponse porte `comptesBruts`, `calculeLe`,
`coreMajLe` et `reimporteDepuisLeGel`.

**Détail ligne à ligne par pilier** (`GET /api/sites/:id/piliers/:code`,
`DetailPilier` — union discriminée sur `code`). Lu **en direct du core**
(`fact_inventaire`, `fact_requisition`, `fact_transaction`), jamais gelé.
Chaque réponse porte aussi les `comptesBruts` figés du pilier, `calculeLe`
(gel des comptes, `hist_pilier_brut` à défaut `hist_score_site`), `coreMajLe`
(`max(maj_le)` des lignes de core lues) et `reimporteDepuisLeGel`
(`coreMajLe > calculeLe` : le détail live peut diverger des comptes figés).
Variantes livrées : `p1` (inventaires / réquisitions / réceptions / factures du
mois + état par programme géré), `p2` (inventaires avec « dans les 3 derniers
jours », réquisitions avec date limite — règles de la migration 0020 — et « à
l'heure »), `p3` (un item par jour calendaire du mois PAQD, `aSortie` = au moins
une `dispensation` / `distribution` non annulée ce jour ; mêmes prédicats que
`mv_p3_regularite`), `p4` (tableau produit P4 · P5 fusionné, lu de
`mv_p4_ecart_produit` avec la concordance par produit) et `p6` (les seuls
mouvements d'ajustement : date, produit, quantité, sens, plus `nbMouvements`, le
dénominateur de `mv_p6_ajustements` ; ajustement = ligne `issu_ajustement` ou
nature `ajustement_*`). `p5` est servi par la variante `p4`. Le filtre
`programmeId` restreint les lignes de core au programme ; absent = tous
programmes.

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

## Fiche produit-mois

`GET /api/sites/:id/produits/:code?mois=&programmeId=` (`ficheProduitMoisQuerySchema`,
réponse `FicheProduitMois`) sert la route web partageable `/sites/:id/produits/:code`,
ouverte depuis le code produit du tableau P4 · P5. Elle rassemble, pour **un
produit traceur**, un site et un mois, toutes les grandeurs brutes derrière les
piliers P3 à P6 : les inventaires finalisés du mois portant le produit (stock
théorique mSupply vs stock physique compté, écart), les photos `fact_stock_snapshot`
du mois, les réceptions finalisées, le total dispensé + le nombre de jours avec
dispensation, les ajustements (même prédicat que P6), et la consommation
reconstituée (`stockDébut + réceptions − stockFin` entre les deux inventaires
bornants) vs déclarée avec leur écart. Le détail est lu **en direct des `fact_*`** ;
`consommation`, `stockDebut` et `stockFin` sont repris de `mv_p4_ecart_produit`
(mêmes calculs que l'écart consommation P4, migration 0017) et valent `null` sans
deux inventaires bornants. `mois` par défaut = le plus récent mesuré du site
(`hist_score_site`) ; `programmeId` restreint les lignes de core. La réponse porte
`calculeLe` (gel des comptes du mois, `hist_pilier_brut` à défaut `hist_score_site`),
`coreMajLe` (`max(maj_le)` des lignes de core lues) et `reimporteDepuisLeGel`
(`coreMajLe > calculeLe` : note discrète à l'écran). **404** si le site est hors
périmètre ou si `code` n'est pas dans `dim_produit_traceur`. Écran : composant
autonome `pages/fiche-produit.ts`, données via `core/ressource` (sélecteur de mois
synchronisé à l'URL, pas de remontage), fil d'Ariane vers `/sites/:id`.

## Synthèse nationale

`mv_synthese_nationale` agrège `hist_score_site` par mois PAQD à quatre
niveaux : national, par région, par district, et les mêmes déclinés par
programme (sur les sites qui **gèrent** le programme). Deux branches
`UNION ALL` : « tous programmes » (lignes `hist.programme_id IS NULL`) et « par
programme » (lignes du programme sur `dim_site_programme` actif), chacune en
GROUPING SETS géographiques.

- `nb_sites` = sites du périmètre de l'ensemble (pour une ligne programme : les
  sites gérant) ; `nb_mesures` = ceux avec un `score_composite` ; un site sans
  ligne du mois compte en `nb_sans_mesure`, jamais NON_CONFORME.
- `score_composite_moyen` et `moy_p_*` = `avg` des valeurs **non nulles**,
  `NULL` si aucune. Le filtre région donne un national **ré-agrégé** (moyenne
  par site), pas une moyenne de moyennes de districts — d'où `region` **et**
  `district` comme dimensions de la vue.

`GET /api/synthese?mois=&programmeId=&region=` (`syntheseQuerySchema`) : `mois`
par défaut le plus récent ; `programmeId` restreint `national` + `parDistrict` ;
`region` restreint `parDistrict` + `parProgramme` ; `parProgramme` liste tous
les programmes gérés, même sans mesure. `mv_synthese_nationale` est rafraîchie
par `rafraichir_et_geler` **après** le gel de `hist_score_site`.

**Par sous-composante.** `mv_synthese_sous_composante` (migration 0026) agrège
les dix valeurs gelées `hist_score_site.sc_*` au même grain, plus une dimension
`sous_composante` : `nb_conforme` / `nb_alerte` / `nb_non_calculable` (statut
re-déduit de la valeur vs le seuil de la grille du mois, selon le sens ;
NON_CALCULABLE si la valeur ou le seuil manque) et `taux_atteinte_moyen`
(moyenne du taux d'atteinte du seuil, lu sur `v_sous_composante_atteinte`).
Servi dans `SyntheseNationale.parSousComposante`
(dix lignes, au grain `district IS NULL`, tri taux d'atteinte croissant), pour
l'onglet « Sous-composantes » de `/synthese`. Rafraîchie avec
`mv_synthese_nationale`.

**Rapports & inventaires.** `mv_synthese_rapports` (migration 0032) agrège
`hist_pilier_brut` (mesures `p1_requisitions`, `p1_inventaires`,
`p2_requisitions`, `p2_inventaires`) par **strate de structure**
(`strate_de(dim_site.type_structure)`, « Non classé » pour un type non mappé),
par mois PAQD, avec les grains « toutes régions » / « tous programmes » en
GROUPING SETS comme `mv_synthese_nationale`. Elle ne lit que les lignes
`programme_id IS NOT NULL` — le grain par programme géré — pour ne pas compter
deux fois avec la ligne agrégée : l'« attendu » est ainsi le nombre de
programmes gérés, réconcilié avec P1 / P2. Une strate sans site du périmètre
pour le mois n'a pas de ligne. Rafraîchie par `rafraichir_et_geler` après le
gel de `hist_pilier_brut`.

`GET /api/synthese/rapports?mois=&region=&programmeId=` (`syntheseQuerySchema`,
réponse `SyntheseRapports`) : `mois` par défaut le plus récent présent dans la
vue ; `region` / `programmeId` narrows ; la réponse porte une ligne par strate
(`{ strate, requisitions: { attendu, realise, aLHeure }, inventaires: { … } }`,
tous entiers) plus une `total` = somme des strates affichées. Sert le troisième
onglet « Rapports & inventaires » de `/synthese` (tableau strate × { réquisitions,
inventaires } × { attendu, réalisé, à l'heure }, ligne de total, `tabular-nums`),
avec les mêmes sélecteurs mois / région / programme que les deux autres onglets.

**Tableau de bord national.** `GET /api/tableau-de-bord?mois=` (`TableauDeBord`)
sert la page d'accueil `/` : `national` (bloc du mois affiché, lu sur
`mv_synthese_nationale` au grain tous nuls), `progression` (score composite
moyen national par mois PAQD, ordonné), et `sousComposantesEnDifficulte` (les
`TOP_SOUS_COMPOSANTES_DIFFICULTE` = 5 sous-composantes avec le plus de sites en
ALERTE, depuis `mv_synthese_sous_composante`). `mois` par défaut le plus
récent ; un mois demandé absent de `progression` retombe dessus (repli
défensif, jamais d'erreur). Endpoint dédié plutôt qu'une extension de
`/synthese` : la mini-série de progression n'a de sens que sur l'accueil.

**Mois en cours vs mois clos.** Depuis l'ADR 0010, le gel reconstitue tous les
mois trouvables dans le core à chaque import, y compris le mois en cours
(encore incomplet). `TableauDeBord.moisClos` et `DetailSite.moisClos`
(`dqa.mois_est_clos(mois_paqd)`, vrai après le 10 du mois suivant, l'échéance
de réquisition la plus tardive) distinguent un score définitif d'un score
encore provisoire ; l'écran affiche un repère « mois en cours » tant qu'il est
faux, pour qu'une valeur partielle ne soit pas lue comme un verdict final.

Écran `pages/synthese.ts` (route `/synthese`) : deux onglets. « Par pilier » :
bloc national (score moyen en grand, barre de répartition à quatre segments
`ui/repartition-classification`), six moyennes de pilier, tableau par district
(ligne cliquable → `/sites` filtré), section « scores par programme ».
« Sous-composantes » : tableau des dix sous-composantes, triable. Sélecteurs
mois / programme / région. Écran `pages/tableau-de-bord.ts` (route `/`) :
tuiles, `ui/graphe-sparkline`, top 5 en difficulté ; la liste des sites est sur
`/sites` (`pages/liste-sites.ts`).

Depuis l'ADR 0008, ces écrans sont sur spartan/ui : les graphes passent par
ApexCharts (`ui/graphe-*`, légendes toujours complètes) et un changement de
sélecteur ne remonte jamais la vue — la primitive `core/ressource` garde le
contenu courant visible, refait la requête en arrière-plan et reflète les
filtres dans l'URL sans navigation (cf. `docs/guide_module_ressource.md`).

## Progression d'un site

`GET /api/sites/:id/historique?cycle=&de=&a=&programmeId=` (`historiqueQuerySchema`)
lit `hist_score_site` joint à `v_mois_cycle`. **Fenêtre** : `de`+`a` (plage de
mois libre, bornes incluses) prime sur `cycle` ; sans paramètre, le cycle le
plus récent mesuré. Les points sont triés par **mois PAQD** ; un mois sans
ligne gelée est absent (jamais un zéro). `cyclePaqd` = le cycle affiché, ou
`null` pour une plage libre. `moisDisponibles` liste tous les mois mesurés du
site (sélecteur de plage). `piliersCouverts` et `scoresPiliers` viennent des
`p_*` gelés — aucun recalcul.

Chaque point porte `sousComposantes` : les dix `SousComposanteBref` du mois
(valeur, seuil, statut, `tauxAtteinte`) lues sur `v_sous_composante_atteinte`
et agrégées en jsonb par un `LEFT JOIN LATERAL`. C'est l'historique qui fait
autorité pour les valeurs de sous-composante dans le temps.

**Fiche site.** `GET /api/sites/:id` porte désormais `sousComposantes` : les
dix `SousComposanteBref` gelées du mois affiché (mêmes valeurs que
l'historique), pour le tableau à plat et le radar. Les **cartes de pilier**
(`piliers[].sousComposantes`) restent servies par les vues `mv_p1..mv_p6`
(rendu riche : sous-scores, `nb_produits`) ; elles coïncident avec les valeurs
gelées pour le mois courant.

Section « Analyse fine » sur `pages/detail-site.ts` (sous les cartes de
pilier), pilotée par un **sélecteur de plage de mois** (`de`/`a` +
préréglages « cycle courant », « 12 derniers mois », « tout ») posé dans
l'écran :

- **Tableau à plat** des dix sous-composantes du dernier mois de la plage
  (valeur, seuil, écart au seuil, taux d'atteinte, statut ; triable).
- **Radar** (`ui/graphe-radar`, ApexCharts) : bascule 6 piliers ↔ 10
  sous-composantes, rayon = taux d'atteinte, étiquette d'axe colorée par le
  statut ; plus une liste « forces / faiblesses » (3 + 3, par taux d'atteinte).
- **Courbes** (`ui/graphe-courbe`, ApexCharts) : granularité composite / par
  pilier / par sous-composante d'un pilier choisi, axe Y 0..100 (taux
  d'atteinte pour les sous-composantes), repères 65 / 75 / 90. À partir de six
  séries la légende passe sous le graphe et s'enroule (jamais tronquée).

Le mois affiché par les cartes de pilier et la fiche = borne haute de la
plage. `ui/graphe-sparkline` (page d'accueil) reste une primitive séparée
(mono-série).

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
