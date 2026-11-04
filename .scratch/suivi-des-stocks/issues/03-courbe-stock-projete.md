# 03: Détail d'un couple : courbe du stock projeté jour par jour

**What to build:** depuis la liste, le détail d'un couple site × produit avec
la courbe du stock projeté jour par jour (de la borne de fin à t + 90 jours ou
la rupture), les inventaires, les réceptions et les photos mSupply en points,
et le rappel du calcul de la CMM.

**Blocked by:** 01

**Status:** done

- [x] Série journalière calculée en base (vue ou fonction SQL), jamais dans l'API.
- [x] API et contrat : détail d'un couple (série, inventaires bornants, réceptions, photos).
- [x] Écran : courbe ApexCharts, légende complète, lien depuis la liste ; filtres conservés au retour.
- [x] Tests : série jusqu'à la rupture, réception qui relève la courbe, horizon de 90 jours.
