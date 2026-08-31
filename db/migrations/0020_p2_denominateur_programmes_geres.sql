-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — P2 : dénominateur = programmes gérés, seuil 100 %
--
--  Décision de la coordination (2026-08-31, arbitrage de la contradiction
--  spec.md table §Définition vs ticket 06) : les deux sous-composantes de P2
--  se mesurent en « part des programmes gérés servis à l'heure », comme P1 —
--  pas « part de ce qui a été saisi qui était à l'heure ». Un programme géré
--  sans inventaire (ou sans réquisition) du mois compte donc 0, pas
--  NON_CALCULABLE : ne rien soumettre pénalise P2.
--
--  - promptitude_inventaires  : programmes gérés avec ≥ 1 inventaire finalisé
--                               daté dans les 3 derniers jours du mois ÷
--                               programmes gérés
--  - promptitude_requisitions : programmes gérés avec ≥ 1 réquisition couvrant
--                               le mois soumise au plus tard le jour limite du
--                               mois suivant ÷ programmes gérés
--
--  Seuil des deux sous-composantes : 100 % (grille). NON_CALCULABLE seulement
--  si le site n'a aucun programme géré déclaré.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

UPDATE grille_seuil_sous_composante
   SET seuil = 100.00
 WHERE sous_composante IN ('promptitude_inventaires', 'promptitude_requisitions');

DROP MATERIALIZED VIEW IF EXISTS mv_p2_promptitude CASCADE;
CREATE MATERIALIZED VIEW mv_p2_promptitude AS
WITH perimetre AS (
    SELECT site_id, type_structure, jour_limite_requisition
    FROM dqa.dim_site WHERE dans_perimetre_dqa
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
    ) u
),
statut_prog AS (
    SELECT
        a.site_id, a.mois, m.prog,
        EXISTS (
            SELECT 1 FROM dqa.fact_inventaire fi
            WHERE fi.site_id = a.site_id AND fi.statut = 'fn'
              AND fi.programme_id = m.prog
              AND to_char(fi.date_inventaire, 'YYYY-MM') = a.mois
              AND fi.date_inventaire >= (date_trunc('month', fi.date_inventaire)
                                        + interval '1 month' - interval '3 days')::date
        ) AS inv_ot,
        EXISTS (
            SELECT 1 FROM dqa.fact_requisition fr
            WHERE fr.site_id = a.site_id AND fr.programme_id = m.prog
              AND fr.mois_couvert = a.mois
              AND fr.date_soumission IS NOT NULL
              AND fr.date_soumission <= (
                  (date_trunc('month', (a.mois || '-01')::date) + interval '1 month')::date
                  + (coalesce(
                       p.jour_limite_requisition,
                       CASE WHEN p.type_structure IN ('CSU', 'CSR', 'ESPC') THEN 5
                            WHEN p.type_structure IN ('HG', 'CHR')          THEN 7
                            ELSE 10 END
                     ) - 1)
              )
        ) AS req_ot
    FROM activite a
    JOIN managed m    ON m.site_id = a.site_id
    JOIN perimetre p  ON p.site_id = a.site_id
),
seuil AS (
    SELECT m.mois, max(sc.seuil) AS seuil
    FROM (SELECT DISTINCT mois FROM activite) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois)
     AND sc.sous_composante = 'promptitude_inventaires'
    GROUP BY m.mois
),
par_prog AS (
    -- une ligne par programme géré
    SELECT site_id, mois, prog,
        CASE WHEN inv_ot THEN 100.0 ELSE 0.0 END AS promptitude_inventaires_pct,
        CASE WHEN req_ot THEN 100.0 ELSE 0.0 END AS promptitude_requisitions_pct
    FROM statut_prog
    UNION ALL
    -- agrégat tous programmes : part des programmes gérés servis à l'heure
    SELECT site_id, mois, NULL::text,
        round(100.0 * count(*) FILTER (WHERE inv_ot) / nullif(count(*), 0), 1),
        round(100.0 * count(*) FILTER (WHERE req_ot) / nullif(count(*), 0), 1)
    FROM statut_prog
    GROUP BY site_id, mois
)
SELECT
    pp.site_id,
    pp.prog                                          AS programme_id,
    pp.mois                                           AS mois_paqd,
    pp.promptitude_inventaires_pct,
    pp.promptitude_requisitions_pct,
    CASE WHEN pp.promptitude_inventaires_pct  >= s.seuil THEN 100.0 ELSE 0.0 END AS score_inventaires,
    CASE WHEN pp.promptitude_requisitions_pct >= s.seuil THEN 100.0 ELSE 0.0 END AS score_requisitions,
    round((
        (CASE WHEN pp.promptitude_inventaires_pct  >= s.seuil THEN 100.0 ELSE 0.0 END)
      + (CASE WHEN pp.promptitude_requisitions_pct >= s.seuil THEN 100.0 ELSE 0.0 END)
    ) / 2.0, 1)::numeric(5, 1)                        AS p_promptitude
FROM par_prog pp
JOIN seuil s ON s.mois = pp.mois;

CREATE UNIQUE INDEX mv_p2_uq
    ON mv_p2_promptitude (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── Scores de pilier — mv_score_pilier reconstruite (dépend de mv_p2) ──────
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
