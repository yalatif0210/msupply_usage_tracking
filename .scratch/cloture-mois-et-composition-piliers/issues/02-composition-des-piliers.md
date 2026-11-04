# 02: Composition des piliers paramétrable

**What to build:** la grille datée porte, pour chaque pilier, les
sous-composantes activées et leur poids. Une sous-composante activée compte
dans le score de son pilier. La grille actuelle fait de P4 l'écart de
consommation seul (100 %), l'écart SDU désactivé. La coordination modifie la
composition dans l'écran d'administration de la grille.

**Blocked by:** 01

**Status:** done

- [x] Composition rattachée à la grille, contrôles (poids positifs, au moins une sous-composante active par pilier).
- [x] Vues : score de pilier = moyenne pondérée des sous-composantes actives calculables.
- [x] API et écran d'administration : lecture et modification de la composition.
- [x] Écart SDU désactivé dans la grille courante ; l'écran l'affiche « non retenu dans le score ».
- [x] Tests : grille avec SDU actif = ancien calcul ; grille sans SDU ; pondération non égale.

## Comments

- Pas de table séparée : chaque sous-composante appartient à un seul pilier,
  la composition est portée par la ligne de seuil (`retenue`, `poids_pct`,
  migration 0057). Les poids retenus d'un pilier font 100.
- `mv_score_pilier` calcule les six scores de pilier (`dqa.score_pilier`) ;
  les moyennes simples des vues de pilier restent, sans usage pour le score.
