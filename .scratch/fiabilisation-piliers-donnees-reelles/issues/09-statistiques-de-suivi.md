# 09: Statistiques de suivi des réquisitions et des factures

**What to build:** hors score, l'application montre pour chaque site et au
niveau national la part des réquisitions ordinaires ayant au moins une
facture, et les factures en attente depuis plus de 7 jours (alerte).

**Blocked by:** 06

**Status:** done

- [x] Calcul (vue ou requête) : réquisitions ordinaires `fn` couvrant M-1,
  part avec au moins une facture `si` ; factures `cn` / `nw` et leur
  ancienneté, alerte au-delà de 7 jours.
- [x] Affichage : fiche site (bloc de suivi) et synthèse nationale.
- [x] Tests : facture en attente depuis 8 jours signalée ; 6 jours non.
