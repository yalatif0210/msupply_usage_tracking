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

**Status:** ready-for-agent

- [ ] Une migration numérotée crée la vue matérialisée de P3 : jours ouvrables
      avec au moins une sortie de stock ÷ jours ouvrables du mois PAQD, par site
      et par programme.
- [ ] « Sortie de stock » = dispensation pour un site de dispensation,
      distribution vers un site rattaché pour un district.
- [ ] Le score de pilier P3 est ajouté à la vue de score de pilier et à la
      procédure de rafraîchissement ; le composite se recalcule avec P3.
- [ ] `GET /api/sites/:id` renvoie P3 avec sa sous-composante (valeur, seuil,
      statut) ou NON_CALCULABLE avec raison.
- [ ] La fiche site affiche la carte P3.
- [ ] Couture B : test de la formule (mois avec fériés, site sans mouvement →
      NON_CALCULABLE, cas au-dessus / en dessous du seuil). Couture A : bout en
      bout, un import produit un score P3 visible sur la fiche.
