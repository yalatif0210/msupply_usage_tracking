# 02: Relibellé P4 « Taux de conformité » + retrait des citations d'ADR

**What to build:** renommer le libellé du pilier P4 et supprimer les
références à des numéros d'ADR des textes d'écran.

**Blocked by:** —

**Status:** ready-for-agent

- [ ] `LIBELLES_PILIER.P4` dans `@dqa/contracts` → « Taux de conformité ».
      Le code de pilier reste `P4`. Aucun changement de l'enum
      `sous_composante` ni des libellés de sous-composante (« écart SDU »,
      « écart consommation »).
- [ ] Test contrats : `LIBELLES_PILIER.P4 === 'Taux de conformité'`.
- [ ] Répercussion documentaire : `CLAUDE.md` §5, `CONTEXT.md` (glossaire
      « Écart SDU (P4) » et table des six piliers),
      `docs/guide_module_indicateurs.md`, `docs/canevas_extraction_v2.md`.
- [ ] Retrait de « (ADR 0003) » dans `apps/web/src/app/pages/admin-grille.ts`
      (garder la phrase « les scores déjà calculés ne changent jamais », sans
      la référence). Grep `apps/web/src` pour tout autre « ADR » / numéro de
      décision et nettoyer.
- [ ] `typecheck` + suites contrats / web + `ng build` OK.
