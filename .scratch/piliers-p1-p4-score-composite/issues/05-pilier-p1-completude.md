# 05: Pilier P1 — complétude des transactions

**What to build:** la fiche site affiche le pilier P1, complétude des
transactions, avec ses trois sous-composantes : complétude des inventaires, des
réquisitions, des réceptions. Chacune est la part des transactions attendues du
site sur le mois PAQD qui ont effectivement été saisies.

Attendu par mois : un inventaire et une réquisition par programme de santé géré
par le site ; une réception par facture fournisseur adressée au site.

- Complétude des inventaires = inventaires saisis ÷ nombre de programmes gérés.
- Complétude des réquisitions = réquisitions couvrant le mois ÷ nombre de
  programmes gérés (s'appuie sur la table core des réquisitions du ticket 01).
- Complétude des réceptions = réceptions saisies ÷ factures fournisseur
  adressées au site ; NON_CALCULABLE si aucune facture fournisseur sur le mois.

Chaque sous-composante est CONFORME si le taux atteint le seuil de grille du
pilier (P1 : 100 %), ALERTE sinon. Le score de pilier P1 est la moyenne simple
des scores des sous-composantes calculables. Câblé dans la vue de score de
pilier et figé au rafraîchissement ; le composite l'intègre via la
renormalisation.

**Blocked by:** 01, 04

**Status:** done (branche piliers-p1-p4-score-composite)

- [x] `db/migrations/0018_vue_p1_completude.sql` crée `mv_p1_completude` : trois
      sous-composantes, par site et par programme (+ agrégat tous programmes),
      dénominateurs = programmes gérés (inventaires, réquisitions) et factures
      fournisseur (réceptions).
- [x] `completude_receptions` NON_CALCULABLE sans facture fournisseur du mois.
- [x] Score de pilier P1 (moyenne des sous-composantes calculables) câblé dans
      `mv_score_pilier` et `rafraichir_et_geler` ; composite recalculé.
- [x] `GET /api/sites/:id` renvoie P1 avec ses trois sous-composantes (valeur,
      seuil, statut) ou NON_CALCULABLE avec raison par sous-composante.
- [x] La fiche site affiche la carte P1 (rendu générique, trois sous-composantes).
- [x] Couture B (nouveau bloc `vue P1 — complétude`) : inventaires 1/1 vs 1/2,
      grain par programme, réquisitions via `mois_couvert`, réceptions =
      factures / < factures / aucune facture → NON_CALCULABLE, moyenne des
      sous-composantes, mois sans activité → aucune ligne. Couture A :
      `lecture-indicateurs` et `import` vérifient P1 + composite bout en bout.

## Comments

- Une ligne P1 n'est produite que pour un `(site, mois)` avec activité
  (inventaire, réquisition, réception ou facture) — sinon un mois vide
  donnerait un score de zéro trompeur (user story 40).
- `completude_receptions` est filtrée par programme quand un programme est
  demandé ; les factures/réceptions sans `programme_id` ne comptent alors que
  dans l'agrégat « tous programmes ».
