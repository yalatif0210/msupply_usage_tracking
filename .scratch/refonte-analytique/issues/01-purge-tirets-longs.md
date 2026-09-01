# 01: Purge des tirets longs de la console + garde-test

**What to build:** retirer `—` (cadratin), `–` (demi-cadratin) et `−` (signe
moins typographique) de tout `apps/web/src`, avec les remplacements convenus,
et un test qui empêche leur réapparition.

**Blocked by:** —

**Status:** ready-for-agent

- [ ] Valeur absente (`{{ x ?? '—' }}` : district, région, type de structure,
      score, seuil, mois…) → `n/d`.
- [ ] Séparateur de titre (« P1 — Libellé », « v1 — En vigueur », « Poids —
      total … ») → `·`.
- [ ] Apposition en ligne (« non évaluable — {raison} », « / 100 — score
      composite moyen », « — {message} » du journal des imports) → deux-points
      ou reformulation.
- [ ] Delta négatif dans `detail-site` (`−{n} pts`) → `-{n} pts` (U+002D). La
      couleur rouge/vert continue de porter le sens.
- [ ] Nouveau fichier de test unique (`apps/web`, vitest) : lit
      récursivement `apps/web/src`, échoue si un `—`, `–` ou `−` subsiste.
      Autoriser une liste d'exceptions vide au départ.
- [ ] `typecheck` + suite web + `ng build` OK.
