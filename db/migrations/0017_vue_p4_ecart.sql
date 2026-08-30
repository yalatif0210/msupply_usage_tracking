-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Indicateur P4 : écart SDU et écart consommation
--
--  Deux sous-composantes évaluées en TAUX DE CONFORMITÉ (part des produits
--  traceurs dans la tolérance), standard USAID DELIVER / APICS — jamais une
--  amplitude d'écart moyenne (ADR : spec §« P4 en taux de conformité »).
--
--  Écart SDU        : part des produits traceurs dont
--                     |théorique − compté| / compté ≤ tolérance
--                     au DERNIER inventaire finalisé du mois. Compté (réalité)
--                     au dénominateur, produit par produit.
--  Écart conso      : part des produits dont
--                     |déclarée − reconstituée| / reconstituée ≤ tolérance
--                     entre le PREMIER et le DERNIER inventaire finalisé du
--                     mois. reconstituée = stock_début + réceptions − stock_fin
--                     sur l'intervalle (d_début, d_fin]. Produit sans deux
--                     inventaires bornants ou reconstituée ≤ 0 → exclu.
--
--  Tolérance par produit et seuil de taux : grille du mois (`param_seuil`),
--  jamais en dur. Score de pilier P4 = moyenne simple des scores des deux
--  sous-composantes calculables (CONFORME = 100, ALERTE = 0).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

-- ── Grille : tolérance par sous-composante ─────────────────────────────────
ALTER TABLE grille_seuil_sous_composante
    ADD COLUMN IF NOT EXISTS tolerance numeric(8, 2);

COMMENT ON COLUMN grille_seuil_sous_composante.tolerance IS
    'Tolérance par produit (%) pour les sous-composantes évaluées en taux de conformité (écart SDU, écart consommation). NULL pour les autres.';

-- L'écart SDU existait avec l'ancienne sémantique (amplitude, sens « inf ») :
-- il passe en taux de conformité (seuil 90, sens « sup », tolérance 2 %).
UPDATE grille_seuil_sous_composante
   SET seuil = 90.00, sens = 'sup', tolerance = 2.00, unite = 'pct'
 WHERE sous_composante = 'ecart_sdu';

INSERT INTO grille_seuil_sous_composante (grille_id, sous_composante, seuil, sens, unite, tolerance)
SELECT id, 'ecart_consommation', 90.00, 'sup', 'pct', 2.00 FROM grille_parametre
ON CONFLICT (grille_id, sous_composante) DO NOTHING;

-- ── Vue P4 ────────────────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_p4_ecart CASCADE;
CREATE MATERIALIZED VIEW mv_p4_ecart AS
WITH lignes_traceur AS (
    -- lignes d'inventaire finalisé agrégées par (site, programme, date, produit)
    -- sur les lots, restreintes aux produits traceurs actifs et au périmètre.
    SELECT
        fi.site_id,
        fi.programme_id,
        fi.date_inventaire,
        to_char(fi.date_inventaire, 'YYYY-MM')        AS mois_paqd,
        p.produit_id,
        sum(fil.quantite_theorique)                   AS theorique,
        sum(fil.quantite_comptee)                     AS comptee
    FROM dqa.fact_inventaire fi
    JOIN dqa.dim_site s            ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
    JOIN dqa.dim_produit p         ON p.produit_id = fil.produit_id
    JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
    WHERE fi.statut = 'fn'
    GROUP BY fi.site_id, fi.programme_id, fi.date_inventaire, p.produit_id
),
lignes_dim AS (
    -- duplique chaque ligne pour l'agrégat « tous programmes » (prog = NULL)
    SELECT site_id, programme_id AS prog, mois_paqd, date_inventaire, produit_id, theorique, comptee
    FROM lignes_traceur
    UNION ALL
    SELECT site_id, NULL, mois_paqd, date_inventaire, produit_id, theorique, comptee
    FROM lignes_traceur
),
tol_mois AS (
    SELECT
        m.mois_paqd,
        max(sc.tolerance) FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS tol_sdu,
        max(sc.seuil)     FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS seuil_sdu,
        max(sc.tolerance) FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS tol_conso,
        max(sc.seuil)     FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS seuil_conso
    FROM (SELECT DISTINCT mois_paqd FROM lignes_traceur) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
     AND sc.sous_composante IN ('ecart_sdu', 'ecart_consommation')
    GROUP BY m.mois_paqd
),
-- ── Écart SDU : dernier inventaire du mois par produit ────────────────────
sdu_produit AS (
    SELECT DISTINCT ON (site_id, prog, mois_paqd, produit_id)
        site_id, prog, mois_paqd, produit_id,
        coalesce(theorique, 0) AS theorique,
        coalesce(comptee, 0)   AS comptee
    FROM lignes_dim
    ORDER BY site_id, prog, mois_paqd, produit_id, date_inventaire DESC
),
sdu AS (
    SELECT
        sp.site_id, sp.prog, sp.mois_paqd,
        count(*)                                       AS nb_produits,
        count(*) FILTER (WHERE
            CASE
                WHEN sp.comptee = 0 AND sp.theorique = 0 THEN true
                WHEN sp.comptee = 0                      THEN false
                ELSE abs(sp.theorique - sp.comptee) / sp.comptee * 100 <= t.tol_sdu
            END
        )                                              AS nb_conformes
    FROM sdu_produit sp
    JOIN tol_mois t ON t.mois_paqd = sp.mois_paqd
    GROUP BY sp.site_id, sp.prog, sp.mois_paqd
),
-- ── Écart consommation : deux inventaires bornants ────────────────────────
bornes AS (
    SELECT site_id, prog, mois_paqd, produit_id,
        min(date_inventaire) AS d_debut,
        max(date_inventaire) AS d_fin
    FROM lignes_dim
    GROUP BY site_id, prog, mois_paqd, produit_id
    HAVING min(date_inventaire) <> max(date_inventaire)
),
stock_borne AS (
    SELECT b.*,
        (SELECT sum(ld.comptee) FROM lignes_dim ld
          WHERE ld.site_id = b.site_id AND ld.prog IS NOT DISTINCT FROM b.prog
            AND ld.mois_paqd = b.mois_paqd AND ld.produit_id = b.produit_id
            AND ld.date_inventaire = b.d_debut)          AS stock_debut,
        (SELECT sum(ld.comptee) FROM lignes_dim ld
          WHERE ld.site_id = b.site_id AND ld.prog IS NOT DISTINCT FROM b.prog
            AND ld.mois_paqd = b.mois_paqd AND ld.produit_id = b.produit_id
            AND ld.date_inventaire = b.d_fin)            AS stock_fin
    FROM bornes b
),
mouvements AS (
    SELECT
        ft.site_id,
        ft.programme_id                                  AS prog,
        l.produit_id,
        coalesce(ft.date_confirmation, ft.date_saisie)   AS jour,
        ft.nature,
        sum(l.quantite_unitaire)                         AS q
    FROM dqa.fact_transaction ft
    JOIN dqa.fact_ligne_transaction l ON l.transaction_id = ft.transaction_id
    JOIN dqa.dim_produit p            ON p.produit_id = l.produit_id
    JOIN dqa.dim_produit_traceur tr   ON tr.produit_code = p.produit_code AND tr.actif
    JOIN dqa.dim_site s               ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
    WHERE ft.nature IN ('reception', 'dispensation')
      AND coalesce(ft.annulation, false) = false
      AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
    GROUP BY ft.site_id, ft.programme_id, l.produit_id,
             coalesce(ft.date_confirmation, ft.date_saisie), ft.nature
),
mouvements_dim AS (
    SELECT site_id, prog, produit_id, jour, nature, q FROM mouvements
    UNION ALL
    SELECT site_id, NULL, produit_id, jour, nature, q FROM mouvements
),
conso_produit AS (
    SELECT
        sb.site_id, sb.prog, sb.mois_paqd, sb.produit_id,
        coalesce(sb.stock_debut, 0)
          + coalesce((SELECT sum(m.q) FROM mouvements_dim m
                       WHERE m.site_id = sb.site_id AND m.prog IS NOT DISTINCT FROM sb.prog
                         AND m.produit_id = sb.produit_id AND m.nature = 'reception'
                         AND m.jour > sb.d_debut AND m.jour <= sb.d_fin), 0)
          - coalesce(sb.stock_fin, 0)                    AS reconstituee,
        coalesce((SELECT sum(m.q) FROM mouvements_dim m
                   WHERE m.site_id = sb.site_id AND m.prog IS NOT DISTINCT FROM sb.prog
                     AND m.produit_id = sb.produit_id AND m.nature = 'dispensation'
                     AND m.jour > sb.d_debut AND m.jour <= sb.d_fin), 0) AS declaree
    FROM stock_borne sb
),
conso AS (
    SELECT
        c.site_id, c.prog, c.mois_paqd,
        count(*) FILTER (WHERE c.reconstituee > 0)       AS nb_produits,
        count(*) FILTER (WHERE c.reconstituee > 0
            AND abs(c.declaree - c.reconstituee) / c.reconstituee * 100 <= t.tol_conso) AS nb_conformes
    FROM conso_produit c
    JOIN tol_mois t ON t.mois_paqd = c.mois_paqd
    GROUP BY c.site_id, c.prog, c.mois_paqd
),
assemble AS (
    SELECT
        sdu.site_id, sdu.prog, sdu.mois_paqd,
        round(sdu.nb_conformes::numeric / nullif(sdu.nb_produits, 0) * 100, 1)     AS taux_sdu_pct,
        sdu.nb_produits                                                            AS nb_produits_sdu,
        CASE WHEN coalesce(conso.nb_produits, 0) > 0
             THEN round(conso.nb_conformes::numeric / conso.nb_produits * 100, 1)
        END                                                                       AS taux_conso_pct,
        coalesce(conso.nb_produits, 0)                                             AS nb_produits_conso,
        t.seuil_sdu, t.seuil_conso
    FROM sdu
    JOIN tol_mois t ON t.mois_paqd = sdu.mois_paqd
    LEFT JOIN conso
           ON conso.site_id = sdu.site_id
          AND conso.prog IS NOT DISTINCT FROM sdu.prog
          AND conso.mois_paqd = sdu.mois_paqd
)
SELECT
    site_id,
    prog                                              AS programme_id,
    mois_paqd,
    taux_sdu_pct,
    nb_produits_sdu,
    taux_conso_pct,
    nb_produits_conso,
    CASE WHEN taux_sdu_pct   IS NULL THEN NULL WHEN taux_sdu_pct   >= seuil_sdu   THEN 100.0 ELSE 0.0 END AS score_sdu,
    CASE WHEN taux_conso_pct IS NULL THEN NULL WHEN taux_conso_pct >= seuil_conso THEN 100.0 ELSE 0.0 END AS score_conso,
    (
        SELECT round(avg(v.s), 1)::numeric(5, 1)
        FROM (VALUES
            (CASE WHEN taux_sdu_pct   IS NULL THEN NULL WHEN taux_sdu_pct   >= seuil_sdu   THEN 100.0 ELSE 0.0 END),
            (CASE WHEN taux_conso_pct IS NULL THEN NULL WHEN taux_conso_pct >= seuil_conso THEN 100.0 ELSE 0.0 END)
        ) AS v(s)
        WHERE v.s IS NOT NULL
    )                                                 AS p_ecart_sdu
FROM assemble;

CREATE UNIQUE INDEX mv_p4_uq
    ON mv_p4_ecart (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── Scores de pilier — P4 câblé ─────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_score_pilier CASCADE;
CREATE MATERIALIZED VIEW mv_score_pilier AS
WITH sites_mois AS (
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
        NULL::numeric(5, 1)                                           AS p_completude,
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

-- ── Procédure de rafraîchissement — ajoute mv_p4_ecart ─────────────────────
CREATE OR REPLACE PROCEDURE rafraichir_et_geler(p_lot_id bigint)
LANGUAGE plpgsql AS $$
DECLARE
    v_mois   text;
    v_grille bigint;
BEGIN
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
