-- ═══════════════════════════════════════════════════════════════════════════
--  Produits écartés d'un inventaire (ticket 05,
--  .scratch/cloture-mois-et-composition-piliers).
--
--  Constat de site (tous programmes, par code produit), seulement quand le
--  site a ses deux inventaires : ouverture (clôture de n-1) et clôture de n
--  (ADR 0022). Sans effet sur le score.
--    - `absent_ouverture` : à la clôture, pas à l'ouverture. Stock minimal à
--      l'ouverture = compté clôture + sorties déclarées - réceptions. Les
--      sorties réelles sont au moins les déclarées : > 0 prouve que le
--      produit existait, `oubli_demontre` ; sinon `indetermine` (rupture
--      possible).
--    - `absent_cloture` : à l'ouverture, pas à la clôture ; il sort alors de
--      P4 et de P5 pour le mois. Stock attendu à la clôture = compté
--      ouverture + réceptions - sorties déclarées : borne haute (pertes non
--      saisies), > 0 donne `oubli_probable`, sinon `epuise`.
--  Sorties déclarées : dispensations, distributions pour un district (ADR 0012).
--  Mouvements dans (date d'ouverture, date de clôture], dates du site.
--
--  Historisé dans `hist_produit_ecarte` à chaque gel ; la synthèse par
--  territoire en compte les lignes (grain tous programmes).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE MATERIALIZED VIEW mv_produit_ecarte AS
WITH base AS (
    -- clôtures retenues, tous programmes, un code compte une fois (ADR 0016)
    SELECT site_id, mois_paqd, produit_code,
           max(libelle)          AS libelle,
           max(date_inventaire)  AS date_inventaire,
           sum(comptee)          AS comptee,
           bool_or(est_district) AS est_district
    FROM dqa.mv_p4_ecart_produit
    WHERE programme_id IS NULL
    GROUP BY site_id, mois_paqd, produit_code
),
cloture_site AS (
    SELECT site_id, mois_paqd, max(date_inventaire) AS date_cloture
    FROM base GROUP BY site_id, mois_paqd
),
paires AS (
    SELECT c.site_id, c.mois_paqd, o.date_cloture AS date_ouverture, c.date_cloture
    FROM cloture_site c
    JOIN cloture_site o ON o.site_id = c.site_id AND o.mois_paqd = dqa.mois_precedent(c.mois_paqd)
),
absents AS (
    SELECT p.site_id, p.mois_paqd, p.date_ouverture, p.date_cloture,
           b.produit_code, b.libelle, b.est_district, b.comptee AS stock_connu,
           'absent_ouverture'::text AS sens
    FROM paires p
    JOIN base b ON b.site_id = p.site_id AND b.mois_paqd = p.mois_paqd
    WHERE NOT EXISTS (SELECT 1 FROM base x
                       WHERE x.site_id = p.site_id AND x.mois_paqd = dqa.mois_precedent(p.mois_paqd)
                         AND x.produit_code = b.produit_code)
    UNION ALL
    SELECT p.site_id, p.mois_paqd, p.date_ouverture, p.date_cloture,
           b.produit_code, b.libelle, b.est_district, b.comptee,
           'absent_cloture'
    FROM paires p
    JOIN base b ON b.site_id = p.site_id AND b.mois_paqd = dqa.mois_precedent(p.mois_paqd)
    WHERE NOT EXISTS (SELECT 1 FROM base x
                       WHERE x.site_id = p.site_id AND x.mois_paqd = p.mois_paqd
                         AND x.produit_code = b.produit_code)
),
flux AS (
    SELECT a.site_id, a.mois_paqd, a.produit_code, a.sens,
           coalesce(sum(m.reception), 0) AS receptions,
           coalesce(sum(CASE WHEN a.est_district THEN m.distribution ELSE m.dispensation END), 0) AS sorties_declarees
    FROM absents a
    LEFT JOIN dqa.dim_produit p ON p.produit_code = a.produit_code
    LEFT JOIN dqa.v_mouvement_stock_jour m
           ON m.site_id = a.site_id AND m.produit_id = p.produit_id
          AND m.jour > a.date_ouverture AND m.jour <= a.date_cloture
    GROUP BY a.site_id, a.mois_paqd, a.produit_code, a.sens
)
SELECT a.site_id, a.mois_paqd, a.produit_code, a.libelle, a.sens,
       a.date_ouverture, a.date_cloture,
       a.stock_connu, f.receptions, f.sorties_declarees,
       c.stock_calcule,
       CASE
           WHEN a.sens = 'absent_ouverture' AND c.stock_calcule > 0 THEN 'oubli_demontre'
           WHEN a.sens = 'absent_ouverture'                         THEN 'indetermine'
           WHEN c.stock_calcule > 0                                 THEN 'oubli_probable'
           ELSE 'epuise'
       END AS qualification
FROM absents a
JOIN flux f USING (site_id, mois_paqd, produit_code, sens)
CROSS JOIN LATERAL (SELECT CASE WHEN a.sens = 'absent_ouverture'
                                THEN a.stock_connu + f.sorties_declarees - f.receptions
                                ELSE a.stock_connu + f.receptions - f.sorties_declarees
                           END AS stock_calcule) c;

CREATE UNIQUE INDEX mv_produit_ecarte_uq ON mv_produit_ecarte (site_id, mois_paqd, produit_code, sens);

CREATE TABLE hist_produit_ecarte (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id           text        NOT NULL REFERENCES dim_site (site_id),
    mois_paqd         text        NOT NULL,
    produit_code      text        NOT NULL,
    sens              text        NOT NULL CHECK (sens IN ('absent_ouverture', 'absent_cloture')),
    libelle           text,
    date_ouverture    date        NOT NULL,
    date_cloture      date        NOT NULL,
    stock_connu       numeric     NOT NULL,
    receptions        numeric     NOT NULL,
    sorties_declarees numeric     NOT NULL,
    stock_calcule     numeric     NOT NULL,
    qualification     text        NOT NULL
        CHECK (qualification IN ('oubli_demontre', 'indetermine', 'oubli_probable', 'epuise')),
    lot_id            bigint REFERENCES import_lot (id),
    calcule_le        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_hist_produit_ecarte UNIQUE (site_id, mois_paqd, produit_code, sens)
);

COMMENT ON TABLE hist_produit_ecarte IS
    'Produits absents de l''inventaire d''ouverture ou de clôture d''un mois (ticket 05), figés à chaque gel comme hist_score_site. Sans effet sur le score.';

CREATE INDEX idx_hist_produit_ecarte_mois ON hist_produit_ecarte (mois_paqd, site_id);

-- ══ Synthèse par territoire : définition 0051, plus les comptes de produits écartés ══
DROP MATERIALIZED VIEW mv_synthese_territoire_scores;

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
-- Produits écartés d'un inventaire (historisés), par site et mois : constat
-- de site, tous programmes confondus (migration 0060).
ecartes AS (
    SELECT site_id, mois_paqd,
           (count(*) FILTER (WHERE sens = 'absent_ouverture'))::int                                     AS nb_absents_ouverture,
           (count(*) FILTER (WHERE sens = 'absent_ouverture' AND qualification = 'oubli_demontre'))::int AS nb_oublis_ouverture,
           (count(*) FILTER (WHERE sens = 'absent_cloture'))::int                                       AS nb_absents_cloture,
           (count(*) FILTER (WHERE sens = 'absent_cloture' AND qualification = 'oubli_probable'))::int  AS nb_oublis_cloture
    FROM dqa.hist_produit_ecarte
    GROUP BY site_id, mois_paqd
),
base AS (
    SELECT m.mois_paqd, NULL::text AS programme_id, s.site_id, s.region, s.district, s.strate,
           h.score_composite, h.classification,
           coalesce(e.nb_absents_ouverture, 0) AS nb_absents_ouverture,
           coalesce(e.nb_oublis_ouverture, 0)  AS nb_oublis_ouverture,
           coalesce(e.nb_absents_cloture, 0)   AS nb_absents_cloture,
           coalesce(e.nb_oublis_cloture, 0)    AS nb_oublis_cloture,
           (h.p_completude  IS NOT NULL)::int + (h.p_promptitude IS NOT NULL)::int
         + (h.p_regularite  IS NOT NULL)::int + (h.p_ecart_sdu   IS NOT NULL)::int
         + (h.p_concordance IS NOT NULL)::int + (h.p_ajustements IS NOT NULL)::int AS piliers_couverts
    FROM mois m
    CROSS JOIN sites s
    LEFT JOIN dqa.hist_score_site h
           ON h.site_id = s.site_id AND h.mois_paqd = m.mois_paqd AND h.programme_id IS NULL
    LEFT JOIN ecartes e ON e.site_id = s.site_id AND e.mois_paqd = m.mois_paqd
    UNION ALL
    SELECT m.mois_paqd, g.programme_id, s.site_id, s.region, s.district, s.strate,
           h.score_composite, h.classification,
           NULL::int, NULL::int, NULL::int, NULL::int,
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
    max(piliers_couverts)::int                                   AS piliers_couverts,
    sum(nb_absents_ouverture)::int                               AS nb_absents_ouverture,
    sum(nb_oublis_ouverture)::int                                AS nb_oublis_ouverture,
    sum(nb_absents_cloture)::int                                 AS nb_absents_cloture,
    sum(nb_oublis_cloture)::int                                  AS nb_oublis_cloture
FROM base
GROUP BY mois_paqd, programme_id, region,
         GROUPING SETS ((), (district), (district, site_id)),
         GROUPING SETS ((), (strate));

CREATE INDEX mv_synthese_territoire_scores_idx
    ON mv_synthese_territoire_scores (mois_paqd, niveau, region, district);

-- ══ Gel : définition 0051, plus les produits écartés ════════════════════
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

    -- Produits écartés d'un inventaire (migration 0060) : historisés comme les
    -- scores, tout mois reconstruit à chaque gel (ADR 0010) ; une absence qui
    -- n'existe plus dans le core (ré-import corrigé) est retirée.
    REFRESH MATERIALIZED VIEW dqa.mv_produit_ecarte;
    INSERT INTO dqa.hist_produit_ecarte
        (site_id, mois_paqd, produit_code, sens, libelle, date_ouverture, date_cloture,
         stock_connu, receptions, sorties_declarees, stock_calcule, qualification, lot_id, calcule_le)
    SELECT site_id, mois_paqd, produit_code, sens, libelle, date_ouverture, date_cloture,
           stock_connu, receptions, sorties_declarees, stock_calcule, qualification, v_lot_id, now()
    FROM dqa.mv_produit_ecarte
    ON CONFLICT (site_id, mois_paqd, produit_code, sens) DO UPDATE SET
        libelle           = EXCLUDED.libelle,
        date_ouverture    = EXCLUDED.date_ouverture,
        date_cloture      = EXCLUDED.date_cloture,
        stock_connu       = EXCLUDED.stock_connu,
        receptions        = EXCLUDED.receptions,
        sorties_declarees = EXCLUDED.sorties_declarees,
        stock_calcule     = EXCLUDED.stock_calcule,
        qualification     = EXCLUDED.qualification,
        lot_id            = EXCLUDED.lot_id,
        calcule_le        = now();
    DELETE FROM dqa.hist_produit_ecarte h
    WHERE NOT EXISTS (SELECT 1 FROM dqa.mv_produit_ecarte v
                       WHERE v.site_id = h.site_id AND v.mois_paqd = h.mois_paqd
                         AND v.produit_code = h.produit_code AND v.sens = h.sens);

    REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_territoire_rapports;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_territoire_scores;
END;
$$;

-- Peuple l'historique sans attendre le prochain import (ni lot, ni gel).
INSERT INTO hist_produit_ecarte
    (site_id, mois_paqd, produit_code, sens, libelle, date_ouverture, date_cloture,
     stock_connu, receptions, sorties_declarees, stock_calcule, qualification)
SELECT site_id, mois_paqd, produit_code, sens, libelle, date_ouverture, date_cloture,
       stock_connu, receptions, sorties_declarees, stock_calcule, qualification
FROM mv_produit_ecarte;
REFRESH MATERIALIZED VIEW mv_synthese_territoire_scores;
