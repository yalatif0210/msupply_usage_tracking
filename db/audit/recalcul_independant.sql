-- ═══════════════════════════════════════════════════════════════════════════
--  Recalcul indépendant des piliers, en lecture seule.
--
--  Reprend les recalculs de l'audit du 2026-10-14 : chaque contrôle recalcule
--  un indicateur directement à partir du core (`fact_*`, `dim_*`) ou des
--  valeurs gelées, sans passer par la vue qui le produit, puis compte les
--  écarts avec cette vue. Résultat attendu : `nb_ecarts = 0` partout.
--
--  Usage (base de démo ou de production, jamais d'écriture) :
--    PGOPTIONS='-c default_transaction_read_only=on' \
--      psql -d dqa -f db/audit/recalcul_independant.sql
--  Le test `test/recalcul-independant.test.ts` l'exécute sur une base
--  éphémère : un écart y est une régression.
-- ═══════════════════════════════════════════════════════════════════════════

WITH
-- P6 : lignes de transactions finalisées, ajustements / total (ADR 0018).
p6 AS (
    SELECT ft.site_id,
           to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') AS mois,
           round(100.0 * count(*) FILTER (WHERE fl.issu_ajustement
                   OR ft.nature IN ('ajustement_positif', 'ajustement_negatif')) / count(*), 1) AS ratio
    FROM dqa.fact_transaction ft
    JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
    JOIN dqa.dim_site s ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
    WHERE ft.statut = 'fn' AND NOT coalesce(ft.annulation, false)
      AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
    GROUP BY 1, 2
),
ecarts_p6 AS (
    SELECT count(*) AS n
    FROM p6 FULL JOIN dqa.mv_p6_ajustements v
      ON v.site_id = p6.site_id AND v.mois_paqd = p6.mois AND v.programme_id IS NULL
    WHERE v.programme_id IS NULL
      AND p6.ratio IS DISTINCT FROM v.ratio_ajustements_pct
),
-- P5 : par code produit, concordance la plus faible de ses articles ; moyenne.
p5 AS (
    SELECT site_id, mois_paqd, round(avg(taux)::numeric, 1) AS taux
    FROM (
        SELECT ep.site_id, ep.mois_paqd, ep.produit_code,
               min(CASE WHEN greatest(abs(ep.theorique), abs(ep.comptee)) = 0 THEN 100.0
                        ELSE least(abs(ep.theorique), abs(ep.comptee))
                             / greatest(abs(ep.theorique), abs(ep.comptee)) * 100.0 END) AS taux
        FROM dqa.mv_p4_ecart_produit ep
        WHERE ep.programme_id IS NULL AND ep.concordance_pct IS NOT NULL
        GROUP BY 1, 2, 3
    ) c
    GROUP BY 1, 2
),
ecarts_p5 AS (
    SELECT count(*) AS n
    FROM p5 JOIN dqa.mv_p5_concordance v
      ON v.site_id = p5.site_id AND v.mois_paqd = p5.mois_paqd AND v.programme_id IS NULL
    WHERE p5.taux IS DISTINCT FROM v.taux_concordance_pct
),
-- P4 SDU : part des codes produits dont tous les articles sont dans la tolérance.
p4 AS (
    SELECT site_id, mois_paqd,
           round(100.0 * count(*) FILTER (WHERE conforme) / count(*), 1) AS taux
    FROM (
        SELECT site_id, mois_paqd, produit_code, bool_and(sdu_conforme) AS conforme
        FROM dqa.mv_p4_ecart_produit WHERE programme_id IS NULL
        GROUP BY 1, 2, 3
    ) c
    GROUP BY 1, 2
),
ecarts_p4 AS (
    SELECT count(*) AS n
    FROM p4 JOIN dqa.mv_p4_ecart v
      ON v.site_id = p4.site_id AND v.mois_paqd = p4.mois_paqd AND v.programme_id IS NULL
    WHERE p4.taux IS DISTINCT FROM v.taux_sdu_pct
),
-- P1 réceptions : factures citant une réquisition ordinaire finalisée de M-1,
-- acceptées (fn) dans leur mois d'émission (ADR 0019).
p1 AS (
    SELECT fr.site_id,
           to_char((fr.mois_couvert || '-01')::date + interval '1 month', 'YYYY-MM') AS mois,
           round(100.0 * count(*) FILTER (WHERE ft.statut = 'fn'
               AND to_char(coalesce(ft.date_finalisation, ft.date_confirmation, ft.date_saisie), 'YYYY-MM')
                 = to_char(coalesce(ft.date_finalisation_liee, ft.date_saisie), 'YYYY-MM')) / count(*), 1) AS taux
    FROM dqa.fact_requisition fr
    JOIN dqa.dim_site s ON s.site_id = fr.site_id AND s.dans_perimetre_dqa
    JOIN dqa.fact_transaction ft ON ft.requisition_id = fr.requisition_id AND ft.site_id = fr.site_id
    WHERE fr.type_requisition = 'Ordinaire' AND fr.statut = 'fn'
      AND (fr.programme_id IS NULL OR EXISTS (
            SELECT 1 FROM dqa.dim_site_programme sp
            WHERE sp.site_id = fr.site_id AND sp.programme_id = fr.programme_id AND sp.actif))
      AND ft.nature = 'facture_fournisseur' AND ft.statut IN ('fn', 'cn', 'nw')
      AND NOT coalesce(ft.annulation, false)
    GROUP BY 1, 2
),
ecarts_p1 AS (
    SELECT count(*) AS n
    FROM p1 FULL JOIN (SELECT * FROM dqa.mv_p1_completude
                       WHERE programme_id IS NULL AND completude_receptions_pct IS NOT NULL) v
      ON v.site_id = p1.site_id AND v.mois_paqd = p1.mois
    WHERE p1.taux IS DISTINCT FROM v.completude_receptions_pct
      -- une réquisition ancienne citée par une facture ne note pas son mois (migration 0050)
      AND dqa.mois_mesurable(coalesce(p1.mois, v.mois_paqd))
),
-- Composite gelé : moyenne des piliers calculables pondérée par la grille.
composite AS (
    SELECT h.site_id, h.mois_paqd, h.programme_id, h.score_composite,
           round(sum(x.score * gp.poids_pct) / nullif(sum(gp.poids_pct), 0), 1) AS recalcule
    FROM dqa.hist_score_site h
    CROSS JOIN LATERAL (VALUES ('P1', h.p_completude), ('P2', h.p_promptitude), ('P3', h.p_regularite),
                               ('P4', h.p_ecart_sdu), ('P5', h.p_concordance), ('P6', h.p_ajustements)) x(pilier, score)
    LEFT JOIN dqa.grille_poids_pilier gp ON gp.grille_id = h.grille_id AND gp.pilier = x.pilier AND x.score IS NOT NULL
    GROUP BY 1, 2, 3, 4
),
ecarts_composite AS (
    SELECT count(*) AS n FROM composite WHERE recalcule IS DISTINCT FROM score_composite
)
SELECT 'P1 complétude des réceptions' AS controle, (SELECT n FROM ecarts_p1) AS nb_ecarts
UNION ALL SELECT 'P4 conformité SDU',      (SELECT n FROM ecarts_p4)
UNION ALL SELECT 'P5 concordance',          (SELECT n FROM ecarts_p5)
UNION ALL SELECT 'P6 ratio d''ajustements', (SELECT n FROM ecarts_p6)
UNION ALL SELECT 'Score composite gelé',    (SELECT n FROM ecarts_composite);
