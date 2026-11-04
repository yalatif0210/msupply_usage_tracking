# 03: Valeurs des règles dans la grille

**What to build:** les valeurs numériques des règles de calcul passent dans la
grille datée et dans son écran d'administration : jours de fin de mois et
jours du mois suivant de la fenêtre de clôture (3 et 1), note de sanction (0),
bornes de classification (90 et 75).

**Blocked by:** 01

**Status:** done

- [x] Paramètres de règle rattachés à la grille, avec contrôles de bornes.
- [x] Fenêtre de clôture, sanction et classification lues dans la grille du mois.
- [x] Écran d'administration : modification de ces valeurs.
- [x] Tests : une grille datée change la fenêtre à partir de sa date d'effet seulement.

## Comments

- Migration 0058 : colonnes de `grille_parametre`, valeurs par défaut égales
  aux règles en vigueur (aucun score ne change, vérifié sur la démo).
- La fenêtre lit la grille : le mois de clôture est calculé une fois par
  inventaire et les clôtures une fois par vue, sinon le rafraîchissement de
  la vue P4 par produit passait de 0,3 s à 5 s.
- Reste pour le ticket 04 : la fiche site déduit le statut d'une
  sous-composante sanctionnée de la note brute (0), pas de la note de
  sanction de la grille.
