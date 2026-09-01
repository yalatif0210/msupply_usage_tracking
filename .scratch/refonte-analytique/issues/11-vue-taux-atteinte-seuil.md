# 11: Vue `v_sous_composante_atteinte` (taux d'atteinte du seuil)

**What to build:** la vue de reshaping qui déduit un taux d'atteinte 0–100,
sens-conscient, des valeurs de sous-composante gelées.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Migration : vue **non matérialisée** `v_sous_composante_atteinte`, façon
      `v_mois_cycle`. Une ligne par (site, mois PAQD, programme,
      sous-composante), à partir de `hist_score_site.sc_*` joint à
      `grille_seuil_sous_composante` via `grille_id`.
  - sens `sup` (plancher : P1, P2, P3, P5) : `least(sc_valeur / seuil, 1) * 100`
  - sens `inf` (plafond : P6 `ratio_ajustements`) :
    `least(seuil / nullif(sc_valeur, 0), 1) * 100`
  - `ecart_sdu` / `ecart_consommation` : `sc_valeur` est déjà un taux de
    conformité 0–100, repris tel quel
  - `sc_valeur` NULL → atteinte NULL
- [ ] `CONTEXT.md` : entrée « Taux d'atteinte du seuil » (définition,
      sens-conscience, non figé).
- [ ] `ARCHITECTURE.md` §2 : `v_sous_composante_atteinte` rejoint la liste des
      vues de reshaping déterministe interrogées par l'API.
- [ ] Tests intégration API (prior art `historique.test.ts`) : un cas par
      sens — plancher (P3 à 71 %, seuil 65 → 100 ; P3 à 52 %, seuil 65 → 80) ;
      plafond (P6 à 3 %, seuil 5 → 100 ; P6 à 8 %, seuil 5 → 62,5) ; P4
      (valeur reprise telle quelle) ; NULL → NULL.
