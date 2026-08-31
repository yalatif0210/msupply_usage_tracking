# 01: Vue matérialisée `mv_p4_ecart_produit`

**What to build:** le détail par produit traceur des deux écarts de P4, sous la
même forme que ce que `mv_p4_ecart` calcule déjà dans ses CTE avant d'agréger.
Une ligne par (site du périmètre, mois PAQD, programme, produit traceur actif
inventorié) : partie écart SDU (théorique / compté / écart % / conforme) et
partie écart consommation (stock début / fin, réceptions, déclarée,
reconstituée, écart %, conforme, ou non évaluable + raison).

Aucun changement des taux, du score de pilier, du score composite :
`mv_p4_ecart` et `mv_score_pilier` ne sont pas touchés (pas de cascade). Le
doublon de CTE avec `mv_p4_ecart` est assumé (cf. spec §Schéma).

**Blocked by:** None (branche `master`)

**Status:** done (branche `drill-down-produit-p4`)

- [x] Une migration numérotée crée `mv_p4_ecart_produit` avec les colonnes de
      la spec et l'index unique
      `(site_id, mois_paqd, coalesce(programme_id,''), produit_id)`.
- [x] Partie SDU : dernier inventaire finalisé du mois par produit
      (`sdu_produit` de `0017`) ; `ecart_sdu_pct` = `abs(théo − compté) / compté
      × 100`, `NULL` si `compté = 0 ∧ théorique > 0`, `0` si `compté = 0 ∧
      théorique = 0` ; `sdu_conforme` selon la tolérance de grille du mois.
- [x] Partie consommation : deux inventaires bornants (`bornes`),
      `reconstituee = stock_debut + receptions − stock_fin` ;
      `conso_evaluable = false` avec `conso_raison_exclusion` =
      `un_seul_inventaire` (pas de bornes) ou `reconstituee_non_positive`
      (`reconstituee ≤ 0`) ; `conso_conforme` selon la tolérance de grille.
- [x] Restrictions : produits traceurs **actifs** uniquement, sites
      `dans_perimetre_dqa` uniquement ; agrégat « tous programmes »
      (`programme_id = NULL`) comme `mv_p4_ecart`.
- [x] `rafraichir_et_geler` (`CREATE OR REPLACE PROCEDURE`) ajoute
      `REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart_produit` après `mv_p4_ecart`.
- [x] Couture B (`test/p4-produit.test.ts` ou extension du bloc P4) : une ligne
      par produit traceur inventorié ; non traceur / hors périmètre absents ;
      cas limites compté 0 ; exclusion consommation (un seul inventaire,
      reconstituée ≤ 0) ; `reconstituee` correcte ; **cohérence** avec
      `mv_p4_ecart` (`count(sdu_conforme)/count(*)` = `taux_sdu_pct` ; idem
      consommation sur les évaluables) ; `CALL rafraichir_et_geler` rafraîchit
      la vue.
