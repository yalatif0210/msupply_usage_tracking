# 01: Vue matérialisée `mv_synthese_nationale` + rafraîchissement

**What to build:** une vue matérialisée qui agrège `hist_score_site` en un état
national par mois PAQD, à quatre niveaux de lecture : national, par région, par
district, et les mêmes déclinés pour un programme de santé donné. C'est la
seule source des écrans nationaux ; l'API ne recalcule rien (CLAUDE.md §3).

Pour chaque `(mois, programme|NULL, region|NULL, district|NULL)` : nombre de
sites du périmètre concernés, nombre de sites avec un score, score composite
moyen (moyenne des non-nuls), comptes par classification, nombre de sites sans
mesure, et la moyenne de chacun des six scores de pilier gelés.

Un site du périmètre sans ligne `hist_score_site` pour le mois compte dans
`nb_sites` et dans `nb_sans_mesure` — jamais exclu, jamais NON_CONFORME. Les
niveaux « par programme » ne portent que sur les sites qui **gèrent** le
programme (`dim_site_programme` actif) ; un programme géré sans aucune mesure ce
mois produit quand même une ligne (score `NULL`, `nb_mesures = 0`).

`rafraichir_et_geler` rafraîchit `mv_synthese_nationale` **après** l'`INSERT`
dans `hist_score_site`, hors de la transaction du lot.

**Blocked by:** None (branche `master`, tranche piliers fusionnée)

**Status:** done (branche `ecrans-nationaux`)

- [x] Une migration numérotée crée `mv_synthese_nationale` avec les colonnes de
      la spec (`mois_paqd`, `programme_id`, `region`, `district`, `nb_sites`,
      `nb_mesures`, `score_composite_moyen`, `nb_conforme`,
      `nb_partiellement_conforme`, `nb_non_conforme`, `nb_sans_mesure`,
      `moy_p_*` ×6) et un index unique sur
      `(mois_paqd, coalesce(programme_id,''), coalesce(region,''), coalesce(district,''))`.
- [x] Deux branches `UNION ALL` : « tous programmes » sur les lignes
      `hist.programme_id IS NULL`, GROUPING SETS `((mois), (mois, region),
      (mois, region, district))` ; « par programme » sur
      `hist.programme_id IS NOT NULL` restreint aux sites gérant le programme,
      GROUPING SETS `((mois, prog), (mois, prog, region), (mois, prog, region,
      district))`.
- [x] Les lignes proviennent de `dim_site` (périmètre) × mois de
      `hist_score_site`, en LEFT JOIN sur `hist` : un site sans ligne du mois →
      `nb_sans_mesure`.
- [x] `score_composite_moyen` et `moy_p_*` sont `round(avg(...), 1)` sur les
      non-nuls, `NULL` si aucun ; `nb_conforme + nb_partiellement_conforme +
      nb_non_conforme + nb_sans_mesure = nb_sites` à chaque ligne.
- [x] `rafraichir_et_geler` ajoute `REFRESH MATERIALIZED VIEW
      dqa.mv_synthese_nationale` après le gel de `hist_score_site`.
- [x] Couture B (`test/synthese.test.ts`) : fixtures `hist_score_site` à la
      main (plusieurs sites / districts / régions / programmes, un site hors
      périmètre, un site du périmètre sans ligne, un programme géré sans
      mesure). Assertions : national (`nb_sites`, `nb_mesures`, moyenne des
      non-nuls, `nb_sans_mesure`, somme des comptes) ; par district (2 sites vs
      1, hors périmètre exclu) ; par région (ré-agrégation, pas moyenne de
      moyennes) ; par programme (score = moyenne des composites par programme
      des sites gérant, programme sans mesure → ligne à `NULL`) ; `moy_p_*` =
      moyenne des `p_*` non nuls ; deux mois gelés indépendants ; `CALL
      rafraichir_et_geler` rafraîchit la vue.

## Comments

- `db/migrations/0021_vue_synthese_nationale.sql` : deux CTE — `tous` (produit
  périmètre × mois, LEFT JOIN sur `hist.programme_id IS NULL`) et `parprog`
  (produit `dim_site_programme` actif × mois, LEFT JOIN sur la ligne du
  programme). `HAVING (grouping(region)=1 OR region IS NOT NULL)` (idem
  district) évite la collision de clé pour un site sans région/district : il
  reste compté au national mais sort des ventilations géographiques.
- `rafraichir_et_geler` rafraîchit `mv_synthese_nationale` **après** l'`INSERT`
  dans `hist_score_site` (et dans la branche « lot sans mois »).
- `nb_sites` d'une ligne « programme » = sites qui **gèrent** le programme, donc
  = le dénominateur `nbSitesGerant` du contrat : pas de colonne séparée
  nécessaire → à répercuter au ticket 02 (supprimer `nbSitesGerant`, `nbSites`
  suffit).
- 9 tests dans `test/synthese.test.ts` ; suite API : 113 verts.
