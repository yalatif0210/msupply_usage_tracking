-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Synthèse nationale « Rapports & inventaires »
--
--  Agrège `hist_pilier_brut` (mesures P1 / P2 des réquisitions et des
--  inventaires de fin de mois) par STRATE de structure, par mois PAQD, avec les
--  lignes « toutes régions » / « tous programmes », sur le modèle de
--  `mv_synthese_nationale` (migration 0021).
--
--  L'« attendu » national est compté PAR PROGRAMME GÉRÉ : la vue ne lit que les
--  lignes `hist_pilier_brut.programme_id IS NOT NULL` (le grain par programme
--  géré), jamais la ligne agrégée `programme_id IS NULL` — sinon chaque site
--  serait compté deux fois. Les chiffres se réconcilient ainsi avec P1 / P2,
--  dont le dénominateur est le nombre de programmes gérés.
--
--   réquisitions : attendu   = Σ nb_attendu   (mesure p1_requisitions)
--                  réalisé   = Σ nb_realise   (mesure p1_requisitions)
--                  à l'heure = Σ nb_a_lheure  (mesure p2_requisitions)
--   inventaires  : idem avec p1_inventaires / p2_inventaires.
--  (P1 et P2 portent le même « attendu » — on lit celui de P1.)
--
--  La strate est un regroupement d'affichage non gelé (voir 0031,
--  `strate_de`) : un `type_structure` non référencé tombe dans « Non classé ».
--  Une strate sans site du périmètre pour le mois n'a simplement pas de ligne.
--
--  Lecture seule pour l'API (CLAUDE.md §3). Rafraîchie par `rafraichir_et_geler`
--  après le gel de `hist_pilier_brut`.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_synthese_rapports CASCADE;
CREATE MATERIALIZED VIEW mv_synthese_rapports AS
WITH brut AS (
    SELECT
        b.mois_paqd,
        dqa.strate_de(s.type_structure) AS strate,
        s.region,
        b.programme_id,
        b.mesure,
        b.nb_attendu,
        b.nb_realise,
        b.nb_a_lheure
    FROM dqa.hist_pilier_brut b
    JOIN dqa.dim_site s ON s.site_id = b.site_id AND s.dans_perimetre_dqa
    WHERE b.programme_id IS NOT NULL
      AND b.mesure IN ('p1_requisitions', 'p1_inventaires', 'p2_requisitions', 'p2_inventaires')
)
SELECT
    mois_paqd,
    strate,
    CASE WHEN grouping(region)       = 1 THEN NULL ELSE region       END AS region,
    CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
    coalesce(sum(nb_attendu)  FILTER (WHERE mesure = 'p1_requisitions'), 0)::int AS req_attendu,
    coalesce(sum(nb_realise)  FILTER (WHERE mesure = 'p1_requisitions'), 0)::int AS req_realise,
    coalesce(sum(nb_a_lheure) FILTER (WHERE mesure = 'p2_requisitions'), 0)::int AS req_a_lheure,
    coalesce(sum(nb_attendu)  FILTER (WHERE mesure = 'p1_inventaires'), 0)::int  AS inv_attendu,
    coalesce(sum(nb_realise)  FILTER (WHERE mesure = 'p1_inventaires'), 0)::int  AS inv_realise,
    coalesce(sum(nb_a_lheure) FILTER (WHERE mesure = 'p2_inventaires'), 0)::int  AS inv_a_lheure
FROM brut
GROUP BY GROUPING SETS (
    (mois_paqd, strate),
    (mois_paqd, strate, region),
    (mois_paqd, strate, programme_id),
    (mois_paqd, strate, region, programme_id)
)
-- écarte la ligne « par région » d'un site sans région : elle collisionnerait
-- avec la ligne « toutes régions » (même modèle que 0021).
HAVING (grouping(region)       = 1 OR region       IS NOT NULL)
   AND (grouping(programme_id) = 1 OR programme_id IS NOT NULL);

CREATE UNIQUE INDEX mv_synthese_rapports_uq
    ON mv_synthese_rapports
       (mois_paqd, strate, coalesce(region, ''), coalesce(programme_id, ''));

-- ── Procédure de rafraîchissement — reprend 0030 et ajoute la synthèse rapports ──
CREATE OR REPLACE PROCEDURE rafraichir_et_geler(p_lot_id bigint)
LANGUAGE plpgsql AS $$
DECLARE
    v_mois   text;
    v_grille bigint;
BEGIN
    REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
    REFRESH MATERIALIZED VIEW dqa.mv_p2_promptitude;
    REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
    REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart_produit;
    REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
    REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
    REFRESH MATERIALIZED VIEW dqa.mv_p6_ajustements;
    REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;

    SELECT mois_paqd INTO v_mois FROM dqa.import_lot WHERE id = p_lot_id;
    IF v_mois IS NULL THEN
        REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
        REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
        RETURN;
    END IF;
    v_grille := dqa.grille_pour_mois(v_mois);

    INSERT INTO dqa.hist_score_site
        (site_id, mois_paqd, programme_id, grille_id,
         p_completude, p_promptitude, p_regularite, p_ecart_sdu,
         p_concordance, p_ajustements,
         sc_completude_inventaires, sc_completude_requisitions, sc_completude_receptions,
         sc_promptitude_inventaires, sc_promptitude_requisitions, sc_regularite_saisie,
         sc_ecart_sdu, sc_ecart_consommation, sc_concordance, sc_ratio_ajustements,
         score_composite, classification, lot_id, calcule_le)
    SELECT sp.site_id, sp.mois_paqd, sp.programme_id, v_grille,
           sp.p_completude, sp.p_promptitude, sp.p_regularite, sp.p_ecart_sdu,
           sp.p_concordance, sp.p_ajustements,
           sp.sc_completude_inventaires, sp.sc_completude_requisitions, sp.sc_completude_receptions,
           sp.sc_promptitude_inventaires, sp.sc_promptitude_requisitions, sp.sc_regularite_saisie,
           sp.sc_ecart_sdu, sp.sc_ecart_consommation, sp.sc_concordance, sp.sc_ratio_ajustements,
           sp.score_composite, sp.classification, p_lot_id, now()
    FROM dqa.mv_score_pilier sp
    JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
    WHERE sp.mois_paqd = v_mois
    ON CONFLICT (site_id, mois_paqd, programme_id) DO UPDATE SET
        grille_id                   = EXCLUDED.grille_id,
        p_completude                = EXCLUDED.p_completude,
        p_promptitude               = EXCLUDED.p_promptitude,
        p_regularite                = EXCLUDED.p_regularite,
        p_ecart_sdu                 = EXCLUDED.p_ecart_sdu,
        p_concordance               = EXCLUDED.p_concordance,
        p_ajustements               = EXCLUDED.p_ajustements,
        sc_completude_inventaires   = EXCLUDED.sc_completude_inventaires,
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

    -- ── Comptes bruts des dix mesures ─────────────────────────────────────
    INSERT INTO dqa.hist_pilier_brut
        (site_id, mois_paqd, programme_id, mesure, nb_attendu, nb_realise, nb_a_lheure, lot_id, calcule_le)
    SELECT sm.site_id, sm.mois_paqd, sm.programme_id, m.mesure,
           m.nb_attendu::int, m.nb_realise::int, m.nb_a_lheure::int, p_lot_id, now()
    FROM (SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_score_pilier WHERE mois_paqd = v_mois) sm
    JOIN dqa.dim_site s ON s.site_id = sm.site_id AND s.dans_perimetre_dqa
    LEFT JOIN dqa.mv_p1_completude  p1 ON p1.site_id = sm.site_id AND p1.mois_paqd = sm.mois_paqd AND p1.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p2_promptitude p2 ON p2.site_id = sm.site_id AND p2.mois_paqd = sm.mois_paqd AND p2.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p3_regularite  p3 ON p3.site_id = sm.site_id AND p3.mois_paqd = sm.mois_paqd AND p3.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p4_ecart       p4 ON p4.site_id = sm.site_id AND p4.mois_paqd = sm.mois_paqd AND p4.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p5_concordance p5 ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd AND p5.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p6_ajustements p6 ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd AND p6.programme_id IS NOT DISTINCT FROM sm.programme_id
    CROSS JOIN LATERAL (VALUES
        ('p1_inventaires',        p1.nb_inventaires_attendu,  p1.nb_inventaires_realise,   NULL::int,                     p1.completude_inventaires_pct),
        ('p1_requisitions',       p1.nb_requisitions_attendu, p1.nb_requisitions_realise,  NULL::int,                     p1.completude_requisitions_pct),
        ('p1_receptions',         p1.nb_factures,             p1.nb_receptions,            NULL::int,                     p1.completude_receptions_pct),
        ('p2_inventaires',        p2.nb_inventaires_attendu,  NULL::int,                   p2.nb_inventaires_a_lheure,    p2.promptitude_inventaires_pct),
        ('p2_requisitions',       p2.nb_requisitions_attendu, NULL::int,                   p2.nb_requisitions_a_lheure,   p2.promptitude_requisitions_pct),
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

    REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
END;
$$;

-- ── Rattrapage one-shot : remplit la synthèse rapports des mois déjà gelés ──
REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
