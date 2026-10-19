# 06: P1 refondu : réquisitions et réceptions

**What to build:** P1 mesure la complétude des réquisitions et la complétude
des réceptions selon l'ADR 0019 ; la complétude d'inventaire disparaît de P1,
de la grille et des écrans.

**Blocked by:** 04, 05

**Status:** done

- [x] Complétude des réceptions : réquisitions ordinaires `fn` couvrant M-1 ;
  factures `si` du site les citant, en `fn`, `cn`, `nw` ; taux = `fn` / total.
- [x] Mois d'émission : finalisation de la livraison du district (ESPC) ;
  création de la facture (sites livrés par la NPSP). Facture acceptée dans son
  mois d'émission.
- [x] Calcul continu pendant le mois, affiché provisoire, figé à la clôture.
- [x] Retrait de `completude_inventaires` (vue, grille, contrats, écrans,
  comptes bruts) ; historique figé inchangé.
- [x] Tests : facture `fn` dans le mois d'émission comptée ; `fn` le mois
  suivant non comptée ; réquisition urgente exclue ; facture sans réquisition
  hors périmètre.
