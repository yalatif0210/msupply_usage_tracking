-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Gel des valeurs de sous-composante (ADR 0007)
--
--  `hist_score_site` ne figeait que les scores de pilier (p_*, 0/100/renorm) et
--  le composite. Les valeurs mesurées des sous-composantes (« taux P3 = 71 % »,
--  « taux SDU = 98 % »…) étaient recalculées à la volée par les vues mv_*, donc
--  susceptibles de bouger rétroactivement à chaque évolution de règle
--  (la migration 0024 l'a fait pour P3). Pour que les courbes d'évolution et
--  les radars par sous-composante soient immuables (même esprit qu'ADR 0003),
--  on gèle les dix valeurs mois par mois.
--
--  Dix colonnes `sc_*` sur `hist_score_site`, une par sous-composante, portant
--  la valeur brute (pas le seuil ni le statut, déductibles via `grille_id`).
--
--  `mv_score_pilier` expose désormais ces dix valeurs (elle joint déjà mv_p1..
--  mv_p6 dans son CTE `base`) ; `rafraichir_et_geler` les fige. Rattrapage
--  one-shot en fin de migration : les mois déjà clos reçoivent leurs valeurs
--  recalculées depuis les vues *courantes* (donc P3 = jours calendaires même
--  pour les mois gelés avant 0024). Assumé, c'est le prix d'introduire le gel
--  après coup.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

ALTER TABLE hist_score_site
    ADD COLUMN sc_completude_inventaires   numeric,
    ADD COLUMN sc_completude_requisitions  numeric,
    ADD COLUMN sc_completude_receptions    numeric,
    ADD COLUMN sc_promptitude_inventaires  numeric,
    ADD COLUMN sc_promptitude_requisitions numeric,
    ADD COLUMN sc_regularite_saisie        numeric,
    ADD COLUMN sc_ecart_sdu                numeric,
    ADD COLUMN sc_ecart_consommation       numeric,
    ADD COLUMN sc_concordance              numeric,
    ADD COLUMN sc_ratio_ajustements        numeric;

-- ── mv_score_pilier — porte aussi les dix valeurs brutes de sous-composante ──
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
        END                                                          AS p_ajustements,
        p1.completude_inventaires_pct                                AS sc_completude_inventaires,
        p1.completude_requisitions_pct                               AS sc_completude_requisitions,
        p1.completude_receptions_pct                                 AS sc_completude_receptions,
        p2.promptitude_inventaires_pct                               AS sc_promptitude_inventaires,
        p2.promptitude_requisitions_pct                              AS sc_promptitude_requisitions,
        p3.taux_regularite_pct                                       AS sc_regularite_saisie,
        p4.taux_sdu_pct                                              AS sc_ecart_sdu,
        p4.taux_conso_pct                                            AS sc_ecart_consommation,
        p5.taux_concordance_pct                                      AS sc_concordance,
        p6.ratio_ajustements_pct                                     AS sc_ratio_ajustements
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
    b.sc_completude_inventaires,
    b.sc_completude_requisitions,
    b.sc_completude_receptions,
    b.sc_promptitude_inventaires,
    b.sc_promptitude_requisitions,
    b.sc_regularite_saisie,
    b.sc_ecart_sdu,
    b.sc_ecart_consommation,
    b.sc_concordance,
    b.sc_ratio_ajustements,
    c.score_composite,
    dqa.classer_composite(c.score_composite)                         AS classification
FROM base b
LEFT JOIN composite c
       ON c.site_id = b.site_id AND c.mois_paqd = b.mois_paqd
      AND coalesce(c.programme_id, '') = coalesce(b.programme_id, '');

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── Procédure de rafraîchissement — fige aussi les dix valeurs sc_* ──────────
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

    REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
END;
$$;

-- ── Rattrapage one-shot des mois déjà gelés ─────────────────────────────────
REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
REFRESH MATERIALIZED VIEW dqa.mv_p2_promptitude;
REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart_produit;
REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
REFRESH MATERIALIZED VIEW dqa.mv_p6_ajustements;
REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;

UPDATE dqa.hist_score_site h SET
    sc_completude_inventaires   = sp.sc_completude_inventaires,
    sc_completude_requisitions  = sp.sc_completude_requisitions,
    sc_completude_receptions    = sp.sc_completude_receptions,
    sc_promptitude_inventaires  = sp.sc_promptitude_inventaires,
    sc_promptitude_requisitions = sp.sc_promptitude_requisitions,
    sc_regularite_saisie        = sp.sc_regularite_saisie,
    sc_ecart_sdu                = sp.sc_ecart_sdu,
    sc_ecart_consommation       = sp.sc_ecart_consommation,
    sc_concordance              = sp.sc_concordance,
    sc_ratio_ajustements        = sp.sc_ratio_ajustements
FROM dqa.mv_score_pilier sp
JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
WHERE sp.site_id = h.site_id
  AND sp.mois_paqd = h.mois_paqd
  AND coalesce(sp.programme_id, '') = coalesce(h.programme_id, '');
