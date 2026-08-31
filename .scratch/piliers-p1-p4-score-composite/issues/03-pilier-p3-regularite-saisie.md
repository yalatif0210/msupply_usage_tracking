# 03: Pilier P3 — régularité de saisie

**What to build:** la fiche site affiche le pilier P3, régularité de saisie :
la part des jours ouvrables du mois PAQD où le site a enregistré au moins une
sortie de stock. Une « sortie de stock » est une dispensation pour un site de
dispensation, une distribution vers un site rattaché pour un district.

Le dénominateur est le nombre de jours ouvrables du mois PAQD (calendrier déjà
en base, jours fériés de Côte d'Ivoire inclus). Sous-composante unique, statut
binaire : CONFORME si le taux atteint le seuil de grille du pilier, ALERTE
sinon. NON_CALCULABLE si le site n'a aucun mouvement de sortie exploitable sur
le mois.

Le score de pilier P3 est câblé dans la vue de score de pilier et figé au
rafraîchissement. Le score composite l'intègre automatiquement via la
renormalisation.

**Blocked by:** 02

**Status:** done (branche piliers-p1-p4-score-composite)

- [x] Une migration numérotée crée la vue matérialisée de P3 : jours ouvrables
      avec au moins une sortie de stock ÷ jours ouvrables du mois PAQD, par site
      et par programme. → `db/migrations/0016_vue_p3_regularite.sql`
- [x] « Sortie de stock » = dispensation pour un site de dispensation,
      distribution vers un site rattaché pour un district (`nature ∈
      {dispensation, distribution}`, la distribution étant portée par le site
      district dans `fact_transaction`).
- [x] Le score de pilier P3 est ajouté à la vue de score de pilier et à la
      procédure de rafraîchissement ; le composite se recalcule avec P3.
- [x] `GET /api/sites/:id` renvoie P3 avec sa sous-composante (valeur, seuil,
      statut) ou NON_CALCULABLE avec raison (« Aucune sortie de stock
      exploitable sur le mois »).
- [x] La fiche site affiche la carte P3 (rendu générique des `ScorePilier`).
- [x] Couture B : ALERTE / CONFORME au seuil 65 % (13 j / 20), férié exclu,
      distribution comptée, NON_CALCULABLE sans sortie, composite renormalisé
      avec P3. Couture A : `lecture-indicateurs` et `import` vérifient P3 +
      composite bout en bout.

## Comments

- `mv_p3` dérive le mois PAQD de `dim_temps.mois_paqd` (jointure sur le jour de
  confirmation) plutôt que d'un `to_char` — garantit la cohérence avec le
  dénominateur.
- **Révisé (migration 0024, 2026-08-31)** : le dénominateur passe des jours
  ouvrables aux jours **calendaires** du mois. Milieu hospitalier, dispensation
  7 j/7 — le PAQD ne défalque ni week-ends ni fériés. `dim_temps.est_ouvrable`
  et la table `jour_ferie` sont supprimées, plus aucune lecture. Voir
  `.scratch/p3-jours-calendaires/`.
- `mv_score_pilier` et `rafraichir_et_geler` sont recréées à chaque ticket de
  pilier : c'est le prix du découpage ticket-par-ticket avec migrations
  immuables. L'état final reste lisible.
