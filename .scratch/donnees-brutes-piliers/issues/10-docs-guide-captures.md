# 10: Documentation, guide de module et captures

**What to build:** la documentation reflète le nouvel état — vues, endpoints,
mécanisme de gel, écran des strates — et les captures des écrans nouveaux ou
modifiés sont archivées. Les suites de tests passent en entier.

**Blocked by:** 05 (détail des piliers complet), 07 (fiche produit-mois), 09
(onglet national)

**Status:** ready-for-agent

- [ ] `docs/guide_module_indicateurs.md` mis à jour : `hist_pilier_brut` et son
      gel, `mv_synthese_rapports`, les couples exposés par `mv_p1..p6`, les
      endpoints `/piliers/:code`, `/synthese/rapports`, `/produits/:code`, le
      contrat d'avertissement ré-import.
- [ ] `docs/guide_module_admin.md` mis à jour : administration des strates.
- [ ] `CONTEXT.md` relu (les entrées *Compte brut*, *Rapport mensuel*, *Strate
      de structure* existent déjà) ; ajustées si le vocabulaire a bougé pendant
      l'implémentation.
- [ ] L'ADR du gel des comptes bruts est en place et référencé depuis le guide.
- [ ] Captures Playwright : carte de pilier avec comptes, dépliants P1/P2/P3/P6,
      tableau produit P4/P5, fiche produit-mois, onglet national, écran des
      strates.
- [ ] Suites vertes : API en entier, web en entier, garde
      `conventions-source.test.ts`.
