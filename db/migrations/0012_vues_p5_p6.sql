-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Indicateurs P5 (concordance) et P6 (ratio d'ajustements)
--  Calculés par (site du périmètre, mois PAQD, programme). Une ligne
--  supplémentaire par (site, mois) avec programme_id = NULL agrège tous
--  programmes (GROUPING SETS). Les seuils sont lus dans la grille active pour
--  le mois — aucun seuil en dur.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

-- Grille en vigueur pour un mois donné (AAAA-MM).
CREATE OR REPLACE FUNCTION grille_pour_mois(p_mois text)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT id FROM dqa.grille_parametre
  WHERE effet_a_partir_de <= (p_mois || '-01')::date
  ORDER BY effet_a_partir_de DESC
  LIMIT 1
$$;

-- ── P5 — concordance physique / théorique ─────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_p5_concordance CASCADE;
CREATE MATERIALIZED VIEW mv_p5_concordance AS
WITH dernier_inv AS (
    SELECT DISTINCT ON (fi.site_id, fil.produit_id, to_char(fi.date_inventaire, 'YYYY-MM'))
        fi.site_id,
        fi.programme_id,
        to_char(fi.date_inventaire, 'YYYY-MM')                       AS mois_paqd,
        fil.produit_id,
        fil.quantite_comptee,
        fil.quantite_theorique
    FROM dqa.fact_inventaire fi
    JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
    JOIN dqa.dim_produit p     ON p.produit_id = fil.produit_id
    JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
    JOIN dqa.dim_site s        ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    WHERE fi.statut = 'fn'
    ORDER BY fi.site_id, fil.produit_id, to_char(fi.date_inventaire, 'YYYY-MM'),
             fi.date_inventaire DESC
),
taux AS (
    SELECT site_id, programme_id, mois_paqd, produit_id,
        CASE
            WHEN quantite_theorique IS NULL OR quantite_comptee IS NULL THEN NULL
            WHEN greatest(abs(quantite_theorique), abs(quantite_comptee)) = 0 THEN 100.0
            ELSE least(abs(quantite_theorique), abs(quantite_comptee))
                 / greatest(abs(quantite_theorique), abs(quantite_comptee)) * 100.0
        END AS taux_pct
    FROM dernier_inv
)
SELECT
    site_id,
    CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
    mois_paqd,
    round(avg(taux_pct)::numeric, 1)          AS taux_concordance_pct,
    count(*) FILTER (WHERE taux_pct IS NOT NULL) AS nb_produits
FROM taux
GROUP BY GROUPING SETS ((site_id, programme_id, mois_paqd), (site_id, mois_paqd))
HAVING grouping(programme_id) = 1 OR programme_id IS NOT NULL;

CREATE UNIQUE INDEX mv_p5_uq ON mv_p5_concordance (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── P6 — ratio d'ajustements ─────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_p6_ajustements CASCADE;
CREATE MATERIALIZED VIEW mv_p6_ajustements AS
WITH mouvements AS (
    SELECT
        ft.site_id,
        ft.programme_id,
        to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') AS mois_paqd,
        fl.issu_ajustement
             OR ft.nature IN ('ajustement_positif', 'ajustement_negatif')  AS est_ajustement
    FROM dqa.fact_transaction ft
    JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
    JOIN dqa.dim_site s ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
    WHERE coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
      AND coalesce(ft.annulation, false) = false
)
SELECT
    site_id,
    CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
    mois_paqd,
    count(*)                                                       AS nb_mouvements,
    count(*) FILTER (WHERE est_ajustement)                         AS nb_ajustements,
    round(
        count(*) FILTER (WHERE est_ajustement)::numeric
        / nullif(count(*), 0) * 100, 1
    )                                                              AS ratio_ajustements_pct
FROM mouvements
GROUP BY GROUPING SETS ((site_id, programme_id, mois_paqd), (site_id, mois_paqd))
HAVING grouping(programme_id) = 1 OR programme_id IS NOT NULL;

CREATE UNIQUE INDEX mv_p6_uq ON mv_p6_ajustements (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── Scores de pilier (P5, P6) ────────────────────────────────────────────
-- statut binaire selon la grille du mois ; score de pilier = 100 (CONFORME) /
-- 0 (ALERTE) / NULL (NON_CALCULABLE, ici : pas de donnée exploitable).
DROP MATERIALIZED VIEW IF EXISTS mv_score_pilier CASCADE;
CREATE MATERIALIZED VIEW mv_score_pilier AS
WITH sites_mois AS (
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p5_concordance
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p6_ajustements
),
seuils AS (
    SELECT sc.sous_composante, sc.seuil, sc.sens, sm.mois_paqd
    FROM sites_mois sm
    JOIN dqa.grille_seuil_sous_composante sc ON sc.grille_id = dqa.grille_pour_mois(sm.mois_paqd)
    GROUP BY sc.sous_composante, sc.seuil, sc.sens, sm.mois_paqd
)
SELECT
    sm.site_id,
    sm.mois_paqd,
    sm.programme_id,
    dqa.grille_pour_mois(sm.mois_paqd)                             AS grille_id,
    CASE
        WHEN p5.taux_concordance_pct IS NULL THEN NULL
        WHEN p5.taux_concordance_pct >= sc5.seuil THEN 100.0
        ELSE 0.0
    END                                                           AS p_concordance,
    CASE
        WHEN p6.ratio_ajustements_pct IS NULL THEN NULL
        WHEN p6.ratio_ajustements_pct <= sc6.seuil THEN 100.0
        ELSE 0.0
    END                                                           AS p_ajustements
FROM sites_mois sm
LEFT JOIN mv_p5_concordance p5
       ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd
      AND coalesce(p5.programme_id, '') = coalesce(sm.programme_id, '')
LEFT JOIN mv_p6_ajustements p6
       ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd
      AND coalesce(p6.programme_id, '') = coalesce(sm.programme_id, '')
LEFT JOIN seuils sc5 ON sc5.sous_composante = 'concordance'      AND sc5.mois_paqd = sm.mois_paqd
LEFT JOIN seuils sc6 ON sc6.sous_composante = 'ratio_ajustements' AND sc6.mois_paqd = sm.mois_paqd;

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── Procédure de rafraîchissement ────────────────────────────────────────
-- Appelée après la promotion, HORS de la transaction du lot. Gèle le seul
-- mois PAQD du lot dans hist_score_site.
CREATE OR REPLACE PROCEDURE rafraichir_et_geler(p_lot_id bigint)
LANGUAGE plpgsql AS $$
DECLARE
    v_mois   text;
    v_grille bigint;
BEGIN
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
         p_concordance, p_ajustements, score_composite, classification, lot_id, calcule_le)
    SELECT sp.site_id, sp.mois_paqd, sp.programme_id, v_grille,
           sp.p_concordance, sp.p_ajustements, NULL, NULL, p_lot_id, now()
    FROM dqa.mv_score_pilier sp
    JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
    WHERE sp.mois_paqd = v_mois
    ON CONFLICT (site_id, mois_paqd, programme_id) DO UPDATE SET
        grille_id     = EXCLUDED.grille_id,
        p_concordance = EXCLUDED.p_concordance,
        p_ajustements = EXCLUDED.p_ajustements,
        lot_id        = EXCLUDED.lot_id,
        calcule_le    = now();
END;
$$;
