# 02: Comparaison du stock projeté avec les photos mSupply

**What to build:** pour chaque couple site × produit, le stock projeté aux
dates des photos de stock mSupply, le stock mSupply (somme des lots) et leur
écart, affichés sans seuil, pour repérer les sites où mSupply surestime le
stock.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Projection évaluée à chaque date de photo postérieure à la borne de fin.
- [ ] API et contrat : dernière photo et écart dans la liste ; toutes les photos dans le détail.
- [ ] Écran : colonnes photo mSupply, stock projeté à cette date, écart.
- [ ] Tests : écart chiffré à la main ; photo antérieure à la borne de fin ignorée ; couple sans photo.
