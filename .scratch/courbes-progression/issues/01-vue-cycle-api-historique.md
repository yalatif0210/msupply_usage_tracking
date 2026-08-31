# 01: `v_mois_cycle` + `GET /api/sites/:id/historique` + contrat `HistoriqueSite`

**What to build:** de quoi lire la progression d'un site sur les mois d'un
cycle PAQD à partir de l'historique gelé. Une vue qui donne à chaque mois PAQD
son cycle et son rang (M+1..M+4), un endpoint qui rend les points de score du
site sur un cycle, et le contrat partagé.

Le rang vient du calendrier (`dim_temps`), jamais d'une arithmétique de mois en
dur. La lecture est une jointure `hist_score_site` × `v_mois_cycle` : aucun
recalcul d'indicateur (CLAUDE.md §3). Un mois du cycle sans ligne gelée est
absent des points — jamais un point à zéro.

**Blocked by:** None (branche `master`, tranche synthèse fusionnée)

**Status:** done (branche `courbes-progression`)

- [x] Une migration numérotée crée `CREATE VIEW v_mois_cycle` (non
      matérialisée) : `mois_paqd`, `cycle_paqd`, `rang` (`dense_rank()` sur les
      `mois_paqd` distincts du cycle, `::int`). Aucune table, aucune vue
      matérialisée, pas de changement de `rafraichir_et_geler`.
- [x] `@dqa/contracts` : `pointProgressionSchema` (`moisPaqd`, `rang` int 1..4,
      `scoreComposite` nullable, `classification` nullable, `piliersCouverts`
      int 0..6, `scoresPiliers` 6 entrées P1..P6), `historiqueSiteSchema`
      (`site`, `programmeId` nullable, `cyclePaqd` nullable, `cyclesDisponibles`,
      `points`), `historiqueQuerySchema` (`cycle?`, `programmeId?`) ; types par
      `z.infer`. `DetailSite` / `ScoreSite` / `SyntheseNationale` inchangés.
- [x] `GET /api/sites/:id/historique` (tout authentifié) : 404 si le site est
      hors périmètre ou inconnu. `cyclesDisponibles` = cycles du site (via la
      jointure), plus récent d'abord ; `cyclePaqd` = `cycle` de la requête s'il
      est dans la liste, sinon le plus récent, sinon `null`. `points` triés par
      rang, un par mois PAQD mesuré du cycle ; `scoresPiliers` depuis les `p_*`
      gelés ; `piliersCouverts` = compte SQL des `p_*` non nuls (même expression
      que `detailSite`). Filtre `programmeId` via `IS NOT DISTINCT FROM`.
- [x] Couture B (`test/historique.test.ts`) : `v_mois_cycle` mappe mai→1 …
      août→4 pour `2026-C2`, `2026-C1` a ses propres rangs ; lecture : points
      ordonnés par rang, mois sans ligne absent, `scoresPiliers` /
      `piliersCouverts` corrects, `cyclesDisponibles` triés, filtre programme
      isolant.
- [x] Couture A (extension `test/lecture-indicateurs.test.ts`) :
      `GET /api/sites/SITE-1/historique` conforme à `historiqueSiteSchema` ;
      404 hors périmètre ; `?cycle=` inconnu → cycle le plus récent ;
      `?programmeId=` restreint.
- [x] Couture D (extension `valider-reponse.test.ts`) : `HistoriqueSite`
      complet passe ; `rang` hors [1, 4], `scoreComposite` hors [0, 100],
      `scoresPiliers` ≠ 6 → lève.
