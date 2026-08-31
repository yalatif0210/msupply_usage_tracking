# 03: Table de détail P4 par produit sur la fiche site

**What to build:** sous la carte du pilier P4, un bloc repliable qui affiche la
table des produits traceurs avec leurs deux écarts et un statut par produit.
C'est ce qui permet à l'agent de district de cibler l'action quand P4 décroche.

**Blocked by:** 02

**Status:** done (branche `drill-down-produit-p4`)

- [x] `SitesService.p4Produits(siteId, opts)` valide la réponse avec
      `detailP4ProduitsSchema` (`validerReponse`).
- [x] `pages/detail-site.ts` : sous la carte du pilier P4 (seulement si son
      `score !== null`), un `<details>` « Détail par produit traceur ». À
      l'ouverture (ou au chargement de la fiche), charge et rend une table :
      Produit | Théorique | Compté | Écart SDU | statut SDU | Reconstituée |
      Déclarée | Écart conso | statut conso.
- [x] Statut = `dqa-badge-statut` (`CONFORME` / `ALERTE`). Consommation non
      évaluable → texte « non évaluable — <raison lisible> » à la place du
      badge. Écart SDU `null` (infini) rendu « ∞ ». Valeurs `null` → « — ».
- [x] La table suit le `programmeId` et le `mois` courants de la fiche
      (rechargée dans `recharger()`).
- [x] `typecheck` + `ng build` OK ; réponse validée Zod (couture D au ticket 02).
- [x] Mettre à jour `docs/guide_module_indicateurs.md` (section P4, mention du
      drill-down).
