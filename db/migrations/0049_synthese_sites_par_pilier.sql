-- ═══════════════════════════════════════════════════════════════════════════
--  Synthèse nationale : nombre de sites derrière chaque moyenne de pilier.
--
--  Parcours de l'interface du 2026-10-14 (U3) : une moyenne de pilier sur 3
--  sites calculables s'affichait comme celle sur 40, sans le dire. Chaque
--  moyenne `moy_p_*` porte désormais son effectif `nb_p_*` (sites dont le
--  pilier est calculable pour le mois).
--
--  La ventilation par programme ne retient que les programmes éligibles
--  (`dim_site_programme.actif`, administré dans la console, ADR 0020).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_synthese_nationale;

CREATE MATERIALIZED VIEW mv_synthese_nationale AS
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
tous AS (
    SELECT m.mois_paqd, s.region, s.district,
           h.score_composite, h.classification,
           h.p_completude, h.p_promptitude, h.p_regularite,
           h.p_ecart_sdu, h.p_concordance, h.p_ajustements
    FROM mois m
    CROSS JOIN sites s
    LEFT JOIN dqa.hist_score_site h
           ON h.site_id = s.site_id AND h.mois_paqd = m.mois_paqd AND h.programme_id IS NULL
),
parprog AS (
    SELECT m.mois_paqd, g.programme_id, s.region, s.district,
           h.score_composite, h.classification,
           h.p_completude, h.p_promptitude, h.p_regularite,
           h.p_ecart_sdu, h.p_concordance, h.p_ajustements
    FROM mois m
    CROSS JOIN gerant g
    JOIN sites s ON s.site_id = g.site_id
    LEFT JOIN dqa.hist_score_site h
           ON h.site_id = g.site_id AND h.mois_paqd = m.mois_paqd AND h.programme_id = g.programme_id
)
SELECT
    mois_paqd,
    NULL::text                                                         AS programme_id,
    CASE WHEN grouping(region) = 1 THEN NULL ELSE region END           AS region,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END       AS district,
    count(*)                                                           AS nb_sites,
    count(*) FILTER (WHERE score_composite IS NOT NULL)                AS nb_mesures,
    round(avg(score_composite), 1)::numeric(5, 1)                      AS score_composite_moyen,
    count(*) FILTER (WHERE classification = 'CONFORME')                AS nb_conforme,
    count(*) FILTER (WHERE classification = 'PARTIELLEMENT_CONFORME')  AS nb_partiellement_conforme,
    count(*) FILTER (WHERE classification = 'NON_CONFORME')            AS nb_non_conforme,
    count(*) FILTER (WHERE score_composite IS NULL)                    AS nb_sans_mesure,
    round(avg(p_completude), 1)::numeric(5, 1)  AS moy_p_completude,
    round(avg(p_promptitude), 1)::numeric(5, 1) AS moy_p_promptitude,
    round(avg(p_regularite), 1)::numeric(5, 1)  AS moy_p_regularite,
    round(avg(p_ecart_sdu), 1)::numeric(5, 1)   AS moy_p_ecart_sdu,
    round(avg(p_concordance), 1)::numeric(5, 1) AS moy_p_concordance,
    round(avg(p_ajustements), 1)::numeric(5, 1) AS moy_p_ajustements,
    count(p_completude)  AS nb_p_completude,
    count(p_promptitude) AS nb_p_promptitude,
    count(p_regularite)  AS nb_p_regularite,
    count(p_ecart_sdu)   AS nb_p_ecart_sdu,
    count(p_concordance) AS nb_p_concordance,
    count(p_ajustements) AS nb_p_ajustements
FROM tous
GROUP BY GROUPING SETS ((mois_paqd), (mois_paqd, region), (mois_paqd, region, district))
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(district) = 1 OR district IS NOT NULL)
UNION ALL
SELECT
    mois_paqd,
    programme_id,
    CASE WHEN grouping(region) = 1 THEN NULL ELSE region END,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END,
    count(*),
    count(*) FILTER (WHERE score_composite IS NOT NULL),
    round(avg(score_composite), 1)::numeric(5, 1),
    count(*) FILTER (WHERE classification = 'CONFORME'),
    count(*) FILTER (WHERE classification = 'PARTIELLEMENT_CONFORME'),
    count(*) FILTER (WHERE classification = 'NON_CONFORME'),
    count(*) FILTER (WHERE score_composite IS NULL),
    round(avg(p_completude), 1)::numeric(5, 1),
    round(avg(p_promptitude), 1)::numeric(5, 1),
    round(avg(p_regularite), 1)::numeric(5, 1),
    round(avg(p_ecart_sdu), 1)::numeric(5, 1),
    round(avg(p_concordance), 1)::numeric(5, 1),
    round(avg(p_ajustements), 1)::numeric(5, 1),
    count(p_completude), count(p_promptitude), count(p_regularite),
    count(p_ecart_sdu), count(p_concordance), count(p_ajustements)
FROM parprog
GROUP BY GROUPING SETS ((mois_paqd, programme_id), (mois_paqd, programme_id, region),
                        (mois_paqd, programme_id, region, district))
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(district) = 1 OR district IS NOT NULL);

CREATE UNIQUE INDEX mv_synthese_nationale_uq
    ON mv_synthese_nationale
       (mois_paqd, coalesce(programme_id, ''), coalesce(region, ''), coalesce(district, ''));
