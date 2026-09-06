-- ═══════════════════════════════════════════════════════════════════════════
--  Durcissement du scoring : le silence d'un site de soins est un signal,
--  pas un état vide (ADR 0012).
--
--  Trois changements, un même principe. Un site du périmètre est attendu
--  actif chaque mois ; ne rien transmettre n'est plus « non calculable »,
--  c'est 0 %.
--
--  1. P1 complétude des inventaires — ne compte l'inventaire que s'il est
--     daté dans les trois derniers jours du mois (même fenêtre que la
--     promptitude P2). Les deux sous-composantes deviennent identiques :
--     c'est voulu, l'échéance de fin de mois pèse alors 10 % (P1) + 15 % (P2).
--
--  2. P3 régularité — pour un site non-district du périmètre, une ligne
--     « tous programmes » existe pour CHAQUE mois couvert par un import,
--     même sans aucune sortie : 0 jour / N jours = 0 %. Plus jamais
--     NON_CALCULABLE pour un site qui dispense. Districts inchangés
--     (branche distribution : NON_CALCULABLE sans réquisition de zone).
--
--  3. P4 écart SDU + P5 concordance — 0 % (au lieu de NON_CALCULABLE) quand
--     le site n'a aucun inventaire finalisé daté dans le mois.
--
--  4. P4 écart consommation — bornes inter-mois. Pour évaluer le mois M :
--       ouverture = dernier inventaire finalisé du mois M-1 (stock d'entrée) ;
--       clôture   = dernier inventaire finalisé du mois M.
--     Fallback si M-1 n'a aucun inventaire : premier / dernier inventaire de M
--     (ancien modèle), à condition que M en ait deux de dates différentes.
--     Aucune borne d'ouverture exploitable ⇒ 0 %. NON_CALCULABLE seulement si
--     des bornes existent mais qu'aucune consommation reconstituée n'est
--     positive (donnée douteuse, pas un manquement).
--     Pour un district, « écart consommation » se lit « écart distribution » :
--     la consommation déclarée est la somme des quantités DISTRIBUÉES entre
--     les bornes (au lieu des dispensations), même reconstruction.
--
--  P2 (promptitude) et P6 (ratio d'ajustements) : inchangés. P6 « aucun
--  mouvement » reste NON_CALCULABLE (hors périmètre de ce durcissement).
--
--  Le durcissement porte sur le grain « tous programmes » (le score de site).
--  Le détail par programme reste calculé là où le site a effectivement
--  rapporté ce programme.
--
--  Immutabilité des cycles clos (ADR 0003 / 0010) : inchangée, elle tient à
--  la règle de validation MOIS_PAQD_TROP_ANCIEN. Le rattrapage ci-dessous
--  rejoue `rafraichir_et_geler(NULL)` : reconstruit tous les mois trouvables
--  dans le core, y compris les nouveaux grains (site silencieux à 0 %).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_p4_ecart_produit CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_p1_completude CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_p3_regularite CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_p5_concordance CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_score_pilier CASCADE;

-- ══ P1 — complétude des transactions (inventaire = 3 derniers jours) ════════
CREATE MATERIALIZED VIEW mv_p1_completude AS
WITH perimetre AS (
    SELECT site_id FROM dqa.dim_site WHERE dans_perimetre_dqa
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
        UNION ALL
        SELECT ft.site_id, to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM')
        FROM dqa.fact_transaction ft
        JOIN perimetre p ON p.site_id = ft.site_id
        WHERE ft.nature IN ('reception', 'facture_fournisseur')
          AND coalesce(ft.annulation, false) = false
          AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
    ) u
),
grain AS (
    SELECT a.site_id, a.mois, m.prog
    FROM activite a
    JOIN managed m ON m.site_id = a.site_id
    UNION
    SELECT a.site_id, a.mois, NULL::text
    FROM activite a
),
statut_prog AS (
    SELECT
        g.site_id, g.mois, m.prog,
        EXISTS (SELECT 1 FROM dqa.fact_inventaire fi
                 WHERE fi.site_id = g.site_id AND fi.statut = 'fn'
                   AND fi.programme_id = m.prog
                   AND to_char(fi.date_inventaire, 'YYYY-MM') = g.mois
                   AND fi.date_inventaire >= (date_trunc('month', fi.date_inventaire)
                                              + interval '1 month' - interval '3 days')::date) AS a_inv,
        EXISTS (SELECT 1 FROM dqa.fact_requisition fr
                 WHERE fr.site_id = g.site_id AND fr.programme_id = m.prog
                   AND fr.mois_couvert = g.mois)                            AS a_req
    FROM (SELECT DISTINCT site_id, mois FROM grain) g
    JOIN managed m ON m.site_id = g.site_id
),
inv_req AS (
    SELECT sp.site_id, sp.mois, sp.prog,
        CASE WHEN sp.a_inv THEN 100.0 ELSE 0.0 END              AS completude_inventaires_pct,
        CASE WHEN sp.a_req THEN 100.0 ELSE 0.0 END              AS completude_requisitions_pct,
        1                                                       AS nb_inventaires_attendu,
        CASE WHEN sp.a_inv THEN 1 ELSE 0 END                    AS nb_inventaires_realise,
        1                                                       AS nb_requisitions_attendu,
        CASE WHEN sp.a_req THEN 1 ELSE 0 END                    AS nb_requisitions_realise
    FROM statut_prog sp
    UNION ALL
    SELECT sp.site_id, sp.mois, NULL::text,
        round(100.0 * count(*) FILTER (WHERE sp.a_inv) / nullif(count(*), 0), 1),
        round(100.0 * count(*) FILTER (WHERE sp.a_req) / nullif(count(*), 0), 1),
        count(*)::int,
        count(*) FILTER (WHERE sp.a_inv)::int,
        count(*)::int,
        count(*) FILTER (WHERE sp.a_req)::int
    FROM statut_prog sp
    GROUP BY sp.site_id, sp.mois
),
receptions AS (
    SELECT
        g.site_id, g.mois, g.prog,
        (SELECT count(*)::int FROM dqa.fact_transaction ft
          WHERE ft.site_id = g.site_id AND ft.nature = 'reception'
            AND coalesce(ft.statut, '') = 'fn'
            AND coalesce(ft.annulation, false) = false
            AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = g.mois
            AND (g.prog IS NULL OR ft.programme_id = g.prog))              AS nb_receptions,
        (SELECT count(*)::int FROM dqa.fact_transaction ft
          WHERE ft.site_id = g.site_id AND ft.nature = 'facture_fournisseur'
            AND coalesce(ft.annulation, false) = false
            AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = g.mois
            AND (g.prog IS NULL OR ft.programme_id = g.prog))              AS nb_factures
    FROM grain g
),
seuil AS (
    SELECT m.mois, max(sc.seuil) AS seuil
    FROM (SELECT DISTINCT mois FROM grain) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois)
     AND sc.sous_composante = 'completude_inventaires'
    GROUP BY m.mois
),
assemble AS (
    SELECT
        ir.site_id,
        ir.prog                                                          AS programme_id,
        ir.mois                                                          AS mois_paqd,
        ir.completude_inventaires_pct,
        ir.completude_requisitions_pct,
        CASE WHEN r.nb_factures > 0
             THEN round(100.0 * r.nb_receptions / r.nb_factures, 1)
        END                                                              AS completude_receptions_pct,
        ir.nb_inventaires_realise,
        ir.nb_inventaires_attendu,
        ir.nb_requisitions_realise,
        ir.nb_requisitions_attendu,
        r.nb_receptions,
        r.nb_factures,
        s.seuil
    FROM inv_req ir
    JOIN seuil s ON s.mois = ir.mois
    LEFT JOIN receptions r
           ON r.site_id = ir.site_id AND r.mois = ir.mois
          AND r.prog IS NOT DISTINCT FROM ir.prog
)
SELECT
    site_id,
    programme_id,
    mois_paqd,
    completude_inventaires_pct,
    completude_requisitions_pct,
    completude_receptions_pct,
    nb_inventaires_realise,
    nb_inventaires_attendu,
    nb_requisitions_realise,
    nb_requisitions_attendu,
    nb_receptions,
    nb_factures,
    CASE WHEN completude_inventaires_pct  >= seuil THEN 100.0 ELSE 0.0 END AS score_inventaires,
    CASE WHEN completude_requisitions_pct >= seuil THEN 100.0 ELSE 0.0 END AS score_requisitions,
    CASE WHEN completude_receptions_pct IS NULL THEN NULL
         WHEN completude_receptions_pct >= seuil THEN 100.0 ELSE 0.0 END   AS score_receptions,
    (
        SELECT round(avg(v.s), 1)::numeric(5, 1)
        FROM (VALUES
            (CASE WHEN completude_inventaires_pct  >= seuil THEN 100.0 ELSE 0.0 END),
            (CASE WHEN completude_requisitions_pct >= seuil THEN 100.0 ELSE 0.0 END),
            (CASE WHEN completude_receptions_pct IS NULL THEN NULL
                  WHEN completude_receptions_pct >= seuil THEN 100.0 ELSE 0.0 END)
        ) AS v(s)
        WHERE v.s IS NOT NULL
    )                                                                    AS p_completude
FROM assemble;

CREATE UNIQUE INDEX mv_p1_uq
    ON mv_p1_completude (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ P3 — régularité (dispensation forcée pour tout site non-district) ═══════
CREATE MATERIALIZED VIEW mv_p3_regularite AS
WITH districts AS (
    SELECT s.site_id, s.district
    FROM dqa.dim_site s
    WHERE s.dans_perimetre_dqa AND dqa.strate_de(s.type_structure) = 'District'
),
jours_du_mois AS (
    -- P3 est un compteur au fil des jours écoulés, borné au mois strict :
    -- dénominateur = jours du 1er au jour courant, plafonné au nombre de jours
    -- du mois. Un mois passé prend tous ses jours ; un mois futur prend 0
    -- (taux NULL). Le mois se stabilise de lui-même à sa clôture.
    SELECT mois_paqd,
        least(
            count(*),
            greatest(0, (CURRENT_DATE - (mois_paqd || '-01')::date) + 1)
        ) AS nb_jours
    FROM dqa.dim_temps
    GROUP BY mois_paqd
),
mois_couverts AS (
    SELECT DISTINCT u.mois
    FROM (
        SELECT to_char(fi.date_inventaire, 'YYYY-MM') AS mois
        FROM dqa.fact_inventaire fi WHERE fi.statut = 'fn'
        UNION ALL
        SELECT fr.mois_couvert FROM dqa.fact_requisition fr
        UNION ALL
        SELECT to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM')
        FROM dqa.fact_transaction ft
        WHERE coalesce(ft.annulation, false) = false
          AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
    ) u(mois)
    WHERE u.mois IS NOT NULL
      AND u.mois IN (SELECT mois_paqd FROM dqa.dim_temps)
),
sorties AS (
    SELECT ft.site_id, ft.programme_id, t.mois_paqd, t.jour
    FROM dqa.fact_transaction ft
    JOIN dqa.dim_site s ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
    JOIN dqa.dim_temps t ON t.jour = coalesce(ft.date_confirmation, ft.date_saisie)
    WHERE ft.nature IN ('dispensation', 'distribution')
      AND coalesce(ft.annulation, false) = false
      AND NOT EXISTS (SELECT 1 FROM districts d WHERE d.site_id = ft.site_id)
),
agg_dispensation AS (
    SELECT site_id,
        CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
        mois_paqd,
        count(DISTINCT jour) AS nb_jours_avec_sortie
    FROM sorties
    GROUP BY GROUPING SETS ((site_id, programme_id, mois_paqd), (site_id, mois_paqd))
    HAVING grouping(programme_id) = 1 OR programme_id IS NOT NULL
),
grain_dispensation AS (
    -- tous programmes : chaque site non-district du périmètre × chaque mois couvert
    SELECT s.site_id, NULL::text AS programme_id, mc.mois AS mois_paqd
    FROM dqa.dim_site s
    CROSS JOIN mois_couverts mc
    WHERE s.dans_perimetre_dqa
      AND dqa.strate_de(s.type_structure) <> 'District'
    UNION
    -- par programme : là où il y a eu des sorties
    SELECT a.site_id, a.programme_id, a.mois_paqd
    FROM agg_dispensation a
    WHERE a.programme_id IS NOT NULL
),
p3_dispensation AS (
    SELECT
        g.site_id, g.programme_id, g.mois_paqd,
        coalesce(a.nb_jours_avec_sortie, 0)          AS nb_realise,
        j.nb_jours                                   AS nb_attendu,
        round(coalesce(a.nb_jours_avec_sortie, 0)::numeric / nullif(j.nb_jours, 0) * 100, 1) AS taux_regularite_pct,
        false                                        AS est_district
    FROM grain_dispensation g
    JOIN jours_du_mois j ON j.mois_paqd = g.mois_paqd
    LEFT JOIN agg_dispensation a
           ON a.site_id = g.site_id AND a.mois_paqd = g.mois_paqd
          AND coalesce(a.programme_id, '') = coalesce(g.programme_id, '')
),
zone_req AS (
    SELECT
        d.site_id                                    AS district_id,
        fr.programme_id,
        to_char((fr.mois_couvert || '-01')::date + interval '1 month', 'YYYY-MM') AS mois_paqd,
        fr.requisition_id,
        EXISTS (
            SELECT 1 FROM dqa.fact_transaction ft
            WHERE ft.site_id = d.site_id
              AND ft.nature = 'distribution'
              AND ft.requisition_id = fr.requisition_id
              AND coalesce(ft.annulation, false) = false
              AND coalesce(ft.date_confirmation, ft.date_saisie) BETWEEN
                  ((fr.mois_couvert || '-01')::date + interval '1 month')::date
              AND ((fr.mois_couvert || '-01')::date + interval '2 months' - interval '1 day')::date
        )                                            AS repondue
    FROM districts d
    JOIN dqa.dim_site sreq
      ON sreq.district = d.district AND sreq.dans_perimetre_dqa
     AND sreq.site_id <> d.site_id
     AND NOT EXISTS (SELECT 1 FROM districts d2 WHERE d2.site_id = sreq.site_id)
    JOIN dqa.fact_requisition fr ON fr.site_id = sreq.site_id
),
p3_distribution AS (
    SELECT
        district_id                                  AS site_id,
        CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
        mois_paqd,
        count(DISTINCT requisition_id) FILTER (WHERE repondue) AS nb_realise,
        count(DISTINCT requisition_id)               AS nb_attendu,
        round(
            count(DISTINCT requisition_id) FILTER (WHERE repondue)::numeric
            / nullif(count(DISTINCT requisition_id), 0) * 100, 1
        )                                            AS taux_regularite_pct,
        true                                         AS est_district
    FROM zone_req
    GROUP BY GROUPING SETS ((district_id, programme_id, mois_paqd), (district_id, mois_paqd))
    HAVING grouping(programme_id) = 1 OR programme_id IS NOT NULL
)
SELECT site_id, programme_id, mois_paqd,
       nb_realise AS nb_jours_avec_sortie, nb_attendu AS nb_jours,
       taux_regularite_pct, est_district
FROM p3_dispensation
UNION ALL
SELECT site_id, programme_id, mois_paqd,
       nb_realise AS nb_jours_avec_sortie, nb_attendu AS nb_jours,
       taux_regularite_pct, est_district
FROM p3_distribution;

CREATE UNIQUE INDEX mv_p3_uq
    ON mv_p3_regularite (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ P5 — concordance (0 % si aucun inventaire dans le mois) ════════════════
CREATE MATERIALIZED VIEW mv_p5_concordance AS
WITH mois_couverts AS (
    SELECT DISTINCT u.mois
    FROM (
        SELECT to_char(fi.date_inventaire, 'YYYY-MM') AS mois
        FROM dqa.fact_inventaire fi WHERE fi.statut = 'fn'
        UNION ALL
        SELECT fr.mois_couvert FROM dqa.fact_requisition fr
        UNION ALL
        SELECT to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM')
        FROM dqa.fact_transaction ft
        WHERE coalesce(ft.annulation, false) = false
          AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
    ) u(mois)
    WHERE u.mois IS NOT NULL
      AND u.mois IN (SELECT mois_paqd FROM dqa.dim_temps)
),
univers AS (
    SELECT s.site_id, mc.mois AS mois_paqd
    FROM dqa.dim_site s
    CROSS JOIN mois_couverts mc
    WHERE s.dans_perimetre_dqa
),
-- (site, mois) où le site a fait au moins un inventaire finalisé : distingue
-- « aucun inventaire » (0 %) de « inventaire sans traceur exploitable »
-- (NON_CALCULABLE).
sites_avec_inv AS (
    SELECT DISTINCT fi.site_id, to_char(fi.date_inventaire, 'YYYY-MM') AS mois_paqd
    FROM dqa.fact_inventaire fi
    JOIN dqa.dim_site s ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    WHERE fi.statut = 'fn'
),
dernier_inv AS (
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
seuil_mois AS (
    SELECT mc.mois AS mois_paqd, max(sc.seuil) AS seuil
    FROM mois_couverts mc
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(mc.mois)
     AND sc.sous_composante = 'concordance'
    GROUP BY mc.mois
),
taux AS (
    SELECT di.site_id, di.programme_id, di.mois_paqd, di.produit_id,
        CASE
            WHEN di.quantite_theorique IS NULL OR di.quantite_comptee IS NULL THEN NULL
            WHEN greatest(abs(di.quantite_theorique), abs(di.quantite_comptee)) = 0 THEN 100.0
            ELSE least(abs(di.quantite_theorique), abs(di.quantite_comptee))
                 / greatest(abs(di.quantite_theorique), abs(di.quantite_comptee)) * 100.0
        END AS taux_pct,
        sm.seuil
    FROM dernier_inv di
    LEFT JOIN seuil_mois sm ON sm.mois_paqd = di.mois_paqd
),
agg AS (
    SELECT
        site_id,
        CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
        mois_paqd,
        round(avg(taux_pct)::numeric, 1)                                        AS taux_concordance_pct,
        count(*) FILTER (WHERE taux_pct IS NOT NULL)::int                       AS nb_produits,
        count(*) FILTER (WHERE taux_pct IS NOT NULL AND taux_pct >= seuil)::int  AS nb_produits_conformes
    FROM taux
    GROUP BY GROUPING SETS ((site_id, programme_id, mois_paqd), (site_id, mois_paqd))
    HAVING grouping(programme_id) = 1 OR programme_id IS NOT NULL
)
-- Grain « tous programmes » : forcé pour chaque (site du périmètre, mois couvert).
-- 0 % si le site n'a AUCUN inventaire finalisé ce mois ; NULL (NON_CALCULABLE)
-- s'il en a fait un mais sans traceur exploitable (agg absent mais inventaire
-- présent), ou avec traceurs sans quantité (agg présent, taux NULL).
SELECT
    u.site_id, NULL::text AS programme_id, u.mois_paqd,
    CASE
        WHEN a.site_id IS NOT NULL THEN a.taux_concordance_pct
        WHEN EXISTS (SELECT 1 FROM sites_avec_inv si
                      WHERE si.site_id = u.site_id AND si.mois_paqd = u.mois_paqd) THEN NULL
        ELSE 0.0
    END                                                                 AS taux_concordance_pct,
    coalesce(a.nb_produits, 0)                                           AS nb_produits,
    coalesce(a.nb_produits_conformes, 0)                                 AS nb_produits_conformes
FROM univers u
LEFT JOIN agg a ON a.site_id = u.site_id AND a.mois_paqd = u.mois_paqd AND a.programme_id IS NULL
UNION ALL
SELECT site_id, programme_id, mois_paqd, taux_concordance_pct, nb_produits, nb_produits_conformes
FROM agg WHERE programme_id IS NOT NULL;

CREATE UNIQUE INDEX mv_p5_uq ON mv_p5_concordance (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ P4 — écart produit : bornes inter-mois, écart distribution district ════
CREATE MATERIALIZED VIEW mv_p4_ecart_produit AS
WITH sites_district AS (
    SELECT site_id FROM dqa.dim_site
    WHERE dans_perimetre_dqa AND dqa.strate_de(type_structure) = 'District'
),
lignes_traceur AS (
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
inv_mois AS (
    SELECT site_id, prog, mois_paqd, produit_id,
        min(date_inventaire) AS premier,
        max(date_inventaire) AS dernier,
        count(DISTINCT date_inventaire) AS nb_inv
    FROM lignes_dim
    GROUP BY site_id, prog, mois_paqd, produit_id
),
bornes AS (
    SELECT
        im.site_id, im.prog, im.mois_paqd, im.produit_id,
        coalesce(
            prev.dernier,
            CASE WHEN im.nb_inv >= 2 THEN im.premier END
        )                                                          AS d_debut,
        im.dernier                                                 AS d_fin
    FROM inv_mois im
    LEFT JOIN inv_mois prev
           ON prev.site_id = im.site_id
          AND prev.prog IS NOT DISTINCT FROM im.prog
          AND prev.produit_id = im.produit_id
          AND prev.mois_paqd = to_char((im.mois_paqd || '-01')::date - interval '1 month', 'YYYY-MM')
),
stock_borne AS (
    SELECT b.*,
        (SELECT sum(ld.comptee) FROM lignes_dim ld
          WHERE ld.site_id = b.site_id AND ld.prog IS NOT DISTINCT FROM b.prog
            AND ld.produit_id = b.produit_id
            AND ld.date_inventaire = b.d_debut)          AS stock_debut,
        (SELECT sum(ld.comptee) FROM lignes_dim ld
          WHERE ld.site_id = b.site_id AND ld.prog IS NOT DISTINCT FROM b.prog
            AND ld.produit_id = b.produit_id
            AND ld.date_inventaire = b.d_fin)            AS stock_fin
    FROM bornes b
    WHERE b.d_debut IS NOT NULL AND b.d_debut < b.d_fin
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
    WHERE ft.nature IN ('reception', 'dispensation', 'distribution')
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
                     AND m.produit_id = sb.produit_id
                     AND m.nature = CASE WHEN sb.site_id IN (SELECT site_id FROM sites_district)
                                         THEN 'distribution' ELSE 'dispensation' END
                     AND m.jour > sb.d_debut AND m.jour <= sb.d_fin), 0) AS declaree
    FROM stock_borne sb
),
detail AS (
    SELECT
        sp.site_id, sp.prog, sp.mois_paqd, sp.produit_id, sp.produit_code, sp.libelle,
        (sp.site_id IN (SELECT site_id FROM sites_district))     AS est_district,
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
        (cp.produit_id IS NOT NULL)                                 AS conso_borne_ok,
        (cp.produit_id IS NOT NULL
         AND (cp.stock_debut + cp.receptions - cp.stock_fin) > 0)   AS conso_evaluable,
        CASE
            WHEN cp.produit_id IS NULL THEN 'aucune_borne'
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
    est_district,
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
    conso_borne_ok,
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

-- ══ P4 — agrégat (univers forcé, SDU/conso 0 % vs NON_CALCULABLE) ══════════
CREATE MATERIALIZED VIEW mv_p4_ecart AS
WITH mois_couverts AS (
    SELECT DISTINCT u.mois
    FROM (
        SELECT to_char(fi.date_inventaire, 'YYYY-MM') AS mois
        FROM dqa.fact_inventaire fi WHERE fi.statut = 'fn'
        UNION ALL
        SELECT fr.mois_couvert FROM dqa.fact_requisition fr
        UNION ALL
        SELECT to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM')
        FROM dqa.fact_transaction ft
        WHERE coalesce(ft.annulation, false) = false
          AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
    ) u(mois)
    WHERE u.mois IS NOT NULL
      AND u.mois IN (SELECT mois_paqd FROM dqa.dim_temps)
),
univers AS (
    SELECT s.site_id, mc.mois AS mois_paqd,
           (dqa.strate_de(s.type_structure) = 'District') AS est_district
    FROM dqa.dim_site s
    CROSS JOIN mois_couverts mc
    WHERE s.dans_perimetre_dqa
),
sites_avec_inv AS (
    SELECT DISTINCT fi.site_id, to_char(fi.date_inventaire, 'YYYY-MM') AS mois_paqd
    FROM dqa.fact_inventaire fi
    JOIN dqa.dim_site s ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    WHERE fi.statut = 'fn'
),
agg AS (
    SELECT
        site_id, programme_id, mois_paqd,
        bool_or(est_district)                                      AS est_district,
        count(*)::int                                             AS nb_produits_sdu,
        (count(*) FILTER (WHERE sdu_conforme))::int               AS nb_conformes_sdu,
        (count(*) FILTER (WHERE conso_evaluable))::int            AS nb_produits_conso,
        (count(*) FILTER (WHERE conso_evaluable AND conso_conforme))::int AS nb_conformes_conso,
        (count(*) FILTER (WHERE conso_borne_ok))::int             AS nb_conso_borne_ok
    FROM dqa.mv_p4_ecart_produit
    GROUP BY site_id, programme_id, mois_paqd
),
seuil AS (
    SELECT
        mc.mois AS mois_paqd,
        max(sc.seuil) FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS seuil_sdu,
        max(sc.seuil) FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS seuil_conso
    FROM mois_couverts mc
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(mc.mois)
     AND sc.sous_composante IN ('ecart_sdu', 'ecart_consommation')
    GROUP BY mc.mois
),
notes AS (
    -- grain « tous programmes » : forcé pour chaque (site du périmètre, mois couvert).
    -- SDU / conso : 0 % si AUCUN inventaire finalisé ce mois ; NULL
    -- (NON_CALCULABLE) si un inventaire existe mais sans traceur exploitable /
    -- sans borne d'ouverture.
    SELECT
        u.site_id, NULL::text AS programme_id, u.mois_paqd, u.est_district,
        coalesce(a.nb_produits_sdu, 0)      AS nb_produits_sdu,
        coalesce(a.nb_conformes_sdu, 0)     AS nb_conformes_sdu,
        coalesce(a.nb_produits_conso, 0)    AS nb_produits_conso,
        coalesce(a.nb_conformes_conso, 0)   AS nb_conformes_conso,
        CASE WHEN coalesce(a.nb_produits_sdu, 0) > 0
             THEN round(a.nb_conformes_sdu::numeric / a.nb_produits_sdu * 100, 1)
             WHEN EXISTS (SELECT 1 FROM sites_avec_inv si
                           WHERE si.site_id = u.site_id AND si.mois_paqd = u.mois_paqd) THEN NULL
             ELSE 0.0 END                   AS taux_sdu_pct,
        -- écart conso : 0 % dès qu'un traceur est inventorié sans borne
        -- d'ouverture exploitable (M-1 sans inventaire ET M avec moins de deux
        -- inventaires), ou qu'aucun inventaire n'existe ce mois. NULL si des
        -- bornes existent mais qu'aucune reconstituée n'est positive (donnée
        -- douteuse), ou si le seul inventaire du mois ne porte aucun traceur.
        CASE WHEN coalesce(a.nb_produits_conso, 0) > 0
             THEN round(a.nb_conformes_conso::numeric / a.nb_produits_conso * 100, 1)
             WHEN coalesce(a.nb_conso_borne_ok, 0) > 0 THEN NULL
             WHEN a.site_id IS NOT NULL THEN 0.0
             WHEN EXISTS (SELECT 1 FROM sites_avec_inv si
                           WHERE si.site_id = u.site_id AND si.mois_paqd = u.mois_paqd) THEN NULL
             ELSE 0.0 END                   AS taux_conso_pct,
        s.seuil_sdu, s.seuil_conso
    FROM univers u
    LEFT JOIN agg a
           ON a.site_id = u.site_id AND a.mois_paqd = u.mois_paqd AND a.programme_id IS NULL
    JOIN seuil s ON s.mois_paqd = u.mois_paqd
    UNION ALL
    -- détail par programme : inchangé (seulement là où le site a rapporté ce programme)
    SELECT
        a.site_id, a.programme_id, a.mois_paqd, a.est_district,
        a.nb_produits_sdu, a.nb_conformes_sdu, a.nb_produits_conso, a.nb_conformes_conso,
        round(a.nb_conformes_sdu::numeric / nullif(a.nb_produits_sdu, 0) * 100, 1),
        CASE WHEN a.nb_produits_conso > 0
             THEN round(a.nb_conformes_conso::numeric / a.nb_produits_conso * 100, 1)
             WHEN a.nb_conso_borne_ok > 0 THEN NULL
             ELSE 0.0 END,
        s.seuil_sdu, s.seuil_conso
    FROM agg a
    JOIN seuil s ON s.mois_paqd = a.mois_paqd
    WHERE a.programme_id IS NOT NULL
)
SELECT
    site_id,
    programme_id,
    mois_paqd,
    est_district,
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

-- ══ mv_score_pilier — reconstruite (identique à 0036, seuil P3 district) ═══
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
    SELECT sc.sous_composante, sc.seuil, sc.seuil_district, sc.sens, m.mois_paqd
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
             WHEN p3.taux_regularite_pct >=
                  (CASE WHEN p3.est_district AND sc3.seuil_district IS NOT NULL
                        THEN sc3.seuil_district ELSE sc3.seuil END) THEN 100.0 ELSE 0.0 END AS p_regularite,
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

-- ══ Rattrapage : reconstruit tous les mois trouvables dans le core ════════
CALL dqa.rafraichir_et_geler(NULL);
