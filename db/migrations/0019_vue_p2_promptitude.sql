-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Indicateur P2 : promptitude des transactions
--
--  Deux sous-composantes, seuil grille 65 %.
--  - promptitude_inventaires  : inventaires finalisés du mois datés dans les
--                               trois derniers jours du mois ÷ inventaires
--                               finalisés du mois. NON_CALCULABLE si aucun
--                               inventaire finalisé ce mois.
--  - promptitude_requisitions : réquisitions couvrant le mois soumises au plus
--                               tard le jour limite du mois suivant ÷
--                               réquisitions couvrant le mois. Le jour limite
--                               vient de `dim_site.jour_limite_requisition`,
--                               à défaut du type de structure (5 CS, 7 HG/CHR,
--                               10 autres). NON_CALCULABLE si aucune réquisition.
--
--  Score de pilier P2 = moyenne simple des scores des sous-composantes
--  calculables. Grain (site du périmètre, mois PAQD, programme) + agrégat
--  « tous programmes ».
--
--  Après ce ticket, les six piliers sont mesurés.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_p2_promptitude CASCADE;
CREATE MATERIALIZED VIEW mv_p2_promptitude AS
WITH perimetre AS (
    SELECT site_id, type_structure, jour_limite_requisition
    FROM dqa.dim_site WHERE dans_perimetre_dqa
),
inv AS (
    SELECT
        fi.site_id,
        fi.programme_id                                   AS prog,
        to_char(fi.date_inventaire, 'YYYY-MM')            AS mois,
        fi.date_inventaire >= (date_trunc('month', fi.date_inventaire)
                               + interval '1 month' - interval '3 days')::date AS a_lheure
    FROM dqa.fact_inventaire fi
    JOIN perimetre p ON p.site_id = fi.site_id
    WHERE fi.statut = 'fn'
),
inv_dim AS (
    SELECT site_id, prog, mois, a_lheure FROM inv
    UNION ALL
    SELECT site_id, NULL, mois, a_lheure FROM inv
),
inv_agg AS (
    SELECT site_id, prog, mois,
        count(*)                          AS nb,
        count(*) FILTER (WHERE a_lheure)  AS nb_ot
    FROM inv_dim
    GROUP BY site_id, prog, mois
),
req AS (
    SELECT
        fr.site_id,
        fr.programme_id                                   AS prog,
        fr.mois_couvert                                   AS mois,
        (fr.date_soumission IS NOT NULL AND fr.date_soumission <= d.limite) AS a_lheure
    FROM dqa.fact_requisition fr
    JOIN perimetre p ON p.site_id = fr.site_id
    CROSS JOIN LATERAL (
        SELECT ((date_trunc('month', (fr.mois_couvert || '-01')::date) + interval '1 month')::date
                + (coalesce(
                     p.jour_limite_requisition,
                     CASE WHEN p.type_structure IN ('CSU', 'CSR', 'ESPC') THEN 5
                          WHEN p.type_structure IN ('HG', 'CHR')          THEN 7
                          ELSE 10 END
                   ) - 1)) AS limite
    ) d
),
req_dim AS (
    SELECT site_id, prog, mois, a_lheure FROM req
    UNION ALL
    SELECT site_id, NULL, mois, a_lheure FROM req
),
req_agg AS (
    SELECT site_id, prog, mois,
        count(*)                          AS nb,
        count(*) FILTER (WHERE a_lheure)  AS nb_ot
    FROM req_dim
    GROUP BY site_id, prog, mois
),
seuil AS (
    SELECT m.mois, max(sc.seuil) AS seuil
    FROM (SELECT DISTINCT mois FROM inv_agg UNION SELECT DISTINCT mois FROM req_agg) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois)
     AND sc.sous_composante = 'promptitude_inventaires'
    GROUP BY m.mois
),
assemble AS (
    SELECT
        coalesce(i.site_id, r.site_id)                    AS site_id,
        coalesce(i.prog, r.prog)                          AS programme_id,
        coalesce(i.mois, r.mois)                          AS mois_paqd,
        CASE WHEN i.nb > 0 THEN round(100.0 * i.nb_ot / i.nb, 1) END AS promptitude_inventaires_pct,
        CASE WHEN r.nb > 0 THEN round(100.0 * r.nb_ot / r.nb, 1) END AS promptitude_requisitions_pct,
        s.seuil
    FROM inv_agg i
    FULL OUTER JOIN req_agg r
      ON r.site_id = i.site_id AND r.mois = i.mois
     AND r.prog IS NOT DISTINCT FROM i.prog
    JOIN seuil s ON s.mois = coalesce(i.mois, r.mois)
)
SELECT
    site_id,
    programme_id,
    mois_paqd,
    promptitude_inventaires_pct,
    promptitude_requisitions_pct,
    CASE WHEN promptitude_inventaires_pct IS NULL THEN NULL
         WHEN promptitude_inventaires_pct >= seuil THEN 100.0 ELSE 0.0 END  AS score_inventaires,
    CASE WHEN promptitude_requisitions_pct IS NULL THEN NULL
         WHEN promptitude_requisitions_pct >= seuil THEN 100.0 ELSE 0.0 END AS score_requisitions,
    (
        SELECT round(avg(v.s), 1)::numeric(5, 1)
        FROM (VALUES
            (CASE WHEN promptitude_inventaires_pct IS NULL THEN NULL
                  WHEN promptitude_inventaires_pct >= seuil THEN 100.0 ELSE 0.0 END),
            (CASE WHEN promptitude_requisitions_pct IS NULL THEN NULL
                  WHEN promptitude_requisitions_pct >= seuil THEN 100.0 ELSE 0.0 END)
        ) AS v(s)
        WHERE v.s IS NOT NULL
    )                                                                      AS p_promptitude
FROM assemble;

CREATE UNIQUE INDEX mv_p2_uq
    ON mv_p2_promptitude (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── Scores de pilier — P2 câblé : les six piliers sont mesurés ─────────────
DROP MATERIALIZED VIEW IF EXISTS mv_score_pilier CASCADE;
CREATE MATERIALIZED VIEW mv_score_pilier AS
WITH sites_mois AS (
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p1_completude
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p2_promptitude
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
        p2.p_promptitude                                             AS p_promptitude,
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
    LEFT JOIN mv_p2_promptitude p2
           ON p2.site_id = sm.site_id AND p2.mois_paqd = sm.mois_paqd
          AND coalesce(p2.programme_id, '') = coalesce(sm.programme_id, '')
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

-- ── Procédure de rafraîchissement — les six vues + le score ────────────────
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
