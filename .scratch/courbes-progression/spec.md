# Spec — Courbes de progression M+1 → M+4

Status: ready-for-agent
Feature: courbes-progression
Date: 2026-08-31

Références : `CONTEXT.md` (Cycle PAQD, Mois PAQD), `ARCHITECTURE.md` §3–§4,
`CLAUDE.md` §3/§8, `DESIGN_SYSTEM.md`, `docs/guide_module_indicateurs.md`,
`.scratch/ecrans-nationaux/spec.md` (tranche précédente, fusionnée dans
`master`).

---

## Problem Statement

`hist_score_site` conserve le score de chaque site pour chaque mois PAQD depuis
le début, mais rien ne l'exploite. La fiche site ne montre qu'un mois à la
fois : impossible de voir si un site **progresse** au fil d'un cycle PAQD
(quatre mois consécutifs, notés M+1 à M+4). L'équipe district ne peut pas dire
« ce site remonte » ou « ce site décroche depuis deux mois » ; la coordination
ne peut pas mesurer l'effet d'une supervision.

`ARCHITECTURE.md` §3 réserve déjà `GET /api/sites/:id/historique` →
`HistoriqueSite` et §4 place la « courbe de progression » sur l'écran de détail
d'un site. Ni l'un ni l'autre n'existe.

## Solution

1. **Vue `v_mois_cycle`** (non matérialisée) : mappe chaque `mois_paqd` à son
   `cycle_paqd` et à son rang 1..4 dans le cycle, à partir de `dim_temps`.
2. **`GET /api/sites/:id/historique?cycle=&programmeId=`** → `HistoriqueSite` :
   les points de score (composite + classification + scores de pilier + piliers
   couverts) du site sur les mois d'un cycle PAQD, ordonnés par rang. Cycle le
   plus récent mesuré par défaut ; liste des cycles disponibles.
3. **Section « Progression » sur la fiche site** : sélecteur de cycle, un
   graphique SVG sobre du score composite sur M+1..M+4 avec les repères de
   classification (75, 90), et une petite table score-par-pilier × mois pour
   repérer quel pilier bouge. Respecte le filtre programme de la fiche.

## User Stories

1. En tant qu'agent de district, je veux voir le score composite d'un site sur les quatre mois d'un cycle PAQD, afin de savoir s'il progresse.
2. En tant qu'agent de district, je veux que chaque point porte sa classification (couleur), afin de repérer d'un coup d'œil les mois non conformes.
3. En tant qu'agent de district, je veux les repères visuels à 75 et 90 sur le graphique, afin de situer le site par rapport aux seuils de classification.
4. En tant qu'agent de district, je veux choisir le cycle affiché quand le site a des mesures sur plusieurs cycles, et voir le plus récent par défaut.
5. En tant qu'agent de district, je veux qu'un mois du cycle sans mesure apparaisse comme un trou dans la courbe (point absent), jamais comme un zéro.
6. En tant qu'agent de district, je veux une table score-par-pilier sur les mois du cycle, afin d'identifier quel pilier tire la progression.
7. En tant qu'agent de district, je veux que la progression respecte le filtre programme de la fiche : si je regarde le programme VIH, la courbe est celle de VIH.
8. En tant qu'agent de coordination, je veux que la progression soit lue depuis l'historique gelé, jamais recalculée, et donc stable dans le temps (ADR 0003).
9. En tant qu'agent de district, je veux que la section n'apparaisse pas si le site n'a qu'un seul mois mesuré (rien à tracer).
10. En tant que développeur, je veux que le front rejette une réponse `HistoriqueSite` non conforme au contrat.
11. En tant qu'agent de coordination, je veux que le rang M+1..M+4 vienne du calendrier (`dim_temps`), pas d'un calcul de mois en dur.
12. En tant qu'agent de district, je veux voir sous la courbe le delta entre le premier et le dernier mois mesuré du cycle (« +8 pts » / « −5 pts »), afin de résumer la tendance.
13. En tant qu'agent de coordination, je veux que seuls les sites `dans_perimetre_dqa` répondent (cohérent avec le reste du module).

## Implementation Decisions

### Schéma

- **`CREATE VIEW v_mois_cycle`** (non matérialisée — pur reshaping déterministe
  de `dim_temps`, aucune donnée d'indicateur) :

  ```sql
  CREATE VIEW v_mois_cycle AS
  WITH mc AS (SELECT DISTINCT mois_paqd, cycle_paqd FROM dqa.dim_temps)
  SELECT mois_paqd, cycle_paqd,
         dense_rank() OVER (PARTITION BY cycle_paqd ORDER BY mois_paqd)::int AS rang
  FROM mc;
  ```

  `rang` ∈ [1, 4] pour un cycle complet ; un cycle en cours en a moins.
- Aucune migration de table, aucune vue matérialisée, aucun changement de
  `rafraichir_et_geler` : `HistoriqueSite` est une lecture jointe de
  `hist_score_site` × `v_mois_cycle`.

### Contrats (`@dqa/contracts`)

```
pointProgression = {
  moisPaqd: MoisPaqd,
  rang: number (int, 1..4),
  scoreComposite: Pourcentage | null,
  classification: Classification | null,
  piliersCouverts: number (int, 0..6),
  scoresPiliers: { pilier: Pilier, score: Pourcentage | null }[],   // 6 entrées P1..P6
}

historiqueSite = {
  site: Site,
  programmeId: string | null,
  cyclePaqd: string | null,           // cycle affiché, null si aucune mesure
  cyclesDisponibles: string[],        // cycles où le site a ≥ 1 mesure, du plus récent au plus ancien
  points: pointProgression[],         // triés par rang croissant ; un point par mois PAQD mesuré du cycle
}

historiqueQuerySchema = { cycle?: string, programmeId?: string }
```

- Réutilise `Site`, `Pilier`, `Classification`, `Pourcentage`, `MoisPaqd`
  existants. `DetailSite`, `ScoreSite`, `SyntheseNationale` : inchangés.

### API

- **`GET /api/sites/:id/historique`** (tout authentifié) — 404 si le site est
  hors périmètre ou inconnu (comme `/api/sites/:id`).
- `cyclesDisponibles` : `SELECT DISTINCT vmc.cycle_paqd FROM hist_score_site h
  JOIN v_mois_cycle vmc USING (mois_paqd) WHERE h.site_id = $1
  AND h.programme_id IS NOT DISTINCT FROM $prog ORDER BY vmc.cycle_paqd DESC`.
- `cyclePaqd` : `cycle` de la requête s'il est dans la liste, sinon le premier
  (plus récent), sinon `null`.
- `points` : `hist_score_site` du site pour les mois du cycle choisi, joint à
  `v_mois_cycle` pour le rang, ordonné par rang. `scoresPiliers` mappé depuis
  les colonnes `p_*` gelées ; `piliersCouverts` = compte SQL des `p_*` non nuls
  (même expression que `detailSite`).
- Le repository ne calcule aucun indicateur (CLAUDE.md §3) : il lit et façonne.

### Front

- **`SitesService.historique(siteId, opts)`** : valide la réponse avec
  `historiqueSiteSchema` (`validerReponse`).
- **`pages/detail-site.ts`** : nouvelle section « Progression », **sous** les
  cartes de pilier, visible seulement si `cyclesDisponibles.length > 0` et
  `points.length > 1`.
  - Sélecteur de cycle (si `cyclesDisponibles.length > 1`).
  - **Composant `ui/courbe-progression.ts`** : SVG inline (pas de librairie —
    DESIGN_SYSTEM §5), largeur fluide via `viewBox`. Axe X = rang 1..4 (libellés
    `M+1`..`M+4`), axe Y = 0..100. Lignes de repère horizontales à 75 et 90
    (grises, fines, étiquetées). Polyligne du score composite reliant les points
    mesurés ; cercle par point coloré selon la classification (vert / ambre /
    rouge). Un mois non mesuré = pas de point, la polyligne saute (segments
    entre points consécutifs mesurés seulement). Valeur affichée au-dessus de
    chaque point.
  - Sous la courbe : « M+1 → M+4 : **+8 pts** » (delta premier→dernier point
    mesuré), signe et couleur ; « — » si moins de deux points mesurés.
  - Table compacte : une ligne par pilier (P1..P6), une colonne par mois mesuré
    du cycle (`M+n`), cellule = score 100 / 0 / `—`.
- La section suit le filtre programme de la fiche : `historique` est rappelé
  avec `programmeId` dans `recharger()`.

## Testing Decisions

Base PostgreSQL **éphémère** (testcontainers), jamais mockée (CLAUDE.md §3).

### Couture B — `v_mois_cycle` + lecture historique

Nouveau `test/historique.test.ts`. Fixtures : `hist_score_site` fabriqué à la
main pour un site sur les quatre mois de `2026-C2` (mai→août) plus un mois d'un
autre cycle, scores variés dont un mois **sans** ligne. Assertions :
- `v_mois_cycle` : mai→rang 1 … août→rang 4 pour `2026-C2` ; le cycle
  `2026-C1` a ses propres rangs.
- lecture : `points` ordonnés par rang ; le mois sans ligne est absent de
  `points` (pas un point à zéro) ; `scoresPiliers` reflète les `p_*` gelés ;
  `piliersCouverts` correct ; `cyclesDisponibles` = les deux cycles, plus
  récent d'abord ; filtre programme isole les lignes du programme.

### Couture A — frontière HTTP

Étend `test/lecture-indicateurs.test.ts` : `GET /api/sites/SITE-1/historique`
rend un objet conforme à `historiqueSiteSchema` ; 404 sur un site hors
périmètre ; `?cycle=` inexistant retombe sur le cycle le plus récent ;
`?programmeId=` restreint la courbe.

### Couture D — service HTTP Angular

Étend `apps/web/src/app/core/valider-reponse.test.ts` : un `HistoriqueSite`
complet passe ; un `rang` hors [1, 4], un `scoreComposite` hors [0, 100], ou
`scoresPiliers` ≠ 6 entrées → lève une erreur explicite.

## Out of Scope

- Toute **projection** ou **objectif** de score (cette tranche montre le passé
  gelé, pas de prévision).
- La progression **au niveau national** ou **par district** (l'écran synthèse
  reste sur un mois ; une progression nationale viendrait plus tard).
- Le **drill-down produit** de P4, les **UI d'administration** — tranches
  distinctes.
- Toute **vue matérialisée** ou évolution de `rafraichir_et_geler`.
- L'**export** du graphique.

## Further Notes

- `hist_score_site` porte déjà tout (score composite, classification, six
  `p_*`) par (site, mois, programme) : la tranche est une lecture jointe, aucune
  logique de calcul.
- Le rang vient de `dim_temps` (US 11) : robuste aux cycles définis par la
  mission, sans arithmétique de mois en dur.
- Choix du SVG inline plutôt qu'une librairie : le registre visuel (institutionnel,
  sobre, projeté) n'a pas besoin de plus, et `DESIGN_SYSTEM.md` §5 proscrit les
  libs d'UI tierces en V1.
- La section vit sur la fiche site existante ; pas de nouvelle route. Un second
  appel HTTP (`/historique`) en parallèle du détail.
