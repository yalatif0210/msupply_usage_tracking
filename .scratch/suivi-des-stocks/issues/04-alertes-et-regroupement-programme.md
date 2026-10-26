# 04: Couples en alerte et regroupement par programme

**What to build:** un encadré des couples site × produit en alerte (rupture
prévue dans le délai d'alerte, 15 jours par défaut), triés par date de
rupture, et une bascule pour lire le tableau par programme puis site puis
produit.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Délai d'alerte dans `parametre_suivi` (`delai_alerte_rupture_jours`, 15), drapeau d'alerte dans la vue.
- [ ] API et contrat : filtre « en alerte », regroupement par programme.
- [ ] Écran : encadré des alertes en tête, bascule de regroupement dans l'URL.
- [ ] Tests : alerte au délai paramétré ; rupture déjà atteinte à t ; regroupement par programme.
- [ ] Manuel utilisateur (et PDF) : section « Suivi des stocks ».
