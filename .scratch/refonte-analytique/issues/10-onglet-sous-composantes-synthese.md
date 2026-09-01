# 10: Onglet « Sous-composantes » dans `/synthese`

**What to build:** l'écran national par sous-composante, en onglet de la
synthèse (pas de route séparée).

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] `pages/synthese` : deux onglets — « Par pilier » (l'existant) et
      « Sous-composantes » (nouveau). L'onglet actif peut être mémorisé en
      `queryParam`.
- [ ] Onglet « Sous-composantes » : tableau des dix lignes — sous-composante,
      pilier, taux d'atteinte moyen, nb CONFORME, nb ALERTE, nb
      NON_CALCULABLE. Triable par colonne (par défaut : taux d'atteinte
      croissant, les plus en difficulté en haut).
- [ ] Respecte les sélecteurs mois / programme / région déjà présents sur la
      page.
- [ ] État vide explicite (aucun mois mesuré / aucun site avec ce filtre).
- [ ] `ng build` + capture de l'onglet.
