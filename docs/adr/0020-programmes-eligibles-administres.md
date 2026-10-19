# Les programmes éligibles d'un site sont administrés dans l'application

**Statut.** Accepté (2026-10-19).

**Contexte.** P1 et P2 attendent une réquisition (et, pour P2, un inventaire)
par programme géré. Les programmes gérés venaient de SITE_PROGRAMME, c'est-à-
dire des listes maîtresses rattachées au site dans mSupply. Sur le lot du
2026-10-14, 207 couples site x programme sur 548 n'ont eu aucune activité en
45 jours (produits d'hygiène, consommables de service, projets NPSP…) : avec
un seuil de 100 %, P1 et P2 tombaient à 0 pour presque tous les sites.

**Décision.**

- Avant tout calcul, le système détermine les programmes **éligibles** à
  l'évaluation d'un site : ceux de SITE_PROGRAMME dont le statut est actif.
- Ce statut est **modifiable dans l'application** par la coordination, comme
  les types de structure.
- Une modification faite dans l'application **n'est jamais écrasée** par un
  import ultérieur, même si le fichier déclare un état contraire. Un couple
  nouveau apparu dans le fichier est ajouté avec le statut du fichier.

**Pourquoi.** Seule la coordination sait si un programme rattaché dans
mSupply est réellement géré par le site. Un import qui écraserait ses choix
chaque semaine rendrait l'administration inutile.

**Conséquences.** Le couple site x programme garde la trace de son origine
(fichier ou application). Les scores se recalculent au rafraîchissement qui
suit une modification.
