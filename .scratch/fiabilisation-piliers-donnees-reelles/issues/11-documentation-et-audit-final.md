# 11: Documentation et audit final

**What to build:** les documents décrivent les nouvelles règles, et un nouvel
audit sur données réelles confirme leur effet.

**Blocked by:** 10

**Status:** in-progress (attend un fichier extrait en v2.4 par la DAP)

- [x] CONTEXT.md, manuel utilisateur (et PDF), guides de modules, CLAUDE.md §5
  (P1 sans inventaire).
- [x] Recalculs indépendants de l'audit du 2026-10-14 transformés en tests de
  non-régression : `db/audit/recalcul_independant.sql` (lecture seule) et
  `apps/api/test/recalcul-independant.test.ts` ; 0 écart sur la copie des
  données réelles du 2026-10-14.
- [ ] Nouvel audit en lecture seule sur un fichier extrait en v2.4 :
  comparaison avant / après par pilier. Fait sur le lot v2.3 du 2026-10-14
  (factures `nw` et dates de finalisation absentes) ; à refaire au premier
  fichier v2.4 reçu de la DAP.
