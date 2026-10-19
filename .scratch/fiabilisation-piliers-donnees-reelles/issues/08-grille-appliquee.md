# 08: La grille est appliquée en entier

**What to build:** chaque sous-composante est jugée contre son propre seuil et
son propre sens de comparaison ; modifier la grille change effectivement les
scores.

**Blocked by:** 06

**Status:** done

- [x] P1, P2 : un seuil par sous-composante (plus un seul seuil commun).
- [x] P3, P5, P6 et score : sens « ≥ » / « ≤ » lu dans la grille.
- [x] Tests : changer le seuil de `completude_requisitions`, ou le sens d'une
  sous-composante, modifie le score.
