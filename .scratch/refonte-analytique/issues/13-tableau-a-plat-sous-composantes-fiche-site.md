# 13: Tableau à plat des 10 sous-composantes sur la fiche site

**What to build:** un tableau triable des dix sous-composantes, en complément
des cartes de pilier (pas à leur place).

**Blocked by:** 11, 12, 06

**Status:** done (fusionné dans master)

- [x] `pages/detail-site` : sous les cartes de pilier, un `<details>`
      repliable (même motif que le drill-down P4) « Sous-composantes ».
- [x] Tableau : pilier, sous-composante, valeur, seuil, écart au seuil, taux
      d'atteinte, statut. Triable par colonne ; par défaut taux d'atteinte
      croissant.
- [x] Les cartes de pilier restent inchangées (vue de lecture / projection).
- [x] Valeur absente → `n/d` (règle du ticket 01).
- [x] Suit le mois affiché (et le sélecteur de plage du ticket 15 : montre le
      dernier mois de la plage).
- [x] `ng build` + capture.
