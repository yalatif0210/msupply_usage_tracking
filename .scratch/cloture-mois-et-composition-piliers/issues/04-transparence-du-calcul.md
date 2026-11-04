# 04: Transparence du calcul des scores

**What to build:** chaque score de la fiche site se déplie et montre son calcul,
des sous-composantes (valeur, seuil, note, poids) jusqu'au score du pilier,
puis jusqu'au score composite et sa classification, avec la grille et sa
version. Les écrans de liste et de synthèse ont un dépliable « Comment ces
scores sont calculés » qui décrit la grille du mois affiché. La décomposition
vient de la base ; l'écran ne recalcule rien.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Contrat Zod de la décomposition d'un score et de la description d'une grille.
- [ ] API : décomposition par site et mois ; description de la grille d'un mois.
- [ ] Fiche site : dépliable par pilier et pour le composite, raison de sanction ou de non-calcul.
- [ ] Tableau de bord, liste des sites, synthèse, scores par territoire : dépliable de méthode.
- [ ] Tests : la décomposition redonne exactement le score affiché.
