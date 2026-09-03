# 01: Les vues de pilier exposent leurs couples attendu / réalisé

**What to build:** chaque vue matérialisée de pilier (P1 à P6) rend, en plus de
son taux et de ses scores, le couple de comptes qui produit le taux — le
numérateur et le dénominateur qu'elle calcule déjà en interne mais jette au
`SELECT` final. Rien ne change pour les taux, les scores ni le score composite.
Préfactorisation : le gel (ticket 02) et le détail par pilier (ticket 04) liront
ces colonnes.

**Blocked by:** None (can start immediately)

**Status:** done (branche `donnees-brutes-piliers`)

- [ ] `mv_p1_completude` expose : inventaires réalisés / programmes gérés,
      réquisitions réalisées / programmes gérés, réceptions finalisées /
      factures fournisseur.
- [ ] `mv_p2_promptitude` expose, pour les inventaires et pour les réquisitions :
      nombre total et nombre dans les délais.
- [ ] `mv_p3_regularite` expose : jours avec au moins une sortie / jours
      calendaires du mois.
- [ ] `mv_p4_ecart` expose, pour l'écart SDU et pour l'écart consommation :
      produits dans la tolérance / produits évalués.
- [ ] `mv_p5_concordance` expose : produits traceurs conformes au seuil /
      produits traceurs inventoriés.
- [ ] `mv_p6_ajustements` expose : nombre d'ajustements / nombre de mouvements.
- [ ] Un test d'intégration par vue (base éphémère, lignes de core fabriquées à
      la main) vérifie le couple sur un cas nominal et un cas limite, et vérifie
      que le taux existant est inchangé.
- [ ] `rafraichir_et_geler` continue de passer ses tests actuels ; la procédure
      de rafraîchissement des vues n'a pas régressé.
