# 04: Écran `/synthese` — scores par programme et filtre programme

**What to build:** la section « scores par programme » sous les indicateurs
nationaux, et le sélecteur de programme qui filtre tout le reste de l'écran
(bloc national, moyennes de pilier, tableau district).

La section liste chaque programme de santé géré par au moins un site du
périmètre : programme | sites gérant | mesurés | score national | répartition
compacte. Triée par score croissant, programmes sans mesure (score `NULL`) en
fin de liste. Cette section n'est **pas** affectée par le sélecteur de
programme (elle montre toujours tous les programmes).

Le sélecteur de programme, lui, recharge la synthèse avec `?programmeId=` : le
bloc national et le tableau par district passent au périmètre de ce programme.
La mention de couverture (« N sites sur M ») reflète alors les sites gérant le
programme.

**Blocked by:** 03

**Status:** done (branche `ecrans-nationaux`)

- [x] `pages/synthese.ts` gagne la section « Scores par programme » (tableau
      trié score croissant, `NULL` en dernier), toujours visible, sous le bloc
      national et les moyennes de pilier.
- [x] Chaque ligne montre `nbSitesGerant`, `nbMesures`, `scoreCompositeMoyen`
      (`—` si `null`) et la répartition compacte (`ui/repartition-classification`).
- [x] Sélecteur de programme : recharge avec `programmeId` ; met à jour le bloc
      national, les moyennes de pilier et le tableau par district ; la section
      « par programme » reste inchangée.
- [x] Un programme géré mais sans aucune mesure du mois apparaît (score `—`,
      couverture 0), jamais masqué ni rendu par un zéro.
- [x] `typecheck` + `ng build` OK ; réponse validée Zod.
- [x] Après ce ticket : mettre à jour `docs/guide_module_indicateurs.md`
      (section « Écrans nationaux ») et `ARCHITECTURE.md` §3/§4 si besoin.
