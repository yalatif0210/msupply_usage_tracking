# 01: P3 — dénominateur en jours calendaires, retrait du calendrier ouvrable

**What to build:** redéfinir P3 sur les jours calendaires du mois PAQD et
supprimer `dim_temps.est_ouvrable` + la table `jour_ferie`, devenues du code
mort après l'arbitrage « le PAQD ne défalque ni week-ends ni fériés ».

**Blocked by:** —

**Status:** done (branche `p3-jours-calendaires`)

- [x] Migration `0024_p3_jours_calendaires.sql` :
  - `mv_p3_regularite` recréée : dénominateur `nb_jours` = jours calendaires du
    mois PAQD ; numérateur = jours DISTINCT avec ≥ 1 sortie
    (`nature ∈ {dispensation, distribution}`, non annulée), tous jours confondus.
  - `mv_score_pilier` + `rafraichir_et_geler` recréées à l'identique de `0023`.
  - `ALTER TABLE dqa.dim_temps DROP COLUMN est_ouvrable;`
  - `DROP TABLE dqa.jour_ferie;`
- [x] `indicateurs.test.ts` : les fillers P6 non-ajustement du socle passent en
      `nature = 'reception'` pour rester hors P3 ; bloc P3 réécrit sur base
      31 jours (août 2026), le test « férié exclu » devient « une sortie un
      week-end / ancien férié compte ».
- [x] `schema.test.ts` : l'assertion `est_ouvrable` sur le 7 août est retirée
      (remplacée par le compte de jours calendaires d'août = 31).
- [x] `import.test.ts` : commentaire ajusté (P3 toujours ALERTE, 1 j / 31) ;
      `lecture-indicateurs.test.ts` inchangé (dispensation déjà un jour ouvré).
- [x] Docs : `CONTEXT.md`, `docs/guide_module_indicateurs.md`,
      `docs/canevas_extraction_v2.md`, commentaire d'issue sur
      `03-pilier-p3-regularite-saisie.md`.
- [x] `typecheck` + suite API + suite web au vert.
