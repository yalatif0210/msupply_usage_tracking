# 03: Comptes bruts des piliers P2 à P6 dans les cartes

**What to build:** les cinq cartes de pilier restantes (P2, P3, P4, P5, P6)
affichent leur couple attendu / réalisé figé, comme P1. À la fin de ce ticket,
les six cartes de la fiche site portent leurs comptes bruts.

**Blocked by:** 02 (mécanisme de gel + patron d'affichage P1)

**Status:** done (branche `donnees-brutes-piliers`)

- [ ] `rafraichir_et_geler` et le backfill couvrent les mesures P2
      (`p2_inventaires`, `p2_requisitions`), P3 (`p3_regularite`), P4
      (`p4_ecart_sdu`, `p4_ecart_consommation`), P5 (`p5_concordance`), P6
      (`p6_ajustements`).
- [ ] La carte P2 affiche, par sous-composante, « à l'heure / réalisé » et
      « réalisé / attendu ».
- [ ] La carte P3 affiche « jours avec sortie / jours du mois ».
- [ ] La carte P4 affiche, par sous-composante, « produits conformes / produits
      évalués ».
- [ ] La carte P5 affiche « produits conformes / produits inventoriés ».
- [ ] La carte P6 affiche « ajustements / mouvements ».
- [ ] Une sous-composante NON_CALCULABLE n'affiche pas de couple.
- [ ] Tests d'intégration : un cas nominal et un cas limite par mesure, gel puis
      lecture via le repository.
