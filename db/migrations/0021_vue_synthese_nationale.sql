-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Synthèse nationale
--
--  Agrège `hist_score_site` (déjà porteur du score composite, de la
--  classification et des six scores de pilier par (site, mois, programme)) en
--  un état national par mois PAQD, à plusieurs niveaux :
--    - national               (programme NULL, region NULL, district NULL)
--    - par région             (programme NULL, region,      district NULL)
--    - par district           (programme NULL, region,      district)
--    - national d'un programme (programme,     region NULL, district NULL)
--    - programme par région    (programme,     region,      district NULL)
--    - programme par district  (programme,     region,      district)
--
--  Les niveaux « tous programmes » lisent les lignes `hist.programme_id IS
--  NULL` ; les niveaux « par programme » lisent les lignes du programme, sur
--  les seuls sites qui le gèrent (`dim_site_programme` actif).
--
--  Un site du périmètre sans ligne `hist` pour le mois compte dans `nb_sites`
--  et `nb_sans_mesure` — jamais exclu, jamais NON_CONFORME. Le score moyen et
--  les moyennes de pilier ne portent que sur les valeurs non nulles.
--
--  Lecture seule pour l'API (CLAUDE.md §3). Rafraîchie par `rafraichir_et_geler`
--  APRÈS le gel de `hist_score_site`, hors transaction du lot (ADR 0003).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_synthese_nationale CASCADE;
CREATE MATERIALIZED VIEW mv_synthese_nationale AS
WITH mois AS (
    SELECT DISTINCT mois_paqd FROM dqa.hist_score_site
),
sites AS (
    SELECT site_id, region, district
    FROM dqa.dim_site
    WHERE dans_perimetre_dqa
),
gerant AS (
    SELECT sp.site_id, sp.programme_id
    FROM dqa.dim_site_programme sp
    JOIN sites s ON s.site_id = sp.site_id
    WHERE sp.actif
),
-- un enregistrement par (mois, site) — score gelé « tous programmes »
tous AS (
    SELECT m.mois_paqd, s.region, s.district,
           h.score_composite, h.classification,
           h.p_completude, h.p_promptitude, h.p_regularite,
           h.p_ecart_sdu, h.p_concordance, h.p_ajustements
    FROM mois m
    CROSS JOIN sites s
    LEFT JOIN dqa.hist_score_site h
           ON h.site_id = s.site_id AND h.mois_paqd = m.mois_paqd
          AND h.programme_id IS NULL
),
-- un enregistrement par (mois, site gérant, programme)
parprog AS (
    SELECT m.mois_paqd, g.programme_id, s.region, s.district,
           h.score_composite, h.classification,
           h.p_completude, h.p_promptitude, h.p_regularite,
           h.p_ecart_sdu, h.p_concordance, h.p_ajustements
    FROM mois m
    CROSS JOIN gerant g
    JOIN sites s ON s.site_id = g.site_id
    LEFT JOIN dqa.hist_score_site h
           ON h.site_id = g.site_id AND h.mois_paqd = m.mois_paqd
          AND h.programme_id = g.programme_id
)
SELECT
    mois_paqd,
    NULL::text                                                       AS programme_id,
    CASE WHEN grouping(region)   = 1 THEN NULL ELSE region   END     AS region,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END     AS district,
    count(*)                                                         AS nb_sites,
    count(*) FILTER (WHERE score_composite IS NOT NULL)              AS nb_mesures,
    round(avg(score_composite), 1)::numeric(5, 1)                    AS score_composite_moyen,
    count(*) FILTER (WHERE classification = 'CONFORME')              AS nb_conforme,
    count(*) FILTER (WHERE classification = 'PARTIELLEMENT_CONFORME') AS nb_partiellement_conforme,
    count(*) FILTER (WHERE classification = 'NON_CONFORME')          AS nb_non_conforme,
    count(*) FILTER (WHERE score_composite IS NULL)                  AS nb_sans_mesure,
    round(avg(p_completude),  1)::numeric(5, 1)                      AS moy_p_completude,
    round(avg(p_promptitude), 1)::numeric(5, 1)                      AS moy_p_promptitude,
    round(avg(p_regularite),  1)::numeric(5, 1)                      AS moy_p_regularite,
    round(avg(p_ecart_sdu),   1)::numeric(5, 1)                      AS moy_p_ecart_sdu,
    round(avg(p_concordance), 1)::numeric(5, 1)                      AS moy_p_concordance,
    round(avg(p_ajustements), 1)::numeric(5, 1)                      AS moy_p_ajustements
FROM tous
GROUP BY GROUPING SETS (
    (mois_paqd),
    (mois_paqd, region),
    (mois_paqd, region, district)
)
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(district) = 1 OR district IS NOT NULL)

UNION ALL

SELECT
    mois_paqd,
    programme_id,
    CASE WHEN grouping(region)   = 1 THEN NULL ELSE region   END,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END,
    count(*),
    count(*) FILTER (WHERE score_composite IS NOT NULL),
    round(avg(score_composite), 1)::numeric(5, 1),
    count(*) FILTER (WHERE classification = 'CONFORME'),
    count(*) FILTER (WHERE classification = 'PARTIELLEMENT_CONFORME'),
    count(*) FILTER (WHERE classification = 'NON_CONFORME'),
    count(*) FILTER (WHERE score_composite IS NULL),
    round(avg(p_completude),  1)::numeric(5, 1),
    round(avg(p_promptitude), 1)::numeric(5, 1),
    round(avg(p_regularite),  1)::numeric(5, 1),
    round(avg(p_ecart_sdu),   1)::numeric(5, 1),
    round(avg(p_concordance), 1)::numeric(5, 1),
    round(avg(p_ajustements), 1)::numeric(5, 1)
FROM parprog
GROUP BY GROUPING SETS (
    (mois_paqd, programme_id),
    (mois_paqd, programme_id, region),
    (mois_paqd, programme_id, region, district)
)
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(district) = 1 OR district IS NOT NULL);

CREATE UNIQUE INDEX mv_synthese_nationale_uq
    ON mv_synthese_nationale
       (mois_paqd, coalesce(programme_id, ''), coalesce(region, ''), coalesce(district, ''));

-- ── Procédure de rafraîchissement — ajoute la synthèse en dernier ─────────
CREATE OR REPLACE PROCEDURE rafraichir_et_geler(p_lot_id bigint)
LANGUAGE plpgsql AS $$
DECLARE
    v_mois   text;
    v_grille bigint;
BEGIN
    REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
    REFRESH MATERIALIZED VIEW dqa.mv_p2_promptitude;
    REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
    REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
    REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
    REFRESH MATERIALIZED VIEW dqa.mv_p6_ajustements;
    REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;

    SELECT mois_paqd INTO v_mois FROM dqa.import_lot WHERE id = p_lot_id;
    IF v_mois IS NULL THEN
        -- synthèse quand même rafraîchie : un lot sans mois ne change rien
        REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
        RETURN;
    END IF;
    v_grille := dqa.grille_pour_mois(v_mois);

    INSERT INTO dqa.hist_score_site
        (site_id, mois_paqd, programme_id, grille_id,
         p_completude, p_promptitude, p_regularite, p_ecart_sdu,
         p_concordance, p_ajustements, score_composite, classification,
         lot_id, calcule_le)
    SELECT sp.site_id, sp.mois_paqd, sp.programme_id, v_grille,
           sp.p_completude, sp.p_promptitude, sp.p_regularite, sp.p_ecart_sdu,
           sp.p_concordance, sp.p_ajustements, sp.score_composite, sp.classification,
           p_lot_id, now()
    FROM dqa.mv_score_pilier sp
    JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
    WHERE sp.mois_paqd = v_mois
    ON CONFLICT (site_id, mois_paqd, programme_id) DO UPDATE SET
        grille_id       = EXCLUDED.grille_id,
        p_completude    = EXCLUDED.p_completude,
        p_promptitude   = EXCLUDED.p_promptitude,
        p_regularite    = EXCLUDED.p_regularite,
        p_ecart_sdu     = EXCLUDED.p_ecart_sdu,
        p_concordance   = EXCLUDED.p_concordance,
        p_ajustements   = EXCLUDED.p_ajustements,
        score_composite = EXCLUDED.score_composite,
        classification  = EXCLUDED.classification,
        lot_id          = EXCLUDED.lot_id,
        calcule_le      = now();

    -- lit l'historique fraîchement gelé
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
END;
$$;
