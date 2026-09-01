-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Taux d'atteinte du seuil par sous-composante
--
--  `v_sous_composante_atteinte` : vue de reshaping déterministe (non
--  matérialisée, comme `v_mois_cycle`). Une ligne par
--  (site, mois PAQD, programme, sous-composante), à partir des dix valeurs
--  gelées `hist_score_site.sc_*` jointes au seuil de la grille du mois.
--
--  `taux_atteinte` (0..100, NULL si non calculable) :
--    - `ecart_sdu` / `ecart_consommation` : la valeur gelée est déjà un taux
--      de conformité, reprise telle quelle (bornée à 100) ;
--    - sens plafond (`ratio_ajustements`) : seuil / valeur, borné à 1 ;
--    - sens plancher (P1, P2, P3, P5) : valeur / seuil, borné à 1.
--  `least(x, 1)` ignore les NULL : un ratio d'ajustements à 0 donne donc un
--  taux d'atteinte de 100 (objectif « rester sous le plafond » atteint au
--  mieux ; `seuil / nullif(0, 0)` vaut NULL, que `least` écarte).
--  Non arrondi : les agrégats arrondissent après moyenne.
--
--  `statut` : re-déduit de la valeur vs le seuil selon le sens ;
--  NON_CALCULABLE si la valeur ou le seuil manque.
--
--  `mv_synthese_sous_composante` (0026) est reconstruite pour lire cette vue
--  au lieu de dupliquer le calcul inline.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE OR REPLACE VIEW v_sous_composante_atteinte AS
SELECT
    h.site_id,
    h.mois_paqd,
    h.programme_id,
    sc.sous_composante,
    sc.valeur,
    gs.seuil,
    gs.sens,
    CASE
        WHEN sc.valeur IS NULL THEN NULL
        WHEN sc.sous_composante IN ('ecart_sdu', 'ecart_consommation') THEN least(sc.valeur, 100)
        WHEN gs.sens = 'inf' THEN least(gs.seuil / nullif(sc.valeur, 0), 1) * 100
        ELSE least(sc.valeur / nullif(gs.seuil, 0), 1) * 100
    END                                                                 AS taux_atteinte,
    CASE
        WHEN sc.valeur IS NULL OR gs.seuil IS NULL THEN 'NON_CALCULABLE'
        WHEN gs.sens = 'inf' THEN CASE WHEN sc.valeur <= gs.seuil THEN 'CONFORME' ELSE 'ALERTE' END
        ELSE CASE WHEN sc.valeur >= gs.seuil THEN 'CONFORME' ELSE 'ALERTE' END
    END                                                                 AS statut
FROM dqa.hist_score_site h
CROSS JOIN LATERAL (VALUES
    ('completude_inventaires',   h.sc_completude_inventaires),
    ('completude_requisitions',  h.sc_completude_requisitions),
    ('completude_receptions',    h.sc_completude_receptions),
    ('promptitude_inventaires',  h.sc_promptitude_inventaires),
    ('promptitude_requisitions', h.sc_promptitude_requisitions),
    ('regularite_saisie',        h.sc_regularite_saisie),
    ('ecart_sdu',                h.sc_ecart_sdu),
    ('ecart_consommation',       h.sc_ecart_consommation),
    ('concordance',              h.sc_concordance),
    ('ratio_ajustements',        h.sc_ratio_ajustements)
) AS sc(sous_composante, valeur)
LEFT JOIN dqa.grille_seuil_sous_composante gs
       ON gs.grille_id = h.grille_id AND gs.sous_composante = sc.sous_composante;

-- ── mv_synthese_sous_composante — lit désormais v_sous_composante_atteinte ──
DROP MATERIALIZED VIEW IF EXISTS mv_synthese_sous_composante CASCADE;
CREATE MATERIALIZED VIEW mv_synthese_sous_composante AS
WITH mois AS (
    SELECT DISTINCT mois_paqd FROM dqa.hist_score_site
),
sites AS (
    SELECT site_id, region, district FROM dqa.dim_site WHERE dans_perimetre_dqa
),
gerant AS (
    SELECT sp.site_id, sp.programme_id
    FROM dqa.dim_site_programme sp
    JOIN sites s ON s.site_id = sp.site_id
    WHERE sp.actif
),
noms AS (
    SELECT DISTINCT sous_composante FROM dqa.grille_seuil_sous_composante
),
-- toutes les cellules attendues : chaque site du périmètre × chaque mois × les dix sous-composantes
cellules AS (
    SELECT m.mois_paqd, s.site_id, NULL::text AS programme_id,
           s.region, s.district, n.sous_composante, false AS est_prog
    FROM mois m CROSS JOIN sites s CROSS JOIN noms n
    UNION ALL
    SELECT m.mois_paqd, g.site_id, g.programme_id,
           s.region, s.district, n.sous_composante, true AS est_prog
    FROM mois m CROSS JOIN gerant g JOIN sites s ON s.site_id = g.site_id CROSS JOIN noms n
),
detail AS (
    SELECT
        c.mois_paqd, c.programme_id, c.region, c.district, c.est_prog, c.sous_composante,
        va.taux_atteinte,
        coalesce(va.statut, 'NON_CALCULABLE') AS statut
    FROM cellules c
    LEFT JOIN dqa.v_sous_composante_atteinte va
           ON va.site_id = c.site_id AND va.mois_paqd = c.mois_paqd
          AND va.programme_id IS NOT DISTINCT FROM c.programme_id
          AND va.sous_composante = c.sous_composante
)
SELECT
    mois_paqd,
    NULL::text                                                          AS programme_id,
    CASE WHEN grouping(region)   = 1 THEN NULL ELSE region   END         AS region,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END         AS district,
    sous_composante,
    count(*)                                                            AS nb_sites,
    count(*) FILTER (WHERE statut = 'CONFORME')                         AS nb_conforme,
    count(*) FILTER (WHERE statut = 'ALERTE')                           AS nb_alerte,
    count(*) FILTER (WHERE statut = 'NON_CALCULABLE')                   AS nb_non_calculable,
    round(avg(taux_atteinte), 1)::numeric(5, 1)                         AS taux_atteinte_moyen
FROM detail
WHERE NOT est_prog
GROUP BY GROUPING SETS (
    (mois_paqd, sous_composante),
    (mois_paqd, region, sous_composante),
    (mois_paqd, region, district, sous_composante)
)
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(district) = 1 OR district IS NOT NULL)

UNION ALL

SELECT
    mois_paqd,
    programme_id,
    CASE WHEN grouping(region)   = 1 THEN NULL ELSE region   END,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END,
    sous_composante,
    count(*),
    count(*) FILTER (WHERE statut = 'CONFORME'),
    count(*) FILTER (WHERE statut = 'ALERTE'),
    count(*) FILTER (WHERE statut = 'NON_CALCULABLE'),
    round(avg(taux_atteinte), 1)::numeric(5, 1)
FROM detail
WHERE est_prog
GROUP BY GROUPING SETS (
    (mois_paqd, programme_id, sous_composante),
    (mois_paqd, programme_id, region, sous_composante),
    (mois_paqd, programme_id, region, district, sous_composante)
)
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(district) = 1 OR district IS NOT NULL);

CREATE UNIQUE INDEX mv_synthese_sous_composante_uq
    ON mv_synthese_sous_composante
       (mois_paqd, coalesce(programme_id, ''), coalesce(region, ''), coalesce(district, ''), sous_composante);

REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
