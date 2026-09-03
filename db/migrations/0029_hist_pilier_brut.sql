-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Gel des comptes bruts des piliers (extension de l'ADR 0007)
--
--  `hist_score_site` fige les scores de pilier et les dix valeurs sc_*.
--  `hist_pilier_brut` fige, au même passage, les COUPLES attendu / réalisé qui
--  produisent ces valeurs : « 3 réceptions sur 5 factures », « 4 inventaires
--  sur 5 programmes gérés »… Une donnée brute qui contredit la note qu'elle
--  explique n'aide personne ; les comptes sont déjà calculés au moment du gel,
--  les écrire coûte quasi rien.
--
--  Format en lignes longues : une ligne par (site, mois, programme, mesure).
--  Le jeu de mesures va bouger (P2..P6 aux tickets suivants) ; une table en
--  lignes longues encaisse sans ALTER TABLE et s'agrège par GROUP BY pour les
--  lectures nationales.
--
--  Le détail transaction par transaction derrière un compte brut n'est PAS
--  figé : il est lu en direct du core, avec un avertissement si le core a été
--  ré-importé après le gel (`calcule_le` < core `maj_le`).
--
--  Ce ticket (02) fige les trois mesures de P1 et rattrape les mois déjà
--  clos. P2..P6 suivent au ticket 03.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE hist_pilier_brut (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id      text        NOT NULL REFERENCES dim_site (site_id),
    mois_paqd    text        NOT NULL,
    programme_id text REFERENCES dim_programme (programme_id),
    mesure       text        NOT NULL,
    nb_attendu   integer,
    nb_realise   integer,
    nb_a_lheure  integer,
    lot_id       bigint REFERENCES import_lot (id),
    calcule_le   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_hist_pilier_brut
        UNIQUE NULLS NOT DISTINCT (site_id, mois_paqd, programme_id, mesure)
);

COMMENT ON TABLE hist_pilier_brut IS
    'Couples attendu / réalisé des sous-composantes, figés mois par mois au même passage que hist_score_site (ADR 0007). Lignes longues : mesure ∈ p1_inventaires, p1_requisitions, p1_receptions, p2_inventaires, p2_requisitions, p3_regularite, p4_ecart_sdu, p4_ecart_consommation, p5_concordance, p6_ajustements.';

CREATE INDEX idx_hist_pilier_brut_mois ON hist_pilier_brut (mois_paqd, mesure);

-- ── rafraichir_et_geler — fige aussi les comptes bruts de P1 ────────────────
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

    -- ── Comptes bruts P1 (mesures NON_CALCULABLE — pct nul — non figées) ───
    INSERT INTO dqa.hist_pilier_brut
        (site_id, mois_paqd, programme_id, mesure, nb_attendu, nb_realise, nb_a_lheure, lot_id, calcule_le)
    SELECT p1.site_id, p1.mois_paqd, p1.programme_id, m.mesure, m.nb_attendu, m.nb_realise, NULL::int, p_lot_id, now()
    FROM dqa.mv_p1_completude p1
    JOIN dqa.dim_site s ON s.site_id = p1.site_id AND s.dans_perimetre_dqa
    CROSS JOIN LATERAL (VALUES
        ('p1_inventaires',  p1.nb_inventaires_attendu,  p1.nb_inventaires_realise,  p1.completude_inventaires_pct),
        ('p1_requisitions', p1.nb_requisitions_attendu, p1.nb_requisitions_realise, p1.completude_requisitions_pct),
        ('p1_receptions',   p1.nb_factures,             p1.nb_receptions,           p1.completude_receptions_pct)
    ) AS m(mesure, nb_attendu, nb_realise, pct)
    WHERE p1.mois_paqd = v_mois AND m.pct IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_hist_pilier_brut DO UPDATE SET
        nb_attendu  = EXCLUDED.nb_attendu,
        nb_realise  = EXCLUDED.nb_realise,
        nb_a_lheure = EXCLUDED.nb_a_lheure,
        lot_id      = EXCLUDED.lot_id,
        calcule_le  = now();

    REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
END;
$$;

-- ── Rattrapage one-shot : comptes bruts P1 des mois déjà clos ───────────────
REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;

INSERT INTO dqa.hist_pilier_brut
    (site_id, mois_paqd, programme_id, mesure, nb_attendu, nb_realise, nb_a_lheure, lot_id, calcule_le)
SELECT p1.site_id, p1.mois_paqd, p1.programme_id, m.mesure, m.nb_attendu, m.nb_realise, NULL::int, il.id, now()
FROM dqa.mv_p1_completude p1
JOIN dqa.dim_site s ON s.site_id = p1.site_id AND s.dans_perimetre_dqa
JOIN LATERAL (
    SELECT id FROM dqa.import_lot
    WHERE mois_paqd = p1.mois_paqd AND statut = 'valide'
    ORDER BY id DESC LIMIT 1
) il ON true
CROSS JOIN LATERAL (VALUES
    ('p1_inventaires',  p1.nb_inventaires_attendu,  p1.nb_inventaires_realise,  p1.completude_inventaires_pct),
    ('p1_requisitions', p1.nb_requisitions_attendu, p1.nb_requisitions_realise, p1.completude_requisitions_pct),
    ('p1_receptions',   p1.nb_factures,             p1.nb_receptions,           p1.completude_receptions_pct)
) AS m(mesure, nb_attendu, nb_realise, pct)
WHERE m.pct IS NOT NULL
ON CONFLICT ON CONSTRAINT uq_hist_pilier_brut DO NOTHING;
