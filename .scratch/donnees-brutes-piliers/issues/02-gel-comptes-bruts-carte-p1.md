# 02: Gel des comptes bruts et affichage sur la carte P1

**What to build:** à chaque import, les couples de comptes des piliers sont
figés mois par mois au même titre que les scores (extension de l'ADR 0007). La
fiche d'un site affiche, dans la carte du pilier P1, le couple attendu /
réalisé de chacune de ses trois sous-composantes, lu depuis les valeurs figées.
Ce ticket met en place tout le mécanisme de gel et le patron d'affichage sur un
seul pilier ; les cinq autres suivent au ticket 03.

**Blocked by:** 01 (les vues exposent leurs couples)

**Status:** done (branche `donnees-brutes-piliers`)

- [ ] Nouvelle table `hist_pilier_brut` : grain (site, mois PAQD, programme,
      mesure), colonnes attendu / réalisé / à l'heure, référence du lot et
      horodatage de calcul. Migration numérotée et irréversible.
- [ ] `rafraichir_et_geler` écrit les mesures P1 (`p1_inventaires`,
      `p1_requisitions`, `p1_receptions`) pour le mois du lot, en upsert.
- [ ] Un backfill unique peuple `hist_pilier_brut` pour les mesures P1 de tous
      les lots validés existants, sur l'état courant du core.
- [ ] `GET /api/sites/:id` porte, pour chaque pilier, ses comptes bruts figés
      (`comptesBruts`). Contrat dans `@dqa/contracts`, validé par Zod.
- [ ] La carte P1 de la fiche site affiche « réalisé / attendu » par
      sous-composante, en `tabular-nums`, à côté du taux, sans clic.
- [ ] Un site sans donnée P1 pour le mois n'affiche pas de couple (état vide,
      jamais un « 0 / 0 »).
- [ ] Tests : peuplement de `hist_pilier_brut` par `rafraichir_et_geler` (base
      éphémère) ; un test bout en bout `POST /api/imports` vérifiant que les
      comptes figés se réconcilient avec `hist_score_site` ; le backfill sur des
      lots sans lignes brutes.
- [ ] ADR « Gel des comptes bruts des piliers » rédigé (extension de l'ADR
      0007) : ce qui est gelé (couples agrégés) vs live (détail ligne à ligne),
      table compagne en lignes longues plutôt que colonnes larges, contrat
      d'avertissement ré-import.
