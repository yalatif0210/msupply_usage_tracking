-- ═══════════════════════════════════════════════════════════════════════════
--  Seuls les mois mesurables reçoivent un score.
--
--  Premier fichier v2.4 (lot du 2026-10-22) : les réquisitions citées par une
--  facture sont transmises quel que soit leur mois couvert (ADR 0019), jusqu'à
--  2019. Chaque vue de pilier en déduisait des mois d'activité : des mois
--  fantômes (2025, avril à juin 2026) apparaissaient notés sur la seule
--  réquisition, et le gel échouait sur ceux qui n'ont aucune grille en vigueur
--  (`hist_score_site.grille_id` nul) : aucun score n'était produit.
--
--  `dqa.mois_mesurable(mois)` : un mois reçoit un score s'il a une grille en
--  vigueur, s'il n'est pas dans le futur, et s'il n'est pas antérieur au début
--  de la plus ancienne fenêtre d'extraction importée. Les réquisitions
--  anciennes continuent de servir à la complétude des réceptions du mois
--  suivant ; seuls leurs propres mois ne sont plus notés.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE FUNCTION dqa.mois_mesurable(p_mois text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT dqa.grille_pour_mois(p_mois) IS NOT NULL
       AND p_mois <= to_char(CURRENT_DATE, 'YYYY-MM')
       AND p_mois >= coalesce(
             (SELECT to_char(min(fenetre_debut), 'YYYY-MM')
              FROM dqa.import_lot WHERE statut <> 'rejete'),
             p_mois)
$$;

COMMENT ON FUNCTION dqa.mois_mesurable IS
    'Vrai si le mois peut recevoir un score : grille en vigueur, pas dans le futur, '
    'et dans la période couverte par les fenêtres d''extraction importées.';

DROP MATERIALIZED VIEW mv_score_pilier;

CREATE MATERIALIZED VIEW mv_score_pilier AS
WITH sites_mois_bruts AS (
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p1_completude
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p2_promptitude
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p3_regularite
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p4_ecart
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p5_concordance
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p6_ajustements
),
-- Seuls les mois mesurables reçoivent un score (dqa.mois_mesurable).
mois_mesurables AS (
    SELECT m.mois_paqd FROM (SELECT DISTINCT mois_paqd FROM sites_mois_bruts) m
    WHERE dqa.mois_mesurable(m.mois_paqd)
),
sites_mois AS (
    SELECT smb.* FROM sites_mois_bruts smb
    JOIN mois_mesurables mm ON mm.mois_paqd = smb.mois_paqd
),
base AS (
    SELECT
        sm.site_id, sm.mois_paqd, sm.programme_id,
        dqa.grille_pour_mois(sm.mois_paqd)                            AS grille_id,
        p1.p_completude, p2.p_promptitude,
        dqa.note_sous_composante(p3.taux_regularite_pct, 'regularite_saisie', sm.mois_paqd,
                                 coalesce(p3.est_district, false))     AS p_regularite,
        p4.p_ecart_sdu,
        dqa.note_sous_composante(p5.taux_concordance_pct, 'concordance', sm.mois_paqd)       AS p_concordance,
        dqa.note_sous_composante(p6.ratio_ajustements_pct, 'ratio_ajustements', sm.mois_paqd) AS p_ajustements,
        p1.completude_requisitions_pct  AS sc_completude_requisitions,
        p1.completude_receptions_pct    AS sc_completude_receptions,
        p2.promptitude_inventaires_pct  AS sc_promptitude_inventaires,
        p2.promptitude_requisitions_pct AS sc_promptitude_requisitions,
        p3.taux_regularite_pct          AS sc_regularite_saisie,
        p4.taux_sdu_pct                 AS sc_ecart_sdu,
        p4.taux_conso_pct               AS sc_ecart_consommation,
        p5.taux_concordance_pct         AS sc_concordance,
        p6.ratio_ajustements_pct        AS sc_ratio_ajustements
    FROM sites_mois sm
    LEFT JOIN mv_p1_completude p1 ON p1.site_id = sm.site_id AND p1.mois_paqd = sm.mois_paqd AND coalesce(p1.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p2_promptitude p2 ON p2.site_id = sm.site_id AND p2.mois_paqd = sm.mois_paqd AND coalesce(p2.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p3_regularite p3 ON p3.site_id = sm.site_id AND p3.mois_paqd = sm.mois_paqd AND coalesce(p3.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p4_ecart p4 ON p4.site_id = sm.site_id AND p4.mois_paqd = sm.mois_paqd AND coalesce(p4.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p5_concordance p5 ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd AND coalesce(p5.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p6_ajustements p6 ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd AND coalesce(p6.programme_id, '') = coalesce(sm.programme_id, '')
),
composite AS (
    SELECT b.site_id, b.mois_paqd, b.programme_id,
        round(sum(pil.score * gp.poids_pct) / nullif(sum(gp.poids_pct), 0), 1)::numeric(5, 1) AS score_composite
    FROM base b
    CROSS JOIN LATERAL (VALUES
        ('P1', b.p_completude), ('P2', b.p_promptitude), ('P3', b.p_regularite),
        ('P4', b.p_ecart_sdu),  ('P5', b.p_concordance), ('P6', b.p_ajustements)
    ) AS pil(pilier, score)
    JOIN dqa.grille_poids_pilier gp ON gp.grille_id = b.grille_id AND gp.pilier = pil.pilier
    WHERE pil.score IS NOT NULL
    GROUP BY b.site_id, b.mois_paqd, b.programme_id
)
SELECT
    b.site_id, b.mois_paqd, b.programme_id, b.grille_id,
    b.p_completude, b.p_promptitude, b.p_regularite, b.p_ecart_sdu, b.p_concordance, b.p_ajustements,
    b.sc_completude_requisitions, b.sc_completude_receptions,
    b.sc_promptitude_inventaires, b.sc_promptitude_requisitions, b.sc_regularite_saisie,
    b.sc_ecart_sdu, b.sc_ecart_consommation, b.sc_concordance, b.sc_ratio_ajustements,
    c.score_composite,
    dqa.classer_composite(c.score_composite) AS classification
FROM base b
LEFT JOIN composite c ON c.site_id = b.site_id AND c.mois_paqd = b.mois_paqd
      AND coalesce(c.programme_id, '') = coalesce(b.programme_id, '');

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── Rattrapage : reconstruit les mois mesurables ──────────────────────────
CALL dqa.rafraichir_et_geler(NULL);
