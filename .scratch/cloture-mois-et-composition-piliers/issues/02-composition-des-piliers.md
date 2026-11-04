# 02: Composition des piliers paramétrable

**What to build:** la grille datée porte, pour chaque pilier, les
sous-composantes activées et leur poids. Une sous-composante activée compte
dans le score de son pilier. La grille actuelle fait de P4 l'écart de
consommation seul (100 %), l'écart SDU désactivé. La coordination modifie la
composition dans l'écran d'administration de la grille.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Table de composition rattachée à la grille, contrôles (poids positifs, au moins une sous-composante active par pilier).
- [ ] Vues : score de pilier = moyenne pondérée des sous-composantes actives calculables.
- [ ] API et écran d'administration : lecture et modification de la composition.
- [ ] Écart SDU désactivé dans la grille courante ; l'écran l'affiche « non retenu dans le score ».
- [ ] Tests : grille avec SDU actif = ancien calcul ; grille sans SDU ; pondération non égale.
