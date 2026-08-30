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

**Status:** ready-for-agent

- [ ] Une migration numérotée crée la vue matérialisée de P1 : trois
      sous-composantes, par site et par programme, dénominateurs = nombre de
      programmes gérés (inventaires, réquisitions) et nombre de factures
      fournisseur (réceptions).
- [ ] La complétude des réceptions est NON_CALCULABLE en l'absence de facture
      fournisseur sur le mois.
- [ ] Le score de pilier P1 est câblé dans la vue de score de pilier et la
      procédure de rafraîchissement ; le composite se recalcule avec P1.
- [ ] `GET /api/sites/:id` renvoie P1 avec ses trois sous-composantes ou
      NON_CALCULABLE avec raison par sous-composante.
- [ ] La fiche site affiche la carte P1 avec ses trois sous-composantes.
- [ ] Couture B : un test par sous-composante — site à un programme vs
      plusieurs, mois complet vs partiel, aucune facture fournisseur →
      réceptions NON_CALCULABLE. Couture A : bout en bout, un import produit un
      score P1 visible.
