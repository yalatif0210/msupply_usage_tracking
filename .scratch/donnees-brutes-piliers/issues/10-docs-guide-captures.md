# 10: Documentation, guide de module et captures

**What to build:** la documentation reflète le nouvel état — vues, endpoints,
mécanisme de gel, écran des strates — et les captures des écrans nouveaux ou
modifiés sont archivées. Les suites de tests passent en entier.

**Blocked by:** 05 (détail des piliers complet), 07 (fiche produit-mois), 09
(onglet national)

**Status:** done (branche donnees-brutes-piliers)

- [x] `docs/guide_module_indicateurs.md` mis à jour : `hist_pilier_brut` +
      section « Comptes bruts gelés (ADR 0009) », `mv_synthese_rapports`, les
      couples exposés par `mv_p1..p6`, `/piliers/:code`, `/synthese/rapports`,
      `/produits/:code`, l'avertissement ré-import, `jour_limite_requisition`,
      concordance dans `mv_p4_ecart_produit`.
- [x] `docs/guide_module_admin.md` : administration des strates (fait au T8).
- [x] `CONTEXT.md` : *Compte brut*, *Rapport mensuel*, *Strate de structure*
      posées au grilling ; inchangées pendant l'implémentation.
- [x] ADR 0009 en place, renvoi croisé depuis l'ADR 0007 et le guide.
- [x] **Revue 2-axes** (`/code-review since 6833295`) : 3 violations Standards
      + 2 bugs Spec + 1 lacune de test corrigés (migration 0033 : concordance
      par produit dans `mv_p4_ecart_produit` + `jour_limite_requisition()` ;
      gel du `nb_realise` P2 repris de P1 ; `z.enum` sur `:code` ; test
      d'import bout en bout Couture 2).
- [~] Captures Playwright : reportées — la base de démo (40 sites + scores)
      n'est pas montée localement (même blocage que le ticket 12 de la refonte
      spartan). À reprendre quand la stack de démo tourne.
- [x] Suites vertes : API 213/213 en séquentiel (`--testTimeout=30000`), web
      62/62 incl. `conventions-source.test.ts`, typecheck + build API + web.
