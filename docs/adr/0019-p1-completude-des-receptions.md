# P1 : complétude des réquisitions et des réceptions, suivie en continu

**Statut.** Accepté (2026-10-19). Amende l'ADR 0012 (la complétude
d'inventaire sort de P1) et l'ADR 0014 (règle des échéances non arrivées).

**Contexte.** P1 mesurait la complétude des inventaires, des réquisitions et
des réceptions. Deux défauts : la complétude d'inventaire testait la même
condition que la promptitude d'inventaire de P2 (inventaire dans les trois
derniers jours du mois), donc le même fait pesait deux fois ; la complétude
des réceptions n'avait pas de sens (ADR 0018). Par ailleurs P1 et P2 notaient
à 0 un mois en cours, avant l'échéance des réquisitions et de l'inventaire de
fin de mois.

**Décision.**

- P1 = complétude des réquisitions + complétude des réceptions.
- **Complétude des réceptions** d'un site, mois évalué M : réquisitions
  **ordinaires** au statut `fn` couvrant M-1 ; factures `si` du site qui
  citent l'une d'elles, au statut `fn`, `cn` ou `nw` ; taux = factures `fn` /
  toutes ces factures. Elle évalue la capacité du site à accepter une facture
  qui répond à sa réquisition, dans le mois d'émission de cette facture.
- **Mois d'émission** : date de finalisation de la livraison par le district
  pour un ESPC ; date de création de la facture `si` chez le site pour un site
  livré par la NPSP (pas de lien entre mSupply et le logiciel de la NPSP).
- **Calcul continu** pendant le mois, affiché comme provisoire, figé à la
  clôture : un taux bas en cours de mois est un signal d'action, pas une
  sanction différée.
- Les sous-composantes à échéance (réquisitions de P1 et de P2, inventaire de
  P2) restent **non calculables** tant que leur échéance n'est pas arrivée.
- Statistiques de suivi, hors score : part des réquisitions ordinaires ayant
  au moins une facture ; factures en attente depuis plus de 7 jours.

**Pourquoi.** L'application suit un changement de comportement : elle doit
alerter tôt sur les factures non acceptées, sans noter un site sur un jalon
dont le délai n'est pas écoulé. Partir de la réquisition ordinaire, et non de
la facture, écarte le bruit des livraisons hors cycle (urgences, dotations).

**Conséquences.** La grille perd le seuil `completude_inventaires`. Les
scores figés antérieurs gardent leur ancienne composition. L'extraction doit
fournir la transaction liée à chaque facture (livraison du district) et les
réquisitions citées par une facture, même hors de la fenêtre.
