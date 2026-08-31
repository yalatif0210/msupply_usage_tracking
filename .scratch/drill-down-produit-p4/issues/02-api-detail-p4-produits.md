# 02: `GET /api/sites/:id/piliers/p4` + contrat `DetailP4Produits`

**What to build:** l'endpoint qui sert les lignes produit de P4 pour un site et
un mois PAQD, et le contrat partagé. Pure lecture de `mv_p4_ecart_produit`.

**Blocked by:** 01

**Status:** done (branche `drill-down-produit-p4`)

- [x] `@dqa/contracts` : `ecartSduProduitSchema`, `ecartConsoProduitSchema`
      (avec `raisonExclusion` en `z.enum([...]).nullable()`),
      `ligneEcartProduitP4Schema`, `detailP4ProduitsSchema` (`site`, `moisPaqd`
      nullable, `moisDisponibles`, `programmeId` nullable, `produits`) ; types
      par `z.infer`. `MesureSousComposante` / `ScorePilier` / `DetailSite`
      inchangés.
- [x] `GET /api/sites/:id/piliers/p4` (tout authentifié), query validée par
      `detailSiteQuerySchema` (`mois?`, `programmeId?`). 404 si le site est hors
      périmètre ou inconnu. `moisPaqd` = mois demandé s'il existe pour ce site
      dans `mv_p4_ecart_produit`, sinon le plus récent, sinon `null`
      (`produits: []`).
- [x] `produits` triés : SDU hors tolérance d'abord, puis par `produit_code`.
      Le repository lit `mv_p4_ecart_produit` (+ rien d'autre) ; aucune
      arithmétique d'indicateur en TypeScript (CLAUDE.md §3).
- [x] Couture A (extension `test/lecture-indicateurs.test.ts`) :
      `GET /api/sites/SITE-1/piliers/p4` conforme à `detailP4ProduitsSchema` ;
      404 hors périmètre ; `?programmeId=` restreint ; site sans produit
      traceur inventorié → `produits: []`.
- [x] Couture D (extension `valider-reponse.test.ts`) : un `DetailP4Produits`
      complet passe ; `raisonExclusion` inconnue ou `sdu.conforme` absent →
      lève.
