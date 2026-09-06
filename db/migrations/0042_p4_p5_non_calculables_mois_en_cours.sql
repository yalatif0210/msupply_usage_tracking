-- ═══════════════════════════════════════════════════════════════════════════
--  P4 (écart SDU + écart consommation) et P5 (concordance) : NON_CALCULABLE
--  pour un mois EN COURS sans inventaire, 0 % seulement une fois le mois clos
--  (amendement de l'ADR 0012 §3 — voir ADR 0014).
--
--  L'ADR 0012 forçait ces sous-composantes à 0 % dès qu'un site n'avait aucun
--  inventaire finalisé daté dans le mois. Mais l'inventaire de fin de mois
--  n'est PAS dû tant que le mois n'est pas clos : le noter 0 % pénalise un
--  site pour une échéance non arrivée, et c'est incohérent avec P1/P2 (déjà
--  NON_CALCULABLE dans ce cas).
--
--  Nouvelle règle, alignée sur `dqa.mois_est_clos` (le même proxy que P2) :
--    - mois clos, aucun inventaire      -> 0 % (le silence est un signal) ;
--    - mois EN COURS, aucun inventaire  -> NULL (NON_CALCULABLE, pas dû).
--  Un site qui inventorie tôt dans le mois reste évalué (il y a de la donnée).
--
--  Écart consommation : idem via sa borne de clôture (dernier inventaire du
--  mois). Sans inventaire du mois et mois en cours -> NON_CALCULABLE.
--
--  P4 a deux sous-composantes : si l'écart SDU tombe NON_CALCULABLE mais que
--  l'écart consommation reste évaluable (inventaire précoce), le score du
--  pilier est celui de la seule sous-composante calculable (règle inchangée).
--  P5 n'a qu'une sous-composante : elle tombe NON_CALCULABLE -> P5 aussi.
--
--  `mv_score_pilier` : aucune logique nouvelle, la renormalisation exclut déjà
--  un pilier NULL. Recréée à l'identique de 0040 (tombée par CASCADE).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_p4_ecart, mv_p5_concordance CASCADE;

-- ══ P4 — agrégat (0 % -> NULL pour un mois en cours sans inventaire) ══════
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
           dqa.est_district(s.type_structure) AS est_district
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
             -- aucun inventaire : 0 % si le mois est clos, sinon pas encore dû
             WHEN dqa.mois_est_clos(u.mois_paqd) THEN 0.0
             ELSE NULL END                  AS taux_sdu_pct,
        CASE WHEN coalesce(a.nb_produits_conso, 0) > 0
             THEN round(a.nb_conformes_conso::numeric / a.nb_produits_conso * 100, 1)
             WHEN coalesce(a.nb_conso_borne_ok, 0) > 0 THEN NULL
             WHEN a.site_id IS NOT NULL THEN 0.0
             WHEN EXISTS (SELECT 1 FROM sites_avec_inv si
                           WHERE si.site_id = u.site_id AND si.mois_paqd = u.mois_paqd) THEN NULL
             WHEN dqa.mois_est_clos(u.mois_paqd) THEN 0.0
             ELSE NULL END                  AS taux_conso_pct,
        s.seuil_sdu, s.seuil_conso
    FROM univers u
    LEFT JOIN agg a
           ON a.site_id = u.site_id AND a.mois_paqd = u.mois_paqd AND a.programme_id IS NULL
    JOIN seuil s ON s.mois_paqd = u.mois_paqd
    UNION ALL
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

-- ══ P5 — concordance (0 % -> NULL pour un mois en cours sans inventaire) ══
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
SELECT
    u.site_id, NULL::text AS programme_id, u.mois_paqd,
    CASE
        WHEN a.site_id IS NOT NULL THEN a.taux_concordance_pct
        WHEN EXISTS (SELECT 1 FROM sites_avec_inv si
                      WHERE si.site_id = u.site_id AND si.mois_paqd = u.mois_paqd) THEN NULL
        -- aucun inventaire : 0 % si le mois est clos, sinon pas encore dû
        WHEN dqa.mois_est_clos(u.mois_paqd) THEN 0.0
        ELSE NULL
    END                                                                 AS taux_concordance_pct,
    coalesce(a.nb_produits, 0)                                           AS nb_produits,
    coalesce(a.nb_produits_conformes, 0)                                 AS nb_produits_conformes
FROM univers u
LEFT JOIN agg a ON a.site_id = u.site_id AND a.mois_paqd = u.mois_paqd AND a.programme_id IS NULL
UNION ALL
SELECT site_id, programme_id, mois_paqd, taux_concordance_pct, nb_produits, nb_produits_conformes
FROM agg WHERE programme_id IS NOT NULL;

CREATE UNIQUE INDEX mv_p5_uq ON mv_p5_concordance (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ mv_score_pilier — recréée à l'identique de 0040 (tombée par CASCADE) ══
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

-- ── Rattrapage : reconstruit tous les mois trouvables dans le core ───────
CALL dqa.rafraichir_et_geler(NULL);
