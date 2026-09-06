-- ═══════════════════════════════════════════════════════════════════════════
--  Performance — mv_p4_ecart_produit sans sous-requêtes corrélées.
--
--  La version de la migration 0037 reconstruisait les bornes inter-mois avec
--  quatre sous-requêtes corrélées (deux dans `stock_borne` sur `lignes_dim`,
--  deux dans `conso_produit` sur `mouvements_dim`). PostgreSQL inline les CTE
--  à référence unique : chaque sous-requête corrélée réexécutait alors le CTE
--  entier, une fois par ligne (site, produit, mois). Sur le volume réel
--  (40 sites, ~5 mois) le REFRESH passait de quelques millisecondes à ~90 s,
--  et `rafraichir_et_geler` — qui reconstruit tous les mois — devenait
--  inutilisable à l'import.
--
--  Réécriture à iso-résultat :
--    - `stock_borne` : deux LEFT JOIN sur `lignes_dim` (borne d'ouverture /
--      de clôture) au lieu des deux sous-requêtes ;
--    - `conso_produit` : un LEFT JOIN sur `mouvements_dim` dans la fenêtre
--      ]d_debut, d_fin], puis des agrégats `FILTER` (réceptions d'un côté,
--      dispensations OU distributions selon `est_district` de l'autre) ;
--    - `est_district` est porté depuis `bornes` (plus de `IN (SELECT …)`
--      corrélé dans le WHERE de l'agrégat) ;
--    - `lignes_traceur` et `mouvements` sont matérialisés (`AS MATERIALIZED`)
--      pour être scannés une seule fois par leurs deux consommateurs (grain
--      programme + grain « tous programmes »).
--
--  `mv_p4_ecart` et `mv_score_pilier` sont recréés à l'identique de la
--  migration 0037 (dépendances de `mv_p4_ecart_produit`, tombées par CASCADE).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_p4_ecart_produit CASCADE;

-- ══ P4 — écart produit : bornes inter-mois, écart distribution district ════
CREATE MATERIALIZED VIEW mv_p4_ecart_produit AS
WITH sites_district AS (
    SELECT site_id FROM dqa.dim_site
    WHERE dans_perimetre_dqa AND dqa.strate_de(type_structure) = 'District'
),
lignes_traceur AS MATERIALIZED (
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
        (im.site_id IN (SELECT site_id FROM sites_district))        AS est_district,
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
    SELECT
        b.site_id, b.prog, b.mois_paqd, b.produit_id, b.est_district,
        b.d_debut, b.d_fin,
        ld_deb.comptee AS stock_debut,
        ld_fin.comptee AS stock_fin
    FROM bornes b
    LEFT JOIN lignes_dim ld_deb
           ON ld_deb.site_id = b.site_id
          AND ld_deb.prog IS NOT DISTINCT FROM b.prog
          AND ld_deb.produit_id = b.produit_id
          AND ld_deb.date_inventaire = b.d_debut
    LEFT JOIN lignes_dim ld_fin
           ON ld_fin.site_id = b.site_id
          AND ld_fin.prog IS NOT DISTINCT FROM b.prog
          AND ld_fin.produit_id = b.produit_id
          AND ld_fin.date_inventaire = b.d_fin
    WHERE b.d_debut IS NOT NULL AND b.d_debut < b.d_fin
),
mouvements AS MATERIALIZED (
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
        coalesce(sum(m.q) FILTER (WHERE m.nature = 'reception'), 0) AS receptions,
        coalesce(sum(m.q) FILTER (
            WHERE m.nature = CASE WHEN sb.est_district THEN 'distribution' ELSE 'dispensation' END
        ), 0)                                                      AS declaree
    FROM stock_borne sb
    LEFT JOIN mouvements_dim m
           ON m.site_id = sb.site_id
          AND m.prog IS NOT DISTINCT FROM sb.prog
          AND m.produit_id = sb.produit_id
          AND m.jour > sb.d_debut
          AND m.jour <= sb.d_fin
    GROUP BY sb.site_id, sb.prog, sb.mois_paqd, sb.produit_id,
             sb.stock_debut, sb.stock_fin
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

-- ══ P4 — agrégat (identique à 0037, tombé par CASCADE) ════════════════════
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

-- ══ mv_score_pilier — recréée à l'identique de 0037 (tombée par CASCADE) ═══
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
