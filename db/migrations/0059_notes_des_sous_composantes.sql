-- ═══════════════════════════════════════════════════════════════════════════
--  Transparence du calcul (ticket 04, .scratch/cloture-mois-et-composition-piliers).
--
--  `mv_score_pilier` expose la note (100, 0, note de sanction ou NULL) de
--  chaque sous-composante, celle qui entre dans le score de son pilier : la
--  fiche site déplie le calcul à partir de ces notes, sans le refaire.
--  Définition 0058, neuf colonnes `note_*` ajoutées ; aucun score ne change.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

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
jointes AS (
    SELECT
        sm.site_id, sm.mois_paqd, sm.programme_id,
        dqa.grille_pour_mois(sm.mois_paqd)                            AS grille_id,
        p1.score_requisitions                                        AS n_completude_requisitions,
        p1.score_receptions                                          AS n_completude_receptions,
        p2.score_inventaires                                         AS n_promptitude_inventaires,
        p2.score_requisitions                                        AS n_promptitude_requisitions,
        dqa.note_sous_composante(p3.taux_regularite_pct, 'regularite_saisie', sm.mois_paqd,
                                 coalesce(p3.est_district, false))     AS n_regularite_saisie,
        -- sanction (ADR 0022) : aucun produit évalué et taux imposé à 0 ; la
        -- note vient de la grille (migration 0058)
        CASE WHEN p4.nb_produits_sdu = 0 AND p4.taux_sdu_pct = 0
             THEN dqa.note_sanction(sm.mois_paqd) ELSE p4.score_sdu END     AS n_ecart_sdu,
        CASE WHEN p4.nb_produits_conso = 0 AND p4.taux_conso_pct = 0
             THEN dqa.note_sanction(sm.mois_paqd) ELSE p4.score_conso END   AS n_ecart_consommation,
        CASE WHEN p5.nb_produits = 0 AND p5.taux_concordance_pct = 0
             THEN dqa.note_sanction(sm.mois_paqd)
             ELSE dqa.note_sous_composante(p5.taux_concordance_pct, 'concordance', sm.mois_paqd)
        END                                                          AS n_concordance,
        dqa.note_sous_composante(p6.ratio_ajustements_pct, 'ratio_ajustements', sm.mois_paqd) AS n_ratio_ajustements,
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
base AS (
    SELECT j.*,
        dqa.score_pilier(j.grille_id, jsonb_build_object(
            'completude_requisitions', j.n_completude_requisitions,
            'completude_receptions', j.n_completude_receptions))       AS p_completude,
        dqa.score_pilier(j.grille_id, jsonb_build_object(
            'promptitude_inventaires', j.n_promptitude_inventaires,
            'promptitude_requisitions', j.n_promptitude_requisitions)) AS p_promptitude,
        dqa.score_pilier(j.grille_id, jsonb_build_object(
            'regularite_saisie', j.n_regularite_saisie))               AS p_regularite,
        dqa.score_pilier(j.grille_id, jsonb_build_object(
            'ecart_sdu', j.n_ecart_sdu,
            'ecart_consommation', j.n_ecart_consommation))             AS p_ecart_sdu,
        dqa.score_pilier(j.grille_id, jsonb_build_object(
            'concordance', j.n_concordance))                           AS p_concordance,
        dqa.score_pilier(j.grille_id, jsonb_build_object(
            'ratio_ajustements', j.n_ratio_ajustements))               AS p_ajustements
    FROM jointes j
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
    dqa.classer_composite(c.score_composite, b.grille_id) AS classification,
    b.n_completude_requisitions  AS note_completude_requisitions,
    b.n_completude_receptions    AS note_completude_receptions,
    b.n_promptitude_inventaires  AS note_promptitude_inventaires,
    b.n_promptitude_requisitions AS note_promptitude_requisitions,
    b.n_regularite_saisie        AS note_regularite_saisie,
    b.n_ecart_sdu                AS note_ecart_sdu,
    b.n_ecart_consommation       AS note_ecart_consommation,
    b.n_concordance              AS note_concordance,
    b.n_ratio_ajustements        AS note_ratio_ajustements
FROM base b
LEFT JOIN composite c ON c.site_id = b.site_id AND c.mois_paqd = b.mois_paqd
      AND coalesce(c.programme_id, '') = coalesce(b.programme_id, '');

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));
