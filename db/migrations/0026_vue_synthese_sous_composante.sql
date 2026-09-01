-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Synthèse nationale par sous-composante
--
--  `mv_synthese_nationale` ne descend qu'au pilier. Pour répondre à « quelle
--  sous-composante fait décrocher le plus de sites », on agrège les dix
--  valeurs gelées `hist_score_site.sc_*` au même grain (mois PAQD, +
--  région / district, + variante par programme) et par sous-composante :
--    - nb de sites CONFORME / ALERTE / NON_CALCULABLE (statut re-déduit de la
--      valeur gelée vs le seuil de la grille du mois, selon le sens) ;
--    - moyenne du **taux d'atteinte du seuil** (0..100), défini inline ici :
--        * `ecart_sdu` / `ecart_consommation` : la valeur gelée est déjà un
--          taux de conformité, reprise telle quelle (bornée à 100) ;
--        * sens plafond (`ratio_ajustements`) : seuil / valeur, borné à 1 ;
--        * sens plancher (P1, P2, P3, P5) : valeur / seuil, borné à 1.
--      À refactorer sur `v_sous_composante_atteinte` quand la tranche « fiche
--      site analytique » l'aura introduite (spec .scratch/refonte-analytique).
--
--  Lecture seule pour l'API. Rafraîchie par `rafraichir_et_geler` après le gel
--  de `hist_score_site` et `mv_synthese_nationale`.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_synthese_sous_composante CASCADE;
CREATE MATERIALIZED VIEW mv_synthese_sous_composante AS
WITH mois AS (
    SELECT DISTINCT mois_paqd FROM dqa.hist_score_site
),
sites AS (
    SELECT site_id, region, district FROM dqa.dim_site WHERE dans_perimetre_dqa
),
gerant AS (
    SELECT sp.site_id, sp.programme_id
    FROM dqa.dim_site_programme sp
    JOIN sites s ON s.site_id = sp.site_id
    WHERE sp.actif
),
-- (mois, site) « tous programmes » : grille + les dix valeurs gelées
tous AS (
    SELECT m.mois_paqd, s.region, s.district, h.grille_id,
           h.sc_completude_inventaires, h.sc_completude_requisitions, h.sc_completude_receptions,
           h.sc_promptitude_inventaires, h.sc_promptitude_requisitions, h.sc_regularite_saisie,
           h.sc_ecart_sdu, h.sc_ecart_consommation, h.sc_concordance, h.sc_ratio_ajustements
    FROM mois m
    CROSS JOIN sites s
    LEFT JOIN dqa.hist_score_site h
           ON h.site_id = s.site_id AND h.mois_paqd = m.mois_paqd AND h.programme_id IS NULL
),
parprog AS (
    SELECT m.mois_paqd, g.programme_id, s.region, s.district, h.grille_id,
           h.sc_completude_inventaires, h.sc_completude_requisitions, h.sc_completude_receptions,
           h.sc_promptitude_inventaires, h.sc_promptitude_requisitions, h.sc_regularite_saisie,
           h.sc_ecart_sdu, h.sc_ecart_consommation, h.sc_concordance, h.sc_ratio_ajustements
    FROM mois m
    CROSS JOIN gerant g
    JOIN sites s ON s.site_id = g.site_id
    LEFT JOIN dqa.hist_score_site h
           ON h.site_id = g.site_id AND h.mois_paqd = m.mois_paqd AND h.programme_id = g.programme_id
),
-- dépliage en (grain, sous-composante) avec seuil / sens de la grille du mois
detail_tous AS (
    SELECT
        t.mois_paqd, t.region, t.district, sc.sous_composante,
        CASE
            WHEN sc.valeur IS NULL THEN NULL
            WHEN sc.sous_composante IN ('ecart_sdu', 'ecart_consommation') THEN least(sc.valeur, 100)
            WHEN gs.sens = 'inf' THEN least(gs.seuil / nullif(sc.valeur, 0), 1) * 100
            ELSE least(sc.valeur / nullif(gs.seuil, 0), 1) * 100
        END::numeric(5, 1)                                               AS taux_atteinte,
        CASE
            WHEN sc.valeur IS NULL THEN 'NON_CALCULABLE'
            WHEN gs.sens = 'inf' THEN CASE WHEN sc.valeur <= gs.seuil THEN 'CONFORME' ELSE 'ALERTE' END
            ELSE CASE WHEN sc.valeur >= gs.seuil THEN 'CONFORME' ELSE 'ALERTE' END
        END                                                             AS statut
    FROM tous t
    CROSS JOIN LATERAL (VALUES
        ('completude_inventaires',   t.sc_completude_inventaires),
        ('completude_requisitions',  t.sc_completude_requisitions),
        ('completude_receptions',    t.sc_completude_receptions),
        ('promptitude_inventaires',  t.sc_promptitude_inventaires),
        ('promptitude_requisitions', t.sc_promptitude_requisitions),
        ('regularite_saisie',        t.sc_regularite_saisie),
        ('ecart_sdu',                t.sc_ecart_sdu),
        ('ecart_consommation',       t.sc_ecart_consommation),
        ('concordance',              t.sc_concordance),
        ('ratio_ajustements',        t.sc_ratio_ajustements)
    ) AS sc(sous_composante, valeur)
    LEFT JOIN dqa.grille_seuil_sous_composante gs
           ON gs.grille_id = t.grille_id AND gs.sous_composante = sc.sous_composante
),
detail_prog AS (
    SELECT
        p.mois_paqd, p.programme_id, p.region, p.district, sc.sous_composante,
        CASE
            WHEN sc.valeur IS NULL THEN NULL
            WHEN sc.sous_composante IN ('ecart_sdu', 'ecart_consommation') THEN least(sc.valeur, 100)
            WHEN gs.sens = 'inf' THEN least(gs.seuil / nullif(sc.valeur, 0), 1) * 100
            ELSE least(sc.valeur / nullif(gs.seuil, 0), 1) * 100
        END::numeric(5, 1)                                               AS taux_atteinte,
        CASE
            WHEN sc.valeur IS NULL THEN 'NON_CALCULABLE'
            WHEN gs.sens = 'inf' THEN CASE WHEN sc.valeur <= gs.seuil THEN 'CONFORME' ELSE 'ALERTE' END
            ELSE CASE WHEN sc.valeur >= gs.seuil THEN 'CONFORME' ELSE 'ALERTE' END
        END                                                             AS statut
    FROM parprog p
    CROSS JOIN LATERAL (VALUES
        ('completude_inventaires',   p.sc_completude_inventaires),
        ('completude_requisitions',  p.sc_completude_requisitions),
        ('completude_receptions',    p.sc_completude_receptions),
        ('promptitude_inventaires',  p.sc_promptitude_inventaires),
        ('promptitude_requisitions', p.sc_promptitude_requisitions),
        ('regularite_saisie',        p.sc_regularite_saisie),
        ('ecart_sdu',                p.sc_ecart_sdu),
        ('ecart_consommation',       p.sc_ecart_consommation),
        ('concordance',              p.sc_concordance),
        ('ratio_ajustements',        p.sc_ratio_ajustements)
    ) AS sc(sous_composante, valeur)
    LEFT JOIN dqa.grille_seuil_sous_composante gs
           ON gs.grille_id = p.grille_id AND gs.sous_composante = sc.sous_composante
)
SELECT
    mois_paqd,
    NULL::text                                                          AS programme_id,
    CASE WHEN grouping(region)   = 1 THEN NULL ELSE region   END         AS region,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END         AS district,
    sous_composante,
    count(*)                                                            AS nb_sites,
    count(*) FILTER (WHERE statut = 'CONFORME')                         AS nb_conforme,
    count(*) FILTER (WHERE statut = 'ALERTE')                           AS nb_alerte,
    count(*) FILTER (WHERE statut = 'NON_CALCULABLE')                   AS nb_non_calculable,
    round(avg(taux_atteinte), 1)::numeric(5, 1)                         AS taux_atteinte_moyen
FROM detail_tous
GROUP BY GROUPING SETS (
    (mois_paqd, sous_composante),
    (mois_paqd, region, sous_composante),
    (mois_paqd, region, district, sous_composante)
)
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(district) = 1 OR district IS NOT NULL)

UNION ALL

SELECT
    mois_paqd,
    programme_id,
    CASE WHEN grouping(region)   = 1 THEN NULL ELSE region   END,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END,
    sous_composante,
    count(*),
    count(*) FILTER (WHERE statut = 'CONFORME'),
    count(*) FILTER (WHERE statut = 'ALERTE'),
    count(*) FILTER (WHERE statut = 'NON_CALCULABLE'),
    round(avg(taux_atteinte), 1)::numeric(5, 1)
FROM detail_prog
GROUP BY GROUPING SETS (
    (mois_paqd, programme_id, sous_composante),
    (mois_paqd, programme_id, region, sous_composante),
    (mois_paqd, programme_id, region, district, sous_composante)
)
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(district) = 1 OR district IS NOT NULL);

CREATE UNIQUE INDEX mv_synthese_sous_composante_uq
    ON mv_synthese_sous_composante
       (mois_paqd, coalesce(programme_id, ''), coalesce(region, ''), coalesce(district, ''), sous_composante);

-- ── Procédure de rafraîchissement — ajoute mv_synthese_sous_composante ──────
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
        REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
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
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
END;
$$;

-- Alimente la vue pour l'historique déjà gelé.
REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
