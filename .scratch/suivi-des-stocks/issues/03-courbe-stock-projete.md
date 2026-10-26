# 03: Détail d'un couple : courbe du stock projeté jour par jour

**What to build:** depuis la liste, le détail d'un couple site × produit avec
la courbe du stock projeté jour par jour (de la borne de fin à t + 90 jours ou
la rupture), les inventaires, les réceptions et les photos mSupply en points,
et le rappel du calcul de la CMM.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Série journalière calculée en base (vue ou fonction SQL), jamais dans l'API.
- [ ] API et contrat : détail d'un couple (série, inventaires bornants, réceptions, photos).
- [ ] Écran : courbe ApexCharts, légende complète, lien depuis la liste ; filtres conservés au retour.
- [ ] Tests : série jusqu'à la rupture, réception qui relève la courbe, horizon de 90 jours.
