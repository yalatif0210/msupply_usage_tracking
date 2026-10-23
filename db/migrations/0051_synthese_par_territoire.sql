-- ═══════════════════════════════════════════════════════════════════════════
--  Synthèse nationale par territoire (Région, zone de district, site).
--
--  Deux vues, au grain région / zone / site, par mois, programme (NULL = tous)
--  et strate (NULL = toutes) :
--    - mv_synthese_territoire_rapports : réquisitions et inventaires de fin de
--      mois attendus, réalisés, à l'heure, et leurs taux, lus des comptes bruts
--      gelés (`hist_pilier_brut`), comme la vue par strate ;
--    - mv_synthese_territoire_scores : score composite moyen, sites mesurés et
--      répartition des classifications, lus de `hist_score_site`, comme la
--      synthèse nationale.
--  Une zone de district compte tous les sites rattachés au district, magasin
--  du district sanitaire compris. Région ou district vide : regroupés sous
--  « Région non renseignée » / « District non renseigné », jamais écartés.
--
--  Les vues existantes (mv_synthese_nationale, mv_synthese_rapports) ne
--  changent pas : la lecture par strate et les lectures par district restent
--  servies à l'identique.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE FUNCTION dqa.libelle_region(p_region text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(nullif(trim(p_region), ''), 'Région non renseignée')
$$;

CREATE FUNCTION dqa.libelle_district(p_district text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(nullif(trim(p_district), ''), 'District non renseigné')
$$;

-- ══ Rapports et inventaires par territoire ════════════════════════════════
CREATE MATERIALIZED VIEW mv_synthese_territoire_rapports AS
WITH brut AS (
    SELECT b.mois_paqd, b.site_id, b.programme_id, b.mesure,
           b.nb_attendu, b.nb_realise, b.nb_a_lheure,
           dqa.libelle_region(s.region)     AS region,
           dqa.libelle_district(s.district) AS district,
           dqa.strate_de(s.type_structure)  AS strate
    FROM dqa.hist_pilier_brut b
    JOIN dqa.dim_site s ON s.site_id = b.site_id AND s.dans_perimetre_dqa
    WHERE b.programme_id IS NOT NULL
      AND b.mesure IN ('p1_requisitions', 'p2_requisitions', 'p2_inventaires')
),
agg AS (
    SELECT
        mois_paqd,
        region,
        CASE WHEN grouping(district) = 1 THEN NULL ELSE district END         AS district,
        CASE WHEN grouping(site_id) = 1 THEN NULL ELSE site_id END           AS site_id,
        CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
        CASE WHEN grouping(strate) = 1 THEN NULL ELSE strate END             AS strate,
        CASE WHEN grouping(site_id) = 0 THEN 'site'
             WHEN grouping(district) = 0 THEN 'zone'
             ELSE 'region' END                                               AS niveau,
        count(DISTINCT site_id)::int                                         AS nb_sites,
        coalesce(sum(nb_attendu)  FILTER (WHERE mesure = 'p1_requisitions'), 0)::int AS req_attendu,
        coalesce(sum(nb_realise)  FILTER (WHERE mesure = 'p1_requisitions'), 0)::int AS req_realise,
        coalesce(sum(nb_a_lheure) FILTER (WHERE mesure = 'p2_requisitions'), 0)::int AS req_a_lheure,
        coalesce(sum(nb_attendu)  FILTER (WHERE mesure = 'p2_inventaires'), 0)::int  AS inv_attendu,
        coalesce(sum(nb_realise)  FILTER (WHERE mesure = 'p2_inventaires'), 0)::int  AS inv_realise,
        coalesce(sum(nb_a_lheure) FILTER (WHERE mesure = 'p2_inventaires'), 0)::int  AS inv_a_lheure
    FROM brut
    GROUP BY mois_paqd, region,
             GROUPING SETS ((), (district), (district, site_id)),
             GROUPING SETS ((), (programme_id)),
             GROUPING SETS ((), (strate))
)
SELECT agg.*,
       round(100.0 * req_realise  / nullif(req_attendu, 0), 1) AS req_taux_realise,
       round(100.0 * req_a_lheure / nullif(req_attendu, 0), 1) AS req_taux_a_lheure,
       round(100.0 * inv_realise  / nullif(inv_attendu, 0), 1) AS inv_taux_realise,
       round(100.0 * inv_a_lheure / nullif(inv_attendu, 0), 1) AS inv_taux_a_lheure
FROM agg;

CREATE INDEX mv_synthese_territoire_rapports_idx
    ON mv_synthese_territoire_rapports (mois_paqd, niveau, region, district);

-- ══ Scores par territoire ═════════════════════════════════════════════════
CREATE MATERIALIZED VIEW mv_synthese_territoire_scores AS
WITH mois AS (
    SELECT DISTINCT mois_paqd FROM dqa.hist_score_site
),
sites AS (
    SELECT site_id,
           dqa.libelle_region(region)     AS region,
           dqa.libelle_district(district) AS district,
           dqa.strate_de(type_structure)  AS strate
    FROM dqa.dim_site WHERE dans_perimetre_dqa
),
gerant AS (
    SELECT sp.site_id, sp.programme_id
    FROM dqa.dim_site_programme sp
    JOIN sites s ON s.site_id = sp.site_id
    WHERE sp.actif
),
base AS (
    SELECT m.mois_paqd, NULL::text AS programme_id, s.site_id, s.region, s.district, s.strate,
           h.score_composite, h.classification,
           (h.p_completude  IS NOT NULL)::int + (h.p_promptitude IS NOT NULL)::int
         + (h.p_regularite  IS NOT NULL)::int + (h.p_ecart_sdu   IS NOT NULL)::int
         + (h.p_concordance IS NOT NULL)::int + (h.p_ajustements IS NOT NULL)::int AS piliers_couverts
    FROM mois m
    CROSS JOIN sites s
    LEFT JOIN dqa.hist_score_site h
           ON h.site_id = s.site_id AND h.mois_paqd = m.mois_paqd AND h.programme_id IS NULL
    UNION ALL
    SELECT m.mois_paqd, g.programme_id, s.site_id, s.region, s.district, s.strate,
           h.score_composite, h.classification,
           (h.p_completude  IS NOT NULL)::int + (h.p_promptitude IS NOT NULL)::int
         + (h.p_regularite  IS NOT NULL)::int + (h.p_ecart_sdu   IS NOT NULL)::int
         + (h.p_concordance IS NOT NULL)::int + (h.p_ajustements IS NOT NULL)::int
    FROM mois m
    CROSS JOIN gerant g
    JOIN sites s ON s.site_id = g.site_id
    LEFT JOIN dqa.hist_score_site h
           ON h.site_id = g.site_id AND h.mois_paqd = m.mois_paqd AND h.programme_id = g.programme_id
)
SELECT
    mois_paqd,
    programme_id,
    region,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END AS district,
    CASE WHEN grouping(site_id) = 1 THEN NULL ELSE site_id END   AS site_id,
    CASE WHEN grouping(strate) = 1 THEN NULL ELSE strate END     AS strate,
    CASE WHEN grouping(site_id) = 0 THEN 'site'
         WHEN grouping(district) = 0 THEN 'zone'
         ELSE 'region' END                                       AS niveau,
    count(*)::int                                                AS nb_sites,
    (count(*) FILTER (WHERE score_composite IS NOT NULL))::int   AS nb_mesures,
    round(avg(score_composite), 1)::numeric(5, 1)                AS score_composite_moyen,
    (count(*) FILTER (WHERE classification = 'CONFORME'))::int                AS nb_conforme,
    (count(*) FILTER (WHERE classification = 'PARTIELLEMENT_CONFORME'))::int  AS nb_partiellement_conforme,
    (count(*) FILTER (WHERE classification = 'NON_CONFORME'))::int            AS nb_non_conforme,
    (count(*) FILTER (WHERE score_composite IS NULL))::int                    AS nb_sans_mesure,
    -- grain site : une seule ligne, ses propres valeurs
    max(classification)                                          AS classification,
    max(piliers_couverts)::int                                   AS piliers_couverts
FROM base
GROUP BY mois_paqd, programme_id, region,
         GROUPING SETS ((), (district), (district, site_id)),
         GROUPING SETS ((), (strate));

CREATE INDEX mv_synthese_territoire_scores_idx
    ON mv_synthese_territoire_scores (mois_paqd, niveau, region, district);

-- ══ Gel : rafraîchit aussi les synthèses par territoire ═══════════════════
-- Identique à la migration 0048, plus les deux vues ci-dessus et le retrait
-- des comptes périmés d'un mois encore ouvert.
CREATE OR REPLACE PROCEDURE rafraichir_et_geler(p_lot_id bigint)
LANGUAGE plpgsql AS $$
DECLARE
    v_lot_id bigint;
BEGIN
    SELECT id INTO v_lot_id FROM dqa.import_lot WHERE id = p_lot_id;

    REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
    REFRESH MATERIALIZED VIEW dqa.mv_p2_promptitude;
    REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
    REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart_produit;
    REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
    REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
    REFRESH MATERIALIZED VIEW dqa.mv_p6_ajustements;
    REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;

    INSERT INTO dqa.hist_score_site
        (site_id, mois_paqd, programme_id, grille_id,
         p_completude, p_promptitude, p_regularite, p_ecart_sdu,
         p_concordance, p_ajustements,
         sc_completude_requisitions, sc_completude_receptions,
         sc_promptitude_inventaires, sc_promptitude_requisitions, sc_regularite_saisie,
         sc_ecart_sdu, sc_ecart_consommation, sc_concordance, sc_ratio_ajustements,
         score_composite, classification, lot_id, calcule_le)
    SELECT sp.site_id, sp.mois_paqd, sp.programme_id, dqa.grille_pour_mois(sp.mois_paqd),
           sp.p_completude, sp.p_promptitude, sp.p_regularite, sp.p_ecart_sdu,
           sp.p_concordance, sp.p_ajustements,
           sp.sc_completude_requisitions, sp.sc_completude_receptions,
           sp.sc_promptitude_inventaires, sp.sc_promptitude_requisitions, sp.sc_regularite_saisie,
           sp.sc_ecart_sdu, sp.sc_ecart_consommation, sp.sc_concordance, sp.sc_ratio_ajustements,
           sp.score_composite, sp.classification, v_lot_id, now()
    FROM dqa.mv_score_pilier sp
    JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
    ON CONFLICT (site_id, mois_paqd, programme_id) DO UPDATE SET
        grille_id                   = EXCLUDED.grille_id,
        p_completude                = EXCLUDED.p_completude,
        p_promptitude               = EXCLUDED.p_promptitude,
        p_regularite                = EXCLUDED.p_regularite,
        p_ecart_sdu                 = EXCLUDED.p_ecart_sdu,
        p_concordance               = EXCLUDED.p_concordance,
        p_ajustements               = EXCLUDED.p_ajustements,
        sc_completude_requisitions  = EXCLUDED.sc_completude_requisitions,
        sc_completude_receptions    = EXCLUDED.sc_completude_receptions,
        sc_promptitude_inventaires  = EXCLUDED.sc_promptitude_inventaires,
        sc_promptitude_requisitions = EXCLUDED.sc_promptitude_requisitions,
        sc_regularite_saisie        = EXCLUDED.sc_regularite_saisie,
        sc_ecart_sdu                = EXCLUDED.sc_ecart_sdu,
        sc_ecart_consommation       = EXCLUDED.sc_ecart_consommation,
        sc_concordance              = EXCLUDED.sc_concordance,
        sc_ratio_ajustements        = EXCLUDED.sc_ratio_ajustements,
        score_composite             = EXCLUDED.score_composite,
        classification              = EXCLUDED.classification,
        lot_id                      = EXCLUDED.lot_id,
        calcule_le                  = now();

    -- Un compte n'est figé que si sa sous-composante est calculable : avant
    -- l'échéance, aucun couple attendu / réalisé ne circule.
    INSERT INTO dqa.hist_pilier_brut
        (site_id, mois_paqd, programme_id, mesure, nb_attendu, nb_realise, nb_a_lheure, lot_id, calcule_le)
    SELECT sm.site_id, sm.mois_paqd, sm.programme_id, m.mesure,
           m.nb_attendu::int, m.nb_realise::int, m.nb_a_lheure::int, v_lot_id, now()
    FROM (SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_score_pilier) sm
    JOIN dqa.dim_site s ON s.site_id = sm.site_id AND s.dans_perimetre_dqa
    LEFT JOIN dqa.mv_p1_completude  p1 ON p1.site_id = sm.site_id AND p1.mois_paqd = sm.mois_paqd AND p1.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p2_promptitude p2 ON p2.site_id = sm.site_id AND p2.mois_paqd = sm.mois_paqd AND p2.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p3_regularite  p3 ON p3.site_id = sm.site_id AND p3.mois_paqd = sm.mois_paqd AND p3.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p4_ecart       p4 ON p4.site_id = sm.site_id AND p4.mois_paqd = sm.mois_paqd AND p4.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p5_concordance p5 ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd AND p5.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p6_ajustements p6 ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd AND p6.programme_id IS NOT DISTINCT FROM sm.programme_id
    CROSS JOIN LATERAL (VALUES
        ('p1_requisitions',       p1.nb_requisitions_attendu, p1.nb_requisitions_realise,  NULL::int,                     p1.completude_requisitions_pct),
        ('p1_receptions',         p1.nb_factures,             p1.nb_factures_acceptees,    NULL::int,                     p1.completude_receptions_pct),
        ('p2_inventaires',        p2.nb_inventaires_attendu,  p2.nb_inventaires_realise,   p2.nb_inventaires_a_lheure,    p2.promptitude_inventaires_pct),
        ('p2_requisitions',       p2.nb_requisitions_attendu, p2.nb_requisitions_realise,  p2.nb_requisitions_a_lheure,   p2.promptitude_requisitions_pct),
        ('p3_regularite',         p3.nb_jours,                p3.nb_jours_avec_sortie,     NULL::int,                     p3.taux_regularite_pct),
        ('p4_ecart_sdu',          p4.nb_produits_sdu,         p4.nb_conformes_sdu,         NULL::int,                     p4.taux_sdu_pct),
        ('p4_ecart_consommation', p4.nb_produits_conso,       p4.nb_conformes_conso,       NULL::int,                     p4.taux_conso_pct),
        ('p5_concordance',        p5.nb_produits,             p5.nb_produits_conformes,    NULL::int,                     p5.taux_concordance_pct),
        ('p6_ajustements',        p6.nb_mouvements,           p6.nb_ajustements,           NULL::int,                     p6.ratio_ajustements_pct)
    ) AS m(mesure, nb_attendu, nb_realise, nb_a_lheure, pct)
    WHERE m.pct IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_hist_pilier_brut DO UPDATE SET
        nb_attendu  = EXCLUDED.nb_attendu,
        nb_realise  = EXCLUDED.nb_realise,
        nb_a_lheure = EXCLUDED.nb_a_lheure,
        lot_id      = EXCLUDED.lot_id,
        calcule_le  = now();

    -- Un compte devenu non calculable (mois rouvert par la nouvelle règle des
    -- échéances, programme retiré) ne doit pas survivre à côté d'un score nul.
    -- Sur un mois encore ouvert, un compte figé sous l'ancienne règle pour un
    -- couple qui n'a plus de score (programme désormais non éligible, échéance
    -- non arrivée) est retiré aussi : sinon les synthèses le recomptent (lot
    -- du 2026-10-14, 76 réquisitions « attendues » en octobre). Les mois clos
    -- gardent leur historique.
    DELETE FROM dqa.hist_pilier_brut b
    WHERE b.mesure IN ('p1_requisitions', 'p1_receptions', 'p2_inventaires', 'p2_requisitions')
      AND (EXISTS (SELECT 1 FROM dqa.mv_score_pilier sp
                    WHERE sp.site_id = b.site_id AND sp.mois_paqd = b.mois_paqd
                      AND sp.programme_id IS NOT DISTINCT FROM b.programme_id)
           OR NOT dqa.mois_est_clos(b.mois_paqd))
      AND NOT EXISTS (
          SELECT 1 FROM dqa.mv_p1_completude p1
          WHERE p1.site_id = b.site_id AND p1.mois_paqd = b.mois_paqd
            AND p1.programme_id IS NOT DISTINCT FROM b.programme_id
            AND ((b.mesure = 'p1_requisitions' AND p1.completude_requisitions_pct IS NOT NULL)
              OR (b.mesure = 'p1_receptions'   AND p1.completude_receptions_pct IS NOT NULL))
          UNION ALL
          SELECT 1 FROM dqa.mv_p2_promptitude p2
          WHERE p2.site_id = b.site_id AND p2.mois_paqd = b.mois_paqd
            AND p2.programme_id IS NOT DISTINCT FROM b.programme_id
            AND ((b.mesure = 'p2_inventaires'  AND p2.promptitude_inventaires_pct IS NOT NULL)
              OR (b.mesure = 'p2_requisitions' AND p2.promptitude_requisitions_pct IS NOT NULL)));

    REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_territoire_rapports;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_territoire_scores;
END;
$$;

-- ── Rattrapage : retire les comptes périmés, peuple les nouvelles vues ────
CALL dqa.rafraichir_et_geler(NULL);
