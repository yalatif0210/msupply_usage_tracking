-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Gel des comptes bruts : P2 à P6
--
--  Le ticket 02 (migration 0029) a posé `hist_pilier_brut` et figé les trois
--  mesures de P1. Ce ticket étend `rafraichir_et_geler` aux dix mesures :
--
--   p2_inventaires / p2_requisitions   : à l'heure / attendu (grain programme
--                                        géré ; « réalisé » vient de P1)
--   p3_regularite                       : jours avec sortie / jours du mois
--   p4_ecart_sdu / p4_ecart_consommation: produits conformes / évalués
--   p5_concordance                      : produits concordants / inventoriés
--   p6_ajustements                      : ajustements / mouvements
--
--  Une mesure NON_CALCULABLE (taux nul) n'est pas figée. Rattrapage one-shot
--  des mois déjà clos (DO NOTHING protège les lignes P1 déjà écrites).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

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
END;
$$;

-- ── Rattrapage one-shot : dix mesures des mois déjà clos ───────────────────
REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
REFRESH MATERIALIZED VIEW dqa.mv_p2_promptitude;
REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
REFRESH MATERIALIZED VIEW dqa.mv_p6_ajustements;
REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;

INSERT INTO dqa.hist_pilier_brut
    (site_id, mois_paqd, programme_id, mesure, nb_attendu, nb_realise, nb_a_lheure, lot_id, calcule_le)
SELECT sm.site_id, sm.mois_paqd, sm.programme_id, m.mesure,
       m.nb_attendu::int, m.nb_realise::int, m.nb_a_lheure::int, il.id, now()
FROM (SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_score_pilier) sm
JOIN dqa.dim_site s ON s.site_id = sm.site_id AND s.dans_perimetre_dqa
JOIN LATERAL (
    SELECT id FROM dqa.import_lot
    WHERE mois_paqd = sm.mois_paqd AND statut = 'valide'
    ORDER BY id DESC LIMIT 1
) il ON true
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
ON CONFLICT ON CONSTRAINT uq_hist_pilier_brut DO NOTHING;
