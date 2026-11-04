# 04: Transparence du calcul des scores

**What to build:** chaque score de la fiche site se déplie et montre son calcul,
des sous-composantes (valeur, seuil, note, poids) jusqu'au score du pilier,
puis jusqu'au score composite et sa classification, avec la grille et sa
version. Les écrans de liste et de synthèse ont un dépliable « Comment ces
scores sont calculés » qui décrit la grille du mois affiché. La décomposition
vient de la base ; l'écran ne recalcule rien.

**Blocked by:** 02, 03

**Status:** done

- [x] Contrat Zod de la décomposition d'un score et de la description d'une grille.
- [x] API : décomposition par site et mois ; description de la grille d'un mois.
- [x] Fiche site : dépliable par pilier et pour le composite, raison de sanction ou de non-calcul.
- [x] Tableau de bord, liste des sites, synthèse, scores par territoire : dépliable de méthode.
- [x] Tests : la décomposition redonne exactement le score affiché.

## Comments

- Migration 0059 : `mv_score_pilier` expose les notes des sous-composantes
  (sanction comprise) ; la fiche site en déduit le statut, ce qui corrige le
  statut d'une sous-composante sanctionnée à note non nulle (reste du ticket 03).
- Le poids d'un pilier sur la fiche site vient désormais de la grille du mois
  (il venait d'une constante du code).
- Les scores par territoire sont un bloc de la synthèse nationale : le
  dépliable de la synthèse les couvre.
