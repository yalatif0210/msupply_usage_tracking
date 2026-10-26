# 04: Ruptures signalées, à surveiller, et regroupement par programme

**What to build:** un statut par couple site × produit à la date t (en
rupture ; rupture signalée si la couverture est de 15 jours ou moins ; à
surveiller si une rupture est prévue au-delà, dans l'horizon de 90 jours ;
sans risque sinon), un encadré en tête listant les couples en rupture et à
signaler, triés par couverture, puis ceux à surveiller, et une bascule pour
lire le tableau par programme, puis site, puis produit.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Seuil dans `parametre_suivi` (`seuil_couverture_rupture_jours`, 15) ; statut calculé dans `dqa.stocks_a_date`.
- [ ] API et contrat : statut par ligne, filtre par statut, regroupement par programme.
- [ ] Écran : encadré des ruptures signalées et à surveiller en tête, statut sur chaque ligne et dans le résumé du site, bascule de regroupement dans l'URL.
- [ ] Tests : couverture de 15 jours pile signalée, 16 jours à surveiller, sans rupture dans l'horizon sans risque, stock à 0 en rupture ; seuil paramétré ; regroupement par programme.
- [ ] Manuel utilisateur (et PDF) : section « Suivi des stocks ».
