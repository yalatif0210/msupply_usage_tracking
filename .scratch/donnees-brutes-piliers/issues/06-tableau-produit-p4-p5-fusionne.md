# 06: Tableau produit P4 · P5 fusionné

**What to build:** le drill-down par produit traceur existant (aujourd'hui
propre à P4) devient la variante P4 de `DetailPilier` et absorbe la concordance
P5. Un seul tableau, sous les cartes de pilier, montre pour chaque produit
traceur le stock théorique et le stock physique compté côte à côte, l'écart
SDU, la concordance, la consommation reconstituée vs déclarée, et le statut. Le
code produit est un lien vers la fiche produit-mois (ticket 07).

**Blocked by:** 04 (route `/piliers/:code` et union `DetailPilier`)

**Status:** ready-for-agent

- [ ] `GET /api/sites/:id/piliers/p4` renvoie la variante P4 de `DetailPilier`
      au lieu de `DetailP4Produits` ; le type `DetailP4Produits` est retiré des
      contrats et l'écran mis à jour dans la même tranche.
- [ ] La variante P4 porte, par produit traceur : stock théorique (mSupply),
      stock physique compté, écart SDU et son statut ; concordance et son
      statut ; stock début / fin, réceptions, consommation déclarée,
      consommation reconstituée, écart consommation et son statut, ou une raison
      d'exclusion.
- [ ] Sur la fiche site, un seul tableau produit rend ces colonnes, produits
      hors tolérance en tête ; le code produit est un lien vers
      `/sites/:id/produits/:code` pour le mois affiché.
- [ ] Les cartes P4 et P5 pointent vers ce tableau commun.
- [ ] Le tableau se réconcilie avec les taux agrégés de `mv_p4_ecart` et
      `mv_p5_concordance`.
- [ ] Tests : lecture repository de la variante P4 (base éphémère), cohérence
      avec les vues agrégées ; validation de contrat.
