# 06: Vues P5 et P6 + gel de l'historique

**What to build:** Après un import propre, les scores des piliers P5
(concordance) et P6 (ratio d'ajustements) sont calculés par site, par mois PAQD,
par programme, en lisant les seuils de la grille de paramètres active pour ce
mois. Chaque sous-composante reçoit un statut binaire (CONFORME / ALERTE) ou
NON_CALCULABLE quand les données ne permettent pas le calcul. Les scores du mois
PAQD déclaré dans le classeur sont gelés dans l'historique, chaque ligne
référençant la version de grille utilisée ; la colonne de score composite reste
vide. Les données que la fenêtre de 45 jours réapporte pour un cycle déjà clos
mettent à jour le core mais ne re-gèlent jamais ce mois. Le rafraîchissement
s'exécute après la promotion, hors de sa transaction.

**Blocked by:** 05

**Status:** done (commit e96d84e)

- [x] `mv_p5_concordance` / `mv_p6_ajustements` par (site du périmètre, mois PAQD, programme) + ligne « tous programmes ».
- [x] Seuils lus via `grille_pour_mois(mois)` → `grille_seuil_sous_composante` — aucun seuil en dur.
- [x] Données insuffisantes (pas d'inventaire exploitable) → `p_concordance` NULL (NON_CALCULABLE) ; score de pilier binaire 100/0/NULL.
- [x] `rafraichir_et_geler(lot)` : REFRESH + `INSERT ON CONFLICT` dans `hist_score_site` pour le seul `mois_paqd` du lot, `grille_id` référencée, `score_composite` NULL.
- [x] Immutabilité des cycles clos assurée en amont par la règle de validation R3 (un mois trop ancien est rejeté avant le gel).
- [x] Rafraîchissement hors transaction (ADR 0003) ; échec → anomalie `RAFRAICHISSEMENT_DIFFERE`, lot reste « validé ».
- [x] 9 tests couture B + 1 assertion couture A.
