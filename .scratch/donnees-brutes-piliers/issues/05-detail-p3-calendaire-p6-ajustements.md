# 05: Détail P3 (bandeau calendaire) et P6 (liste d'ajustements)

**What to build:** le dépliant du pilier P3 montre un bandeau calendaire du
mois, chaque jour marqué « a eu au moins une sortie de stock » ou non. Le
dépliant du pilier P6 liste les seuls mouvements d'ajustement, avec un rappel du
nombre total de mouvements.

**Blocked by:** 04 (route `/piliers/:code` et union `DetailPilier`)

**Status:** done (branche donnees-brutes-piliers)

- [ ] Variante P3 de `DetailPilier` : pour chaque jour calendaire du mois, s'il
      y a eu une sortie de stock (dispensation ou distribution).
- [ ] Variante P6 : liste des mouvements d'ajustement (date, produit, quantité,
      sens), plus le nombre total de mouvements du mois.
- [ ] Sur la fiche site, P3 rend un bandeau de 28 à 31 cases (case pleine =
      jour avec sortie), légende complète, jamais tronquée.
- [ ] P6 rend un tableau des ajustements seuls avec la légende « N ajustements
      sur M mouvements ».
- [ ] La construction du modèle de calendrier (liste de jours → tableau du bon
      nombre de cases pour le mois) est une fonction pure, testée en unitaire
      côté web.
- [ ] Tests d'intégration des lectures repository P3 et P6.
