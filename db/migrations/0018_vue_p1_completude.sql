-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Indicateur P1 : complétude des transactions
--
--  Trois sous-composantes, chacune = part des transactions attendues du site
--  sur le mois PAQD qui ont été saisies. Attendu par mois : un inventaire et
--  une réquisition par programme de santé géré (`dim_site_programme` actif) ;
--  une réception par facture fournisseur adressée au site.
--
--  - completude_inventaires  : programmes gérés avec ≥ 1 inventaire finalisé
--                              ce mois ÷ programmes gérés
--  - completude_requisitions : programmes gérés avec ≥ 1 réquisition couvrant
--                              ce mois ÷ programmes gérés
--  - completude_receptions   : réceptions finalisées ce mois ÷ factures
--                              fournisseur du mois ; NON_CALCULABLE si aucune
--                              facture
--
--  Score de pilier P1 = moyenne simple des scores des sous-composantes
--  calculables (seuil grille 100 %, sens « sup »).
--
--  Grain par (site du périmètre, mois PAQD, programme) + agrégat « tous
--  programmes » (programme_id = NULL). Une ligne P1 n'existe que pour un mois
--  où le site a une activité (inventaire, réquisition, réception ou facture) —
--  un mois sans donnée reste un état vide, pas un score de zéro.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_p1_completude CASCADE;
CREATE MATERIALIZED VIEW mv_p1_completude AS
WITH perimetre AS (
    SELECT site_id FROM dqa.dim_site WHERE dans_perimetre_dqa
),
managed AS (
    SELECT sp.site_id, sp.programme_id AS prog
    FROM dqa.dim_site_programme sp
    JOIN perimetre p ON p.site_id = sp.site_id
    WHERE sp.actif
),
activite AS (
    SELECT DISTINCT site_id, mois FROM (
        SELECT fi.site_id, to_char(fi.date_inventaire, 'YYYY-MM') AS mois
        FROM dqa.fact_inventaire fi
        JOIN perimetre p ON p.site_id = fi.site_id
        WHERE fi.statut = 'fn'
        UNION ALL
        SELECT fr.site_id, fr.mois_couvert
        FROM dqa.fact_requisition fr
        JOIN perimetre p ON p.site_id = fr.site_id
        UNION ALL
        SELECT ft.site_id, to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM')
        FROM dqa.fact_transaction ft
        JOIN perimetre p ON p.site_id = ft.site_id
        WHERE ft.nature IN ('reception', 'facture_fournisseur')
          AND coalesce(ft.annulation, false) = false
          AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
    ) u
),
-- (site, mois, programme géré) + (site, mois, NULL) pour l'agrégat
grain AS (
    SELECT a.site_id, a.mois, m.prog
    FROM activite a
    JOIN managed m ON m.site_id = a.site_id
    UNION
    SELECT a.site_id, a.mois, NULL::text
    FROM activite a
),
statut_prog AS (
    SELECT
        g.site_id, g.mois, m.prog,
        EXISTS (SELECT 1 FROM dqa.fact_inventaire fi
                 WHERE fi.site_id = g.site_id AND fi.statut = 'fn'
                   AND fi.programme_id = m.prog
                   AND to_char(fi.date_inventaire, 'YYYY-MM') = g.mois)     AS a_inv,
        EXISTS (SELECT 1 FROM dqa.fact_requisition fr
                 WHERE fr.site_id = g.site_id AND fr.programme_id = m.prog
                   AND fr.mois_couvert = g.mois)                            AS a_req
    FROM (SELECT DISTINCT site_id, mois FROM grain) g
    JOIN managed m ON m.site_id = g.site_id
),
-- complétude inventaires / réquisitions par (site, mois, prog|NULL)
inv_req AS (
    -- par programme géré
    SELECT sp.site_id, sp.mois, sp.prog,
        CASE WHEN sp.a_inv THEN 100.0 ELSE 0.0 END AS completude_inventaires_pct,
        CASE WHEN sp.a_req THEN 100.0 ELSE 0.0 END AS completude_requisitions_pct
    FROM statut_prog sp
    UNION ALL
    -- tous programmes : part des programmes gérés couverts
    SELECT sp.site_id, sp.mois, NULL::text,
        round(100.0 * count(*) FILTER (WHERE sp.a_inv) / nullif(count(*), 0), 1),
        round(100.0 * count(*) FILTER (WHERE sp.a_req) / nullif(count(*), 0), 1)
    FROM statut_prog sp
    GROUP BY sp.site_id, sp.mois
),
receptions AS (
    SELECT
        g.site_id, g.mois, g.prog,
        (SELECT count(*) FROM dqa.fact_transaction ft
          WHERE ft.site_id = g.site_id AND ft.nature = 'reception'
            AND coalesce(ft.statut, '') = 'fn'
            AND coalesce(ft.annulation, false) = false
            AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = g.mois
            AND (g.prog IS NULL OR ft.programme_id = g.prog))              AS nb_receptions,
        (SELECT count(*) FROM dqa.fact_transaction ft
          WHERE ft.site_id = g.site_id AND ft.nature = 'facture_fournisseur'
            AND coalesce(ft.annulation, false) = false
            AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = g.mois
            AND (g.prog IS NULL OR ft.programme_id = g.prog))              AS nb_factures
    FROM grain g
),
seuil AS (
    SELECT m.mois, max(sc.seuil) AS seuil
    FROM (SELECT DISTINCT mois FROM grain) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois)
     AND sc.sous_composante = 'completude_inventaires'
    GROUP BY m.mois
),
assemble AS (
    SELECT
        ir.site_id,
        ir.prog                                                          AS programme_id,
        ir.mois                                                          AS mois_paqd,
        ir.completude_inventaires_pct,
        ir.completude_requisitions_pct,
        CASE WHEN r.nb_factures > 0
             THEN round(100.0 * r.nb_receptions / r.nb_factures, 1)
        END                                                              AS completude_receptions_pct,
        s.seuil
    FROM inv_req ir
    JOIN seuil s ON s.mois = ir.mois
    LEFT JOIN receptions r
           ON r.site_id = ir.site_id AND r.mois = ir.mois
          AND r.prog IS NOT DISTINCT FROM ir.prog
)
SELECT
    site_id,
    programme_id,
    mois_paqd,
    completude_inventaires_pct,
    completude_requisitions_pct,
    completude_receptions_pct,
    CASE WHEN completude_inventaires_pct  >= seuil THEN 100.0 ELSE 0.0 END AS score_inventaires,
    CASE WHEN completude_requisitions_pct >= seuil THEN 100.0 ELSE 0.0 END AS score_requisitions,
    CASE WHEN completude_receptions_pct IS NULL THEN NULL
         WHEN completude_receptions_pct >= seuil THEN 100.0 ELSE 0.0 END   AS score_receptions,
    (
        SELECT round(avg(v.s), 1)::numeric(5, 1)
        FROM (VALUES
            (CASE WHEN completude_inventaires_pct  >= seuil THEN 100.0 ELSE 0.0 END),
            (CASE WHEN completude_requisitions_pct >= seuil THEN 100.0 ELSE 0.0 END),
            (CASE WHEN completude_receptions_pct IS NULL THEN NULL
                  WHEN completude_receptions_pct >= seuil THEN 100.0 ELSE 0.0 END)
        ) AS v(s)
        WHERE v.s IS NOT NULL
    )                                                                    AS p_completude
FROM assemble;

CREATE UNIQUE INDEX mv_p1_uq
    ON mv_p1_completude (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── Scores de pilier — P1 câblé ────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_score_pilier CASCADE;
CREATE MATERIALIZED VIEW mv_score_pilier AS
WITH sites_mois AS (
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p1_completude
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p3_regularite
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p4_ecart
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p5_concordance
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p6_ajustements
),
seuils AS (
    SELECT sc.sous_composante, sc.seuil, sc.sens, m.mois_paqd
    FROM (SELECT DISTINCT mois_paqd FROM sites_mois) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
),
base AS (
    SELECT
        sm.site_id,
        sm.mois_paqd,
        sm.programme_id,
        dqa.grille_pour_mois(sm.mois_paqd)                            AS grille_id,
        p1.p_completude                                              AS p_completude,
        NULL::numeric(5, 1)                                           AS p_promptitude,
        CASE
            WHEN p3.taux_regularite_pct IS NULL THEN NULL
            WHEN p3.taux_regularite_pct >= sc3.seuil THEN 100.0
            ELSE 0.0
        END                                                          AS p_regularite,
        p4.p_ecart_sdu                                                AS p_ecart_sdu,
        CASE
            WHEN p5.taux_concordance_pct IS NULL THEN NULL
            WHEN p5.taux_concordance_pct >= sc5.seuil THEN 100.0
            ELSE 0.0
        END                                                          AS p_concordance,
        CASE
            WHEN p6.ratio_ajustements_pct IS NULL THEN NULL
            WHEN p6.ratio_ajustements_pct <= sc6.seuil THEN 100.0
            ELSE 0.0
        END                                                          AS p_ajustements
    FROM sites_mois sm
    LEFT JOIN mv_p1_completude p1
           ON p1.site_id = sm.site_id AND p1.mois_paqd = sm.mois_paqd
          AND coalesce(p1.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p3_regularite p3
           ON p3.site_id = sm.site_id AND p3.mois_paqd = sm.mois_paqd
          AND coalesce(p3.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p4_ecart p4
           ON p4.site_id = sm.site_id AND p4.mois_paqd = sm.mois_paqd
          AND coalesce(p4.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p5_concordance p5
           ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd
          AND coalesce(p5.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p6_ajustements p6
           ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd
          AND coalesce(p6.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN seuils sc3 ON sc3.sous_composante = 'regularite_saisie' AND sc3.mois_paqd = sm.mois_paqd
    LEFT JOIN seuils sc5 ON sc5.sous_composante = 'concordance'       AND sc5.mois_paqd = sm.mois_paqd
    LEFT JOIN seuils sc6 ON sc6.sous_composante = 'ratio_ajustements' AND sc6.mois_paqd = sm.mois_paqd
),
composite AS (
    SELECT
        b.site_id, b.mois_paqd, b.programme_id,
        round(
            sum(pil.score * gp.poids_pct) / nullif(sum(gp.poids_pct), 0),
            1
        )::numeric(5, 1)                                              AS score_composite
    FROM base b
    CROSS JOIN LATERAL (VALUES
        ('P1', b.p_completude),  ('P2', b.p_promptitude), ('P3', b.p_regularite),
        ('P4', b.p_ecart_sdu),   ('P5', b.p_concordance), ('P6', b.p_ajustements)
    ) AS pil(pilier, score)
    JOIN dqa.grille_poids_pilier gp
      ON gp.grille_id = b.grille_id AND gp.pilier = pil.pilier
    WHERE pil.score IS NOT NULL
    GROUP BY b.site_id, b.mois_paqd, b.programme_id
)
SELECT
    b.site_id,
    b.mois_paqd,
    b.programme_id,
    b.grille_id,
    b.p_completude,
    b.p_promptitude,
    b.p_regularite,
    b.p_ecart_sdu,
    b.p_concordance,
    b.p_ajustements,
    c.score_composite,
    dqa.classer_composite(c.score_composite)                         AS classification
FROM base b
LEFT JOIN composite c
       ON c.site_id = b.site_id AND c.mois_paqd = b.mois_paqd
      AND coalesce(c.programme_id, '') = coalesce(b.programme_id, '');

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── Procédure de rafraîchissement — ajoute mv_p1_completude ────────────────
CREATE OR REPLACE PROCEDURE rafraichir_et_geler(p_lot_id bigint)
LANGUAGE plpgsql AS $$
DECLARE
    v_mois   text;
    v_grille bigint;
BEGIN
    REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
    REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
    REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
    REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
    REFRESH MATERIALIZED VIEW dqa.mv_p6_ajustements;
    REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;

    SELECT mois_paqd INTO v_mois FROM dqa.import_lot WHERE id = p_lot_id;
    IF v_mois IS NULL THEN
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
END;
$$;
