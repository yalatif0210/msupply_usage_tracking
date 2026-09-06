-- ═══════════════════════════════════════════════════════════════════════════
--  Le référentiel des structures administre l'échéance et le régime (ADR 0013).
--
--  `strate_structure` (déjà l'objet de l'écran /admin/strates) portait la seule
--  strate d'affichage. Elle porte désormais aussi, par `type_structure` :
--    - `jour_limite_requisition` : jour de M+1 où la réquisition doit être
--      soumise. Sortait d'un CASE recopié dans mv_p2, une fonction, le
--      repository et quatre migrations.
--    - `est_district` : régime de scoring. Sortait d'une comparaison de chaîne
--      `strate_de(type_structure) = 'District'`.
--
--  Deux fonctions résolveuses lisent la table avec repli ; tout consommateur
--  les appelle. `dim_site.jour_limite_requisition` (override par site) est
--  retiré du contrat d'extraction : le canevas le disait déjà « dérivé du
--  type_structure », il n'a jamais de valeur propre.
--
--  Sur le périmètre réel (ESPC, Hôpital de référence, District sanitaire),
--  aucun score ne bouge : les trois valeurs donnent exactement le comportement
--  des anciens CASE.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

-- ── 1. Colonnes du référentiel ───────────────────────────────────────────
ALTER TABLE dqa.strate_structure
    ADD COLUMN jour_limite_requisition int     NOT NULL DEFAULT 10
        CHECK (jour_limite_requisition BETWEEN 1 AND 28),
    ADD COLUMN est_district            boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN dqa.strate_structure.jour_limite_requisition IS
    'Jour de M+1 (inclus) où la réquisition couvrant M doit être soumise. Repli 10 pour un type non mappé.';
COMMENT ON COLUMN dqa.strate_structure.est_district IS
    'true = régime de scoring district (P3 sur les réquisitions de zone servies, P4 sur les quantités distribuées, ADR 0011). false = site de soins. Repli false.';

-- ── 2. Seed consolidé (ADR 0013) ─────────────────────────────────────────
-- Les paliers sous-type de la migration 0031 ne sont jamais portés par la
-- donnée réelle (name_category3 = le palier, pas le sous-type).
DELETE FROM dqa.strate_structure WHERE type_structure IN ('CSU', 'CSR', 'HG', 'CHR');

INSERT INTO dqa.strate_structure (type_structure, strate, jour_limite_requisition, est_district) VALUES
    ('ESPC',                 'ESPC',                 5,  false),
    ('Hôpital de référence', 'Hôpital de référence', 7,  false),
    ('District sanitaire',   'District',             10, true),
    ('CHU',                  'CHU',                  10, false),
    ('INSTITUT',             'Institut',             10, false)
ON CONFLICT (type_structure) DO UPDATE SET
    strate                  = EXCLUDED.strate,
    jour_limite_requisition = EXCLUDED.jour_limite_requisition,
    est_district            = EXCLUDED.est_district,
    maj_le                  = now();

-- ── 3. Fonctions résolveuses ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS dqa.jour_limite_requisition(text, integer);

CREATE FUNCTION dqa.jour_limite_requisition(p_type_structure text)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
    SELECT coalesce(
        (SELECT jour_limite_requisition FROM dqa.strate_structure
          WHERE type_structure = p_type_structure),
        10
    );
$$;

COMMENT ON FUNCTION dqa.jour_limite_requisition(text) IS
    'Jour de M+1 (inclus) où la réquisition couvrant M doit être soumise : la valeur du référentiel des structures, sinon 10.';

CREATE FUNCTION dqa.est_district(p_type_structure text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT coalesce(
        (SELECT est_district FROM dqa.strate_structure
          WHERE type_structure = p_type_structure),
        false
    );
$$;

COMMENT ON FUNCTION dqa.est_district(text) IS
    'Régime de scoring d''un type de structure : true = district (ADR 0011, ADR 0013), false = site de soins. Repli false pour un type non mappé.';

-- ── 4. mois_est_clos : échéance la plus tardive lue dans le référentiel ───
CREATE OR REPLACE FUNCTION dqa.mois_est_clos(p_mois text, p_reference date DEFAULT CURRENT_DATE)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT p_reference > (
        (p_mois || '-01')::date
        + interval '1 month'
        + ((coalesce((SELECT max(jour_limite_requisition) FROM dqa.strate_structure), 10) - 1)
           || ' days')::interval
    )::date
$$;

COMMENT ON FUNCTION dqa.mois_est_clos IS
    'Vrai une fois dépassée l''échéance de réquisition la plus tardive du référentiel (par défaut le 10 de M+1). Avant cette date, le mois peut encore recevoir des soumissions « à l''heure » : son score gelé reste provisoire.';

-- ── 5. Reconstruction des vues (CASCADE emporte mv_p4_ecart et mv_score_pilier) ──
DROP MATERIALIZED VIEW IF EXISTS mv_p2_promptitude, mv_p3_regularite, mv_p4_ecart_produit CASCADE;

-- ══ P2 — promptitude (identique à 0028, échéance lue dans le référentiel) ═
CREATE MATERIALIZED VIEW mv_p2_promptitude AS
WITH perimetre AS (
    SELECT site_id, type_structure
    FROM dqa.dim_site WHERE dans_perimetre_dqa
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
    ) u
),
statut_prog AS (
    SELECT
        a.site_id, a.mois, m.prog,
        EXISTS (
            SELECT 1 FROM dqa.fact_inventaire fi
            WHERE fi.site_id = a.site_id AND fi.statut = 'fn'
              AND fi.programme_id = m.prog
              AND to_char(fi.date_inventaire, 'YYYY-MM') = a.mois
              AND fi.date_inventaire >= (date_trunc('month', fi.date_inventaire)
                                        + interval '1 month' - interval '3 days')::date
        ) AS inv_ot,
        EXISTS (
            SELECT 1 FROM dqa.fact_requisition fr
            WHERE fr.site_id = a.site_id AND fr.programme_id = m.prog
              AND fr.mois_couvert = a.mois
              AND fr.date_soumission IS NOT NULL
              AND fr.date_soumission <= (
                  (date_trunc('month', (a.mois || '-01')::date) + interval '1 month')::date
                  + (dqa.jour_limite_requisition(p.type_structure) - 1)
              )
        ) AS req_ot
    FROM activite a
    JOIN managed m    ON m.site_id = a.site_id
    JOIN perimetre p  ON p.site_id = a.site_id
),
seuil AS (
    SELECT m.mois, max(sc.seuil) AS seuil
    FROM (SELECT DISTINCT mois FROM activite) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois)
     AND sc.sous_composante = 'promptitude_inventaires'
    GROUP BY m.mois
),
par_prog AS (
    SELECT site_id, mois, prog,
        CASE WHEN inv_ot THEN 100.0 ELSE 0.0 END AS promptitude_inventaires_pct,
        CASE WHEN req_ot THEN 100.0 ELSE 0.0 END AS promptitude_requisitions_pct,
        1                                        AS nb_inventaires_attendu,
        CASE WHEN inv_ot THEN 1 ELSE 0 END       AS nb_inventaires_a_lheure,
        1                                        AS nb_requisitions_attendu,
        CASE WHEN req_ot THEN 1 ELSE 0 END       AS nb_requisitions_a_lheure
    FROM statut_prog
    UNION ALL
    SELECT site_id, mois, NULL::text,
        round(100.0 * count(*) FILTER (WHERE inv_ot) / nullif(count(*), 0), 1),
        round(100.0 * count(*) FILTER (WHERE req_ot) / nullif(count(*), 0), 1),
        count(*)::int,
        count(*) FILTER (WHERE inv_ot)::int,
        count(*)::int,
        count(*) FILTER (WHERE req_ot)::int
    FROM statut_prog
    GROUP BY site_id, mois
)
SELECT
    pp.site_id,
    pp.prog                                          AS programme_id,
    pp.mois                                           AS mois_paqd,
    pp.promptitude_inventaires_pct,
    pp.promptitude_requisitions_pct,
    pp.nb_inventaires_a_lheure,
    pp.nb_inventaires_attendu,
    pp.nb_requisitions_a_lheure,
    pp.nb_requisitions_attendu,
    CASE WHEN pp.promptitude_inventaires_pct  >= s.seuil THEN 100.0 ELSE 0.0 END AS score_inventaires,
    CASE WHEN pp.promptitude_requisitions_pct >= s.seuil THEN 100.0 ELSE 0.0 END AS score_requisitions,
    round((
        (CASE WHEN pp.promptitude_inventaires_pct  >= s.seuil THEN 100.0 ELSE 0.0 END)
      + (CASE WHEN pp.promptitude_requisitions_pct >= s.seuil THEN 100.0 ELSE 0.0 END)
    ) / 2.0, 1)::numeric(5, 1)                        AS p_promptitude
FROM par_prog pp
JOIN seuil s ON s.mois = pp.mois;

CREATE UNIQUE INDEX mv_p2_uq
    ON mv_p2_promptitude (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ P3 — régularité (identique à 0037, régime lu dans le référentiel) ════
CREATE MATERIALIZED VIEW mv_p3_regularite AS
WITH districts AS (
    SELECT s.site_id, s.district
    FROM dqa.dim_site s
    WHERE s.dans_perimetre_dqa AND dqa.est_district(s.type_structure)
),
jours_du_mois AS (
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
    SELECT s.site_id, NULL::text AS programme_id, mc.mois AS mois_paqd
    FROM dqa.dim_site s
    CROSS JOIN mois_couverts mc
    WHERE s.dans_perimetre_dqa
      AND NOT dqa.est_district(s.type_structure)
    UNION
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

-- ══ P4 — écart produit (identique à 0039, régime lu dans le référentiel) ═
CREATE MATERIALIZED VIEW mv_p4_ecart_produit AS
WITH sites_district AS (
    SELECT site_id FROM dqa.dim_site
    WHERE dans_perimetre_dqa AND dqa.est_district(type_structure)
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

-- ══ P4 — agrégat (identique à 0039, régime lu dans le référentiel) ═══════
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
             ELSE 0.0 END                   AS taux_sdu_pct,
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

-- ══ mv_score_pilier — recréée à l'identique de 0039 (tombée par CASCADE) ═
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

-- ── 6. Retrait de l'override par site (ADR 0013, contrat d'extraction) ────
ALTER TABLE dqa.dim_site  DROP COLUMN jour_limite_requisition;
ALTER TABLE dqa.stg_sites DROP COLUMN jour_limite_requisition;

-- ── 7. Rattrapage : reconstruit tous les mois trouvables dans le core ────
CALL dqa.rafraichir_et_geler(NULL);
