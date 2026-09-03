-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Retours de revue du chantier « données brutes des piliers »
--
--  1. `mv_p4_ecart_produit` porte désormais la CONCORDANCE par produit
--     (`concordance_pct` / `concordance_conforme`) : le tableau produit P4 · P5
--     de la fiche site la lisait via un calcul SQL inline dans le repository
--     (CLAUDE.md §3 : les calculs d'indicateur vivent dans les vues). Sémantique
--     NULL alignée sur `mv_p5_concordance` (0028) : `NULL` quand la quantité
--     théorique OU comptée est absente — la ligne ne prétend alors pas être
--     concordante, comme l'agrégat qui l'exclut.
--
--  2. `dqa.jour_limite_requisition(type_structure, jour_limite_override)` :
--     l'échelle « CS → 5 / HG,CHR → 7 / autres → 10 » était réécrite dans
--     `mv_p2_promptitude`, dans le repository et dans la migration 0020. Une
--     fonction unique, réutilisée par le repository (détail P2 ligne à ligne).
--
--  3. `rafraichir_et_geler` : les mesures `p2_inventaires` / `p2_requisitions`
--     figent enfin leur `nb_realise` (repris de P1 — même site / mois /
--     programme géré), pour que la carte P2 affiche « réalisé / attendu » et
--     pas « n/d / N ». Rattrapage des mois déjà clos.
--
--  Le DROP … CASCADE de `mv_p4_ecart_produit` emporte `mv_p4_ecart` puis
--  `mv_score_pilier` : reconstruites à l'identique (0023 / 0028).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

-- ── Fonction : jour limite de soumission d'une réquisition ────────────────
CREATE OR REPLACE FUNCTION jour_limite_requisition(
    p_type_structure text,
    p_jour_limite_override integer
) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(
        p_jour_limite_override,
        CASE
            WHEN p_type_structure IN ('CSU', 'CSR', 'ESPC') THEN 5
            WHEN p_type_structure IN ('HG', 'CHR')          THEN 7
            ELSE 10
        END
    );
$$;

COMMENT ON FUNCTION jour_limite_requisition(text, integer) IS
    'Jour du mois M+1 (inclus) où la réquisition couvrant M doit être soumise : dim_site.jour_limite_requisition, sinon 5 (CSU/CSR/ESPC), 7 (HG/CHR), 10 (autres).';

-- ── mv_p4_ecart_produit — + concordance par produit ──────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_p4_ecart_produit CASCADE;
CREATE MATERIALIZED VIEW mv_p4_ecart_produit AS
WITH lignes_traceur AS (
    SELECT
        fi.site_id,
        fi.programme_id,
        fi.date_inventaire,
        to_char(fi.date_inventaire, 'YYYY-MM')        AS mois_paqd,
        p.produit_id,
        p.produit_code,
        tr.libelle                                    AS libelle,
        sum(fil.quantite_theorique)                   AS theorique,
        sum(fil.quantite_comptee)                     AS comptee
    FROM dqa.fact_inventaire fi
    JOIN dqa.dim_site s            ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
    JOIN dqa.dim_produit p         ON p.produit_id = fil.produit_id
    JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
    WHERE fi.statut = 'fn'
    GROUP BY fi.site_id, fi.programme_id, fi.date_inventaire,
             p.produit_id, p.produit_code, tr.libelle
),
lignes_dim AS (
    SELECT site_id, programme_id AS prog, mois_paqd, date_inventaire,
           produit_id, produit_code, libelle, theorique, comptee
    FROM lignes_traceur
    UNION ALL
    SELECT site_id, NULL, mois_paqd, date_inventaire,
           produit_id, produit_code, libelle, theorique, comptee
    FROM lignes_traceur
),
tol_mois AS (
    SELECT
        m.mois_paqd,
        max(sc.tolerance) FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS tol_sdu,
        max(sc.tolerance) FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS tol_conso,
        max(sc.seuil)     FILTER (WHERE sc.sous_composante = 'concordance')        AS seuil_concordance
    FROM (SELECT DISTINCT mois_paqd FROM lignes_traceur) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
     AND sc.sous_composante IN ('ecart_sdu', 'ecart_consommation', 'concordance')
    GROUP BY m.mois_paqd
),
sdu_produit AS (
    SELECT DISTINCT ON (site_id, prog, mois_paqd, produit_id)
        site_id, prog, mois_paqd, produit_id, produit_code, libelle,
        theorique                AS theorique_brut,
        comptee                  AS comptee_brut,
        coalesce(theorique, 0)   AS theorique,
        coalesce(comptee, 0)     AS comptee
    FROM lignes_dim
    ORDER BY site_id, prog, mois_paqd, produit_id, date_inventaire DESC
),
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
        coalesce(sb.stock_debut, 0)  AS stock_debut,
        coalesce(sb.stock_fin, 0)    AS stock_fin,
        coalesce((SELECT sum(m.q) FROM mouvements_dim m
                   WHERE m.site_id = sb.site_id AND m.prog IS NOT DISTINCT FROM sb.prog
                     AND m.produit_id = sb.produit_id AND m.nature = 'reception'
                     AND m.jour > sb.d_debut AND m.jour <= sb.d_fin), 0) AS receptions,
        coalesce((SELECT sum(m.q) FROM mouvements_dim m
                   WHERE m.site_id = sb.site_id AND m.prog IS NOT DISTINCT FROM sb.prog
                     AND m.produit_id = sb.produit_id AND m.nature = 'dispensation'
                     AND m.jour > sb.d_debut AND m.jour <= sb.d_fin), 0) AS declaree
    FROM stock_borne sb
),
detail AS (
    SELECT
        sp.site_id, sp.prog, sp.mois_paqd, sp.produit_id, sp.produit_code, sp.libelle,
        sp.theorique, sp.comptee,
        CASE
            WHEN sp.comptee = 0 AND sp.theorique = 0 THEN 0.0
            WHEN sp.comptee = 0                      THEN NULL
            ELSE round(abs(sp.theorique - sp.comptee) / sp.comptee * 100, 1)
        END::numeric(8, 1)                                       AS ecart_sdu_pct,
        (CASE
            WHEN sp.comptee = 0 AND sp.theorique = 0 THEN true
            WHEN sp.comptee = 0                      THEN false
            ELSE abs(sp.theorique - sp.comptee) / sp.comptee * 100 <= t.tol_sdu
        END)                                                    AS sdu_conforme,
        -- Concordance : NULL si une quantité manque (comme mv_p5_concordance),
        -- 100 si les deux sont à zéro, sinon min/max.
        CASE
            WHEN sp.theorique_brut IS NULL OR sp.comptee_brut IS NULL THEN NULL
            WHEN greatest(abs(sp.theorique_brut), abs(sp.comptee_brut)) = 0 THEN 100.0
            ELSE round(least(abs(sp.theorique_brut), abs(sp.comptee_brut))
                       / greatest(abs(sp.theorique_brut), abs(sp.comptee_brut)) * 100, 1)
        END::numeric(8, 1)                                       AS concordance_pct,
        t.seuil_concordance,
        cp.stock_debut, cp.stock_fin, cp.receptions, cp.declaree,
        CASE WHEN cp.produit_id IS NOT NULL
             THEN cp.stock_debut + cp.receptions - cp.stock_fin END AS reconstituee,
        (cp.produit_id IS NOT NULL
         AND (cp.stock_debut + cp.receptions - cp.stock_fin) > 0)   AS conso_evaluable,
        CASE
            WHEN cp.produit_id IS NULL THEN 'un_seul_inventaire'
            WHEN (cp.stock_debut + cp.receptions - cp.stock_fin) <= 0 THEN 'reconstituee_non_positive'
        END                                                        AS conso_raison_exclusion,
        t.tol_conso
    FROM sdu_produit sp
    JOIN tol_mois t ON t.mois_paqd = sp.mois_paqd
    LEFT JOIN conso_produit cp
           ON cp.site_id = sp.site_id AND cp.prog IS NOT DISTINCT FROM sp.prog
          AND cp.mois_paqd = sp.mois_paqd AND cp.produit_id = sp.produit_id
)
SELECT
    site_id,
    prog                                                       AS programme_id,
    mois_paqd,
    produit_id,
    produit_code,
    libelle,
    theorique,
    comptee,
    ecart_sdu_pct,
    sdu_conforme,
    concordance_pct,
    (concordance_pct IS NOT NULL
     AND seuil_concordance IS NOT NULL
     AND concordance_pct >= seuil_concordance)                  AS concordance_conforme,
    stock_debut,
    stock_fin,
    receptions,
    declaree,
    reconstituee,
    conso_evaluable,
    conso_raison_exclusion,
    CASE WHEN conso_evaluable
         THEN round(abs(declaree - reconstituee) / reconstituee * 100, 1)::numeric(8, 1)
    END                                                        AS ecart_conso_pct,
    CASE WHEN conso_evaluable
         THEN abs(declaree - reconstituee) / reconstituee * 100 <= tol_conso
         ELSE false
    END                                                        AS conso_conforme
FROM detail;

CREATE UNIQUE INDEX mv_p4_ecart_produit_uq
    ON mv_p4_ecart_produit (site_id, mois_paqd, coalesce(programme_id, ''), produit_id);

-- ── mv_p4_ecart — agrège la vue produit (à l'identique de 0023) ──────────
DROP MATERIALIZED VIEW IF EXISTS mv_p4_ecart CASCADE;
CREATE MATERIALIZED VIEW mv_p4_ecart AS
WITH agg AS (
    SELECT
        site_id, programme_id, mois_paqd,
        count(*)::int                                          AS nb_produits_sdu,
        (count(*) FILTER (WHERE sdu_conforme))::int            AS nb_conformes_sdu,
        (count(*) FILTER (WHERE conso_evaluable))::int         AS nb_produits_conso,
        (count(*) FILTER (WHERE conso_evaluable AND conso_conforme))::int AS nb_conformes_conso
    FROM dqa.mv_p4_ecart_produit
    GROUP BY site_id, programme_id, mois_paqd
),
seuil AS (
    SELECT
        m.mois_paqd,
        max(sc.seuil) FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS seuil_sdu,
        max(sc.seuil) FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS seuil_conso
    FROM (SELECT DISTINCT mois_paqd FROM agg) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
     AND sc.sous_composante IN ('ecart_sdu', 'ecart_consommation')
    GROUP BY m.mois_paqd
),
notes AS (
    SELECT
        a.site_id, a.programme_id, a.mois_paqd, a.nb_produits_sdu, a.nb_produits_conso,
        a.nb_conformes_sdu, a.nb_conformes_conso,
        round(a.nb_conformes_sdu::numeric / nullif(a.nb_produits_sdu, 0) * 100, 1)  AS taux_sdu_pct,
        CASE WHEN a.nb_produits_conso > 0
             THEN round(a.nb_conformes_conso::numeric / a.nb_produits_conso * 100, 1)
        END                                                                        AS taux_conso_pct,
        s.seuil_sdu, s.seuil_conso
    FROM agg a
    JOIN seuil s ON s.mois_paqd = a.mois_paqd
)
SELECT
    site_id,
    programme_id,
    mois_paqd,
    taux_sdu_pct,
    nb_produits_sdu,
    nb_conformes_sdu,
    taux_conso_pct,
    nb_produits_conso,
    nb_conformes_conso,
    CASE WHEN taux_sdu_pct   IS NULL THEN NULL WHEN taux_sdu_pct   >= seuil_sdu   THEN 100.0 ELSE 0.0 END AS score_sdu,
    CASE WHEN taux_conso_pct IS NULL THEN NULL WHEN taux_conso_pct >= seuil_conso THEN 100.0 ELSE 0.0 END AS score_conso,
    (
        SELECT round(avg(v.s), 1)::numeric(5, 1)
        FROM (VALUES
            (CASE WHEN taux_sdu_pct   IS NULL THEN NULL WHEN taux_sdu_pct   >= seuil_sdu   THEN 100.0 ELSE 0.0 END),
            (CASE WHEN taux_conso_pct IS NULL THEN NULL WHEN taux_conso_pct >= seuil_conso THEN 100.0 ELSE 0.0 END)
        ) AS v(s)
        WHERE v.s IS NOT NULL
    )                                                          AS p_ecart_sdu
FROM notes;

CREATE UNIQUE INDEX mv_p4_uq
    ON mv_p4_ecart (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── mv_score_pilier — reconstruite à l'identique de 0028 (dix valeurs sc_*) ──
DROP MATERIALIZED VIEW IF EXISTS mv_score_pilier CASCADE;
CREATE MATERIALIZED VIEW mv_score_pilier AS
WITH sites_mois AS (
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p1_completude
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p2_promptitude
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p3_regularite
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p4_ecart
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p5_concordance
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p6_ajustements
),
seuils AS (
    SELECT sc.sous_composante, sc.seuil, sc.sens, m.mois_paqd
    FROM (SELECT DISTINCT mois_paqd FROM sites_mois) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
),
base AS (
    SELECT
        sm.site_id, sm.mois_paqd, sm.programme_id,
        dqa.grille_pour_mois(sm.mois_paqd)                            AS grille_id,
        p1.p_completude, p2.p_promptitude,
        CASE WHEN p3.taux_regularite_pct IS NULL THEN NULL
             WHEN p3.taux_regularite_pct >= sc3.seuil THEN 100.0 ELSE 0.0 END AS p_regularite,
        p4.p_ecart_sdu,
        CASE WHEN p5.taux_concordance_pct IS NULL THEN NULL
             WHEN p5.taux_concordance_pct >= sc5.seuil THEN 100.0 ELSE 0.0 END AS p_concordance,
        CASE WHEN p6.ratio_ajustements_pct IS NULL THEN NULL
             WHEN p6.ratio_ajustements_pct <= sc6.seuil THEN 100.0 ELSE 0.0 END AS p_ajustements,
        p1.completude_inventaires_pct   AS sc_completude_inventaires,
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
    LEFT JOIN seuils sc3 ON sc3.sous_composante = 'regularite_saisie' AND sc3.mois_paqd = sm.mois_paqd
    LEFT JOIN seuils sc5 ON sc5.sous_composante = 'concordance'       AND sc5.mois_paqd = sm.mois_paqd
    LEFT JOIN seuils sc6 ON sc6.sous_composante = 'ratio_ajustements' AND sc6.mois_paqd = sm.mois_paqd
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
    b.sc_completude_inventaires, b.sc_completude_requisitions, b.sc_completude_receptions,
    b.sc_promptitude_inventaires, b.sc_promptitude_requisitions, b.sc_regularite_saisie,
    b.sc_ecart_sdu, b.sc_ecart_consommation, b.sc_concordance, b.sc_ratio_ajustements,
    c.score_composite,
    dqa.classer_composite(c.score_composite) AS classification
FROM base b
LEFT JOIN composite c ON c.site_id = b.site_id AND c.mois_paqd = b.mois_paqd
      AND coalesce(c.programme_id, '') = coalesce(b.programme_id, '');

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── rafraichir_et_geler — P2 fige nb_realise (repris de P1) ──────────────
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
        REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
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

    INSERT INTO dqa.hist_pilier_brut
        (site_id, mois_paqd, programme_id, mesure, nb_attendu, nb_realise, nb_a_lheure, lot_id, calcule_le)
    SELECT sm.site_id, sm.mois_paqd, sm.programme_id, m.mesure,
           m.nb_attendu::int, m.nb_realise::int, m.nb_a_lheure::int, p_lot_id, now()
    FROM (SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_score_pilier WHERE mois_paqd = v_mois) sm
    JOIN dqa.dim_site s ON s.site_id = sm.site_id AND s.dans_perimetre_dqa
    LEFT JOIN dqa.mv_p1_completude  p1 ON p1.site_id = sm.site_id AND p1.mois_paqd = sm.mois_paqd AND p1.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p2_promptitude p2 ON p2.site_id = sm.site_id AND p2.mois_paqd = sm.mois_paqd AND p2.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p3_regularite  p3 ON p3.site_id = sm.site_id AND p3.mois_paqd = sm.mois_paqd AND p3.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p4_ecart       p4 ON p4.site_id = sm.site_id AND p4.mois_paqd = sm.mois_paqd AND p4.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p5_concordance p5 ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd AND p5.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p6_ajustements p6 ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd AND p6.programme_id IS NOT DISTINCT FROM sm.programme_id
    CROSS JOIN LATERAL (VALUES
        ('p1_inventaires',        p1.nb_inventaires_attendu,  p1.nb_inventaires_realise,   NULL::int,                     p1.completude_inventaires_pct),
        ('p1_requisitions',       p1.nb_requisitions_attendu, p1.nb_requisitions_realise,  NULL::int,                     p1.completude_requisitions_pct),
        ('p1_receptions',         p1.nb_factures,             p1.nb_receptions,            NULL::int,                     p1.completude_receptions_pct),
        ('p2_inventaires',        p2.nb_inventaires_attendu,  p1.nb_inventaires_realise,   p2.nb_inventaires_a_lheure,    p2.promptitude_inventaires_pct),
        ('p2_requisitions',       p2.nb_requisitions_attendu, p1.nb_requisitions_realise,  p2.nb_requisitions_a_lheure,   p2.promptitude_requisitions_pct),
        ('p3_regularite',         p3.nb_jours,                p3.nb_jours_avec_sortie,     NULL::int,                     p3.taux_regularite_pct),
        ('p4_ecart_sdu',          p4.nb_produits_sdu,         p4.nb_conformes_sdu,         NULL::int,                     p4.taux_sdu_pct),
        ('p4_ecart_consommation', p4.nb_produits_conso,       p4.nb_conformes_conso,       NULL::int,                     p4.taux_conso_pct),
        ('p5_concordance',        p5.nb_produits,             p5.nb_produits_conformes,    NULL::int,                     p5.taux_concordance_pct),
        ('p6_ajustements',        p6.nb_mouvements,           p6.nb_ajustements,           NULL::int,                     p6.ratio_ajustements_pct)
    ) AS m(mesure, nb_attendu, nb_realise, nb_a_lheure, pct)
    WHERE m.pct IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_hist_pilier_brut DO UPDATE SET
        nb_attendu  = EXCLUDED.nb_attendu,
        nb_realise  = EXCLUDED.nb_realise,
        nb_a_lheure = EXCLUDED.nb_a_lheure,
        lot_id      = EXCLUDED.lot_id,
        calcule_le  = now();

    REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
END;
$$;

-- ── Rattrapage : concordance produit + nb_realise P2 des mois déjà clos ──
REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
REFRESH MATERIALIZED VIEW dqa.mv_p2_promptitude;
REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart_produit;
REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
REFRESH MATERIALIZED VIEW dqa.mv_p6_ajustements;
REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;

UPDATE dqa.hist_pilier_brut b SET nb_realise = p1.nb_realise, calcule_le = now()
FROM (
    SELECT hp.site_id, hp.mois_paqd, hp.programme_id,
           replace(hp.mesure, 'p2_', 'p1_') AS mesure_p1, hp.mesure AS mesure_p2
    FROM dqa.hist_pilier_brut hp
    WHERE hp.mesure IN ('p2_inventaires', 'p2_requisitions') AND hp.nb_realise IS NULL
) cible
JOIN dqa.hist_pilier_brut p1
  ON p1.site_id = cible.site_id AND p1.mois_paqd = cible.mois_paqd
 AND p1.programme_id IS NOT DISTINCT FROM cible.programme_id
 AND p1.mesure = cible.mesure_p1
WHERE b.site_id = cible.site_id AND b.mois_paqd = cible.mois_paqd
  AND b.programme_id IS NOT DISTINCT FROM cible.programme_id
  AND b.mesure = cible.mesure_p2;

REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
