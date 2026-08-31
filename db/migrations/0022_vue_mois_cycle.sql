-- ═══════════════════════════════════════════════════════════════════════════
--  Vue v_mois_cycle — rang d'un mois PAQD dans son cycle
--
--  Mappe chaque `mois_paqd` (AAAA-MM) à son `cycle_paqd` (AAAA-CN) et à son
--  rang 1..4 dans le cycle, à partir du calendrier `dim_temps`. Sert les
--  courbes de progression : le rang M+1..M+4 vient du calendrier, pas d'une
--  arithmétique de mois en dur.
--
--  Vue simple (non matérialisée) : reshaping déterministe de `dim_temps`,
--  aucune donnée d'indicateur, rien à rafraîchir.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE OR REPLACE VIEW v_mois_cycle AS
WITH mc AS (
    SELECT DISTINCT mois_paqd, cycle_paqd FROM dqa.dim_temps
)
SELECT
    mois_paqd,
    cycle_paqd,
    dense_rank() OVER (PARTITION BY cycle_paqd ORDER BY mois_paqd)::int AS rang
FROM mc;

COMMENT ON VIEW v_mois_cycle IS
    'Rang (1..4) de chaque mois PAQD dans son cycle. Source des courbes de progression.';
