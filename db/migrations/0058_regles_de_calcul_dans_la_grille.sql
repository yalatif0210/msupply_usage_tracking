-- ═══════════════════════════════════════════════════════════════════════════
--  Valeurs des règles de calcul dans la grille datée (ticket 03,
--  .scratch/cloture-mois-et-composition-piliers).
--
--  `grille_parametre` porte désormais :
--    - la fenêtre de clôture des inventaires (ADR 0022) : nombre de derniers
--      jours du mois (3) et de premiers jours du mois suivant (1) ;
--    - la note de sanction (0) donnée à une sous-composante P4 / P5 sanctionnée ;
--    - les bornes de classification du composite (90, 75).
--  Valeurs par défaut = règles en vigueur : aucun score ne change.
--
--  La fenêtre de clôture d'un mois suit la grille de ce mois. La sanction se
--  reconnaît dans les vues P4 / P5 (aucun produit évalué, taux imposé à 0) :
--  `mv_score_pilier` lui donne la note de la grille.
--
--  Vues recréées : P4 par produit, P4, P5 (définitions 0056) calculent le mois
--  de clôture une fois par inventaire et la liste des clôtures une fois par
--  vue, la fenêtre lisant désormais la grille ; `mv_score_pilier` (définition
--  0057, sanction et classification lues dans la grille).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

ALTER TABLE grille_parametre
    ADD COLUMN jours_cloture_fin_mois       integer      NOT NULL DEFAULT 3
        CHECK (jours_cloture_fin_mois BETWEEN 1 AND 10),
    ADD COLUMN jours_cloture_mois_suivant   integer      NOT NULL DEFAULT 1
        CHECK (jours_cloture_mois_suivant BETWEEN 0 AND 10),
    ADD COLUMN note_sanction                numeric(5, 1) NOT NULL DEFAULT 0
        CHECK (note_sanction BETWEEN 0 AND 100),
    ADD COLUMN borne_conforme               numeric(5, 1) NOT NULL DEFAULT 90,
    ADD COLUMN borne_partiellement_conforme numeric(5, 1) NOT NULL DEFAULT 75,
    ADD CONSTRAINT grille_bornes_classification_ck
        CHECK (0 < borne_partiellement_conforme AND borne_partiellement_conforme < borne_conforme
               AND borne_conforme <= 100);

COMMENT ON COLUMN grille_parametre.jours_cloture_fin_mois IS
    'Fenêtre de clôture (ADR 0022) : un inventaire des N derniers jours du mois le clôture.';
COMMENT ON COLUMN grille_parametre.jours_cloture_mois_suivant IS
    'Fenêtre de clôture (ADR 0022) : un inventaire des N premiers jours du mois suivant clôture le mois.';
COMMENT ON COLUMN grille_parametre.note_sanction IS
    'Note d''une sous-composante P4 / P5 sanctionnée (pas d''inventaire de clôture ou d''ouverture).';

-- Paramètre d'un mois, avec repli sur la valeur par défaut d'un mois sans grille.
CREATE FUNCTION dqa.jours_cloture_fin_mois(p_mois text)
RETURNS integer LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT jours_cloture_fin_mois FROM dqa.grille_parametre
                      WHERE id = dqa.grille_pour_mois(p_mois)), 3)
$$;

CREATE FUNCTION dqa.jours_cloture_mois_suivant(p_mois text)
RETURNS integer LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT jours_cloture_mois_suivant FROM dqa.grille_parametre
                      WHERE id = dqa.grille_pour_mois(p_mois)), 1)
$$;

CREATE FUNCTION dqa.note_sanction(p_mois text)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT note_sanction FROM dqa.grille_parametre
                      WHERE id = dqa.grille_pour_mois(p_mois)), 0)
$$;

-- Fenêtre de clôture du mois : du premier au dernier jour inclus.
CREATE FUNCTION dqa.fenetre_cloture(p_mois text, OUT debut date, OUT fin date)
LANGUAGE sql STABLE AS $$
    SELECT ((p_mois || '-01')::date + interval '1 month')::date - dqa.jours_cloture_fin_mois(p_mois),
           ((p_mois || '-01')::date + interval '1 month')::date + dqa.jours_cloture_mois_suivant(p_mois) - 1
$$;

-- Mois clôturé par un inventaire, ou NULL hors fenêtre de clôture. Deux
-- lectures de grille seulement : appelée pour chaque inventaire.
CREATE OR REPLACE FUNCTION dqa.mois_cloture_inventaire(p_date date)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN extract(day FROM p_date) <= dqa.jours_cloture_mois_suivant(to_char(p_date - interval '1 month', 'YYYY-MM'))
            THEN to_char(p_date - interval '1 month', 'YYYY-MM')
        WHEN p_date >= (date_trunc('month', p_date) + interval '1 month')::date
                       - dqa.jours_cloture_fin_mois(to_char(p_date, 'YYYY-MM'))
            THEN to_char(p_date, 'YYYY-MM')
    END
$$;

-- Même liste qu'en 0056, le mois de clôture calculé une fois par inventaire.
CREATE OR REPLACE VIEW dqa.v_cloture_inventaire AS
WITH ic AS MATERIALIZED (
    SELECT fi.site_id, fi.programme_id, dqa.mois_cloture_inventaire(fi.date_inventaire) AS mois_paqd
    FROM dqa.fact_inventaire fi
    JOIN dqa.dim_site s ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    WHERE fi.statut = 'fn'
)
SELECT DISTINCT site_id, programme_id, mois_paqd
FROM ic WHERE programme_id IS NOT NULL AND mois_paqd IS NOT NULL
UNION
SELECT DISTINCT site_id, NULL, mois_paqd
FROM ic WHERE mois_paqd IS NOT NULL;

CREATE OR REPLACE FUNCTION dqa.mois_juge_p4_p5(p_mois text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT dqa.date_debut_donnees() <= f.debut AND dqa.date_fin_donnees() >= f.fin
    FROM dqa.fenetre_cloture(p_mois) f
$$;

CREATE FUNCTION dqa.classer_composite(p_score numeric, p_grille_id bigint)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN p_score IS NULL THEN NULL
        WHEN p_score >= coalesce(g.borne_conforme, 90) THEN 'CONFORME'
        WHEN p_score >= coalesce(g.borne_partiellement_conforme, 75) THEN 'PARTIELLEMENT_CONFORME'
        ELSE 'NON_CONFORME'
    END
    FROM (SELECT 1) x
    LEFT JOIN dqa.grille_parametre g ON g.id = p_grille_id
$$;

DROP MATERIALIZED VIEW mv_p4_ecart_produit CASCADE;

-- ══ P4 par produit (définition 0056, clôture calculée une fois) ══════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW mv_p4_ecart_produit AS
WITH sites_district AS (
    SELECT site_id FROM dqa.dim_site
    WHERE dans_perimetre_dqa AND dqa.est_district(type_structure)
),
-- Mois de clôture calculé une fois par inventaire (la fenêtre lit la grille).
inv_cloture AS MATERIALIZED (
    SELECT fi.inventaire_id, dqa.mois_cloture_inventaire(fi.date_inventaire) AS mois_cloture
    FROM dqa.fact_inventaire fi
    WHERE fi.statut = 'fn'
),
clotures AS MATERIALIZED (
    SELECT site_id, programme_id, mois_paqd FROM dqa.v_cloture_inventaire
),
lignes_traceur AS MATERIALIZED (
    SELECT
        fi.site_id,
        fi.programme_id,
        fi.inventaire_id,
        fi.heure_inventaire,
        fi.numero_inventaire,
        fi.date_inventaire,
        ic.mois_cloture                               AS mois_paqd,
        p.produit_id,
        p.produit_code,
        tr.libelle                                    AS libelle,
        sum(fil.quantite_theorique)                   AS theorique,
        sum(fil.quantite_comptee)                     AS comptee
    FROM dqa.fact_inventaire fi
    JOIN inv_cloture ic            ON ic.inventaire_id = fi.inventaire_id AND ic.mois_cloture IS NOT NULL
    JOIN dqa.dim_site s            ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
    JOIN dqa.dim_produit p         ON p.produit_id = fil.produit_id
    JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
    WHERE fi.statut = 'fn'
    GROUP BY fi.site_id, fi.programme_id, fi.inventaire_id, fi.heure_inventaire,
             fi.numero_inventaire, fi.date_inventaire, ic.mois_cloture,
             p.produit_id, p.produit_code, tr.libelle
),
-- Un seul inventaire par (site, jour, produit) : le dernier finalisé (heure,
-- puis numéro mSupply). Par programme, le dernier de ce programme ; tous
-- programmes, le dernier tous programmes confondus (même stock physique).
-- Un inventaire sans programme ne compte que dans « tous programmes ».
lignes_dim AS (
    SELECT site_id, prog, mois_paqd, date_inventaire, inventaire_id,
           produit_id, produit_code, libelle, theorique, comptee
    FROM (
        SELECT site_id, programme_id AS prog, mois_paqd, date_inventaire, inventaire_id,
               produit_id, produit_code, libelle, theorique, comptee,
               row_number() OVER (
                   PARTITION BY site_id, programme_id, date_inventaire, produit_id
                   ORDER BY heure_inventaire DESC NULLS LAST,
                            numero_inventaire DESC NULLS LAST, inventaire_id DESC) AS rang
        FROM lignes_traceur
        WHERE programme_id IS NOT NULL
        UNION ALL
        SELECT site_id, NULL, mois_paqd, date_inventaire, inventaire_id,
               produit_id, produit_code, libelle, theorique, comptee,
               row_number() OVER (
                   PARTITION BY site_id, date_inventaire, produit_id
                   ORDER BY heure_inventaire DESC NULLS LAST,
                            numero_inventaire DESC NULLS LAST, inventaire_id DESC)
        FROM lignes_traceur
    ) classes
    WHERE rang = 1
),
tol_mois AS (
    SELECT
        m.mois_paqd,
        max(sc.tolerance) FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS tol_sdu,
        max(sc.tolerance) FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS tol_conso,
        max(sc.seuil)     FILTER (WHERE sc.sous_composante = 'concordance')        AS seuil_concordance,
        max(sc.sens)      FILTER (WHERE sc.sous_composante = 'concordance')        AS sens_concordance
    FROM (SELECT DISTINCT mois_paqd FROM lignes_traceur) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
     AND sc.sous_composante IN ('ecart_sdu', 'ecart_consommation', 'concordance')
    GROUP BY m.mois_paqd
),
sdu_produit AS (
    SELECT DISTINCT ON (site_id, prog, mois_paqd, produit_id)
        site_id, prog, mois_paqd, produit_id, produit_code, libelle,
        date_inventaire, inventaire_id,
        theorique                AS theorique_brut,
        comptee                  AS comptee_brut,
        coalesce(theorique, 0)   AS theorique,
        coalesce(comptee, 0)     AS comptee
    FROM lignes_dim
    ORDER BY site_id, prog, mois_paqd, produit_id, date_inventaire DESC
),
-- Ouverture = clôture retenue du mois précédent, pour ce produit.
inv_mois AS (
    SELECT site_id, prog, mois_paqd, produit_id,
        max(date_inventaire) AS dernier
    FROM lignes_dim
    GROUP BY site_id, prog, mois_paqd, produit_id
),
bornes AS (
    SELECT
        im.site_id, im.prog, im.mois_paqd, im.produit_id,
        (im.site_id IN (SELECT site_id FROM sites_district))        AS est_district,
        prev.dernier                                               AS d_debut,
        im.dernier                                                 AS d_fin
    FROM inv_mois im
    LEFT JOIN inv_mois prev
           ON prev.site_id = im.site_id
          AND prev.prog IS NOT DISTINCT FROM im.prog
          AND prev.produit_id = im.produit_id
          AND prev.mois_paqd = dqa.mois_precedent(im.mois_paqd)
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
-- Entrées de stock = factures `si` réceptionnées (`fn`), datées de leur
-- finalisation, hors lignes d'ajustement ; sorties = dispensations ou
-- distributions finalisées (ADR 0018). `rc` (encaissement) n'a pas de produit.
mouvements AS MATERIALIZED (
    SELECT
        ft.site_id,
        ft.programme_id                                  AS prog,
        l.produit_id,
        CASE WHEN ft.nature = 'facture_fournisseur'
             THEN dqa.date_reception_facture(ft.date_finalisation, ft.date_confirmation, ft.date_saisie)
             ELSE coalesce(ft.date_confirmation, ft.date_saisie)
        END                                              AS jour,
        ft.nature,
        sum(l.quantite_unitaire)                         AS q
    FROM dqa.fact_transaction ft
    JOIN dqa.fact_ligne_transaction l ON l.transaction_id = ft.transaction_id
    JOIN dqa.dim_produit p            ON p.produit_id = l.produit_id
    JOIN dqa.dim_produit_traceur tr   ON tr.produit_code = p.produit_code AND tr.actif
    JOIN dqa.dim_site s               ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
    WHERE ft.nature IN ('facture_fournisseur', 'dispensation', 'distribution')
      AND ft.statut = 'fn'
      AND coalesce(ft.annulation, false) = false
      AND NOT (ft.nature = 'facture_fournisseur' AND coalesce(l.issu_ajustement, false))
      AND coalesce(ft.date_finalisation, ft.date_confirmation, ft.date_saisie) IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5
),
-- Un mouvement sans programme ne compte que dans « tous programmes ».
mouvements_dim AS (
    SELECT site_id, prog, produit_id, jour, nature, q FROM mouvements WHERE prog IS NOT NULL
    UNION ALL
    SELECT site_id, NULL, produit_id, jour, nature, q FROM mouvements
),
conso_produit AS (
    SELECT
        sb.site_id, sb.prog, sb.mois_paqd, sb.produit_id, sb.d_debut, sb.d_fin,
        coalesce(sb.stock_debut, 0)  AS stock_debut,
        coalesce(sb.stock_fin, 0)    AS stock_fin,
        coalesce(sum(m.q) FILTER (WHERE m.nature = 'facture_fournisseur'), 0) AS receptions,
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
    GROUP BY sb.site_id, sb.prog, sb.mois_paqd, sb.produit_id, sb.d_debut, sb.d_fin,
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
        t.seuil_concordance, t.sens_concordance,
        cp.stock_debut, cp.stock_fin, cp.receptions, cp.declaree,
        CASE WHEN cp.produit_id IS NOT NULL
             THEN cp.stock_debut + cp.receptions - cp.stock_fin END AS reconstituee,
        (cp.produit_id IS NOT NULL)                                 AS conso_borne_ok,
        (cp.produit_id IS NOT NULL
         AND (cp.stock_debut + cp.receptions - cp.stock_fin) > 0)   AS conso_evaluable,
        CASE
            WHEN cp.produit_id IS NULL AND EXISTS (
                SELECT 1 FROM clotures vc
                WHERE vc.site_id = sp.site_id AND vc.programme_id IS NOT DISTINCT FROM sp.prog
                  AND vc.mois_paqd = dqa.mois_precedent(sp.mois_paqd))
                THEN 'absent_ouverture'
            WHEN cp.produit_id IS NULL THEN 'sans_ouverture'
            WHEN (cp.stock_debut + cp.receptions - cp.stock_fin) <= 0 THEN 'reconstituee_non_positive'
        END                                                        AS conso_raison_exclusion,
        t.tol_conso,
        sp.date_inventaire, sp.inventaire_id, cp.d_debut, cp.d_fin
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
    coalesce(dqa.seuil_atteint(concordance_pct, seuil_concordance, sens_concordance), false) AS concordance_conforme,
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
    END                                                        AS conso_conforme,
    -- Lecture de l'écran (0052) : inventaire retenu, ses lots, bornes de la consommation.
    date_inventaire,
    inventaire_id,
    (SELECT jsonb_agg(jsonb_build_object(
                'lot', fil.lot,
                'theorique', fil.quantite_theorique,
                'comptee', fil.quantite_comptee) ORDER BY fil.lot)
     FROM dqa.fact_inventaire_ligne fil
     WHERE fil.inventaire_id = detail.inventaire_id
       AND fil.produit_id = detail.produit_id)                 AS lots,
    d_debut                                                    AS date_debut,
    d_fin                                                      AS date_fin
FROM detail;

CREATE UNIQUE INDEX mv_p4_ecart_produit_uq
    ON mv_p4_ecart_produit (site_id, mois_paqd, coalesce(programme_id, ''), produit_id);

-- ══ P4 agrégat ═══════════════════════════════════════════════════════════
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
        WHERE ft.statut = 'fn' AND coalesce(ft.annulation, false) = false
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
clotures AS MATERIALIZED (
    SELECT site_id, programme_id, mois_paqd FROM dqa.v_cloture_inventaire
),
-- Clôture et ouverture par site, programme (NULL = tous) et mois (ADR 0022).
bornes_mois AS (
    SELECT c.site_id, c.programme_id, c.mois_paqd,
           EXISTS (SELECT 1 FROM clotures o
                    WHERE o.site_id = c.site_id
                      AND o.programme_id IS NOT DISTINCT FROM c.programme_id
                      AND o.mois_paqd = dqa.mois_precedent(c.mois_paqd))
               AS a_ouverture
    FROM clotures c
),
-- Un code produit compte une fois, même porté par plusieurs articles
-- mSupply : conforme seulement si tous ses articles le sont (ADR 0016).
par_code AS (
    SELECT
        site_id, programme_id, mois_paqd, produit_code,
        bool_or(est_district)                                      AS est_district,
        bool_and(sdu_conforme)                                     AS sdu_conforme,
        bool_or(conso_evaluable)                                   AS conso_evaluable,
        coalesce(bool_and(conso_conforme) FILTER (WHERE conso_evaluable), false) AS conso_conforme,
        bool_or(conso_borne_ok)                                    AS conso_borne_ok
    FROM dqa.mv_p4_ecart_produit
    GROUP BY site_id, programme_id, mois_paqd, produit_code
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
    FROM par_code
    GROUP BY site_id, programme_id, mois_paqd
),
notes AS (
    SELECT
        u.site_id, NULL::text AS programme_id, u.mois_paqd, u.est_district,
        coalesce(a.nb_produits_sdu, 0)      AS nb_produits_sdu,
        coalesce(a.nb_conformes_sdu, 0)     AS nb_conformes_sdu,
        coalesce(a.nb_produits_conso, 0)    AS nb_produits_conso,
        coalesce(a.nb_conformes_conso, 0)   AS nb_conformes_conso,
        -- sans clôture : 0 % une fois le mois jugé, sinon pas encore dû
        CASE WHEN coalesce(a.nb_produits_sdu, 0) > 0
             THEN round(a.nb_conformes_sdu::numeric / a.nb_produits_sdu * 100, 1)
             WHEN bm.site_id IS NOT NULL THEN NULL
             WHEN dqa.mois_juge_p4_p5(u.mois_paqd) THEN 0.0
             ELSE NULL END                  AS taux_sdu_pct,
        -- sans clôture, ou sans ouverture alors que le mois précédent est
        -- jugé : 0 % une fois le mois jugé ; avec les deux mais aucun produit
        -- évaluable : non calculable
        CASE WHEN coalesce(a.nb_produits_conso, 0) > 0
             THEN round(a.nb_conformes_conso::numeric / a.nb_produits_conso * 100, 1)
             WHEN coalesce(bm.a_ouverture, false) THEN NULL
             WHEN dqa.mois_juge_p4_p5(u.mois_paqd)
              AND (bm.site_id IS NULL OR dqa.mois_juge_p4_p5(dqa.mois_precedent(u.mois_paqd))) THEN 0.0
             ELSE NULL END                  AS taux_conso_pct
    FROM univers u
    LEFT JOIN agg a
           ON a.site_id = u.site_id AND a.mois_paqd = u.mois_paqd AND a.programme_id IS NULL
    LEFT JOIN bornes_mois bm
           ON bm.site_id = u.site_id AND bm.mois_paqd = u.mois_paqd AND bm.programme_id IS NULL
    UNION ALL
    SELECT
        a.site_id, a.programme_id, a.mois_paqd, a.est_district,
        a.nb_produits_sdu, a.nb_conformes_sdu, a.nb_produits_conso, a.nb_conformes_conso,
        round(a.nb_conformes_sdu::numeric / nullif(a.nb_produits_sdu, 0) * 100, 1),
        CASE WHEN a.nb_produits_conso > 0
             THEN round(a.nb_conformes_conso::numeric / a.nb_produits_conso * 100, 1)
             WHEN coalesce(bm.a_ouverture, false) THEN NULL
             WHEN dqa.mois_juge_p4_p5(a.mois_paqd)
              AND dqa.mois_juge_p4_p5(dqa.mois_precedent(a.mois_paqd)) THEN 0.0
             ELSE NULL END
    FROM agg a
    LEFT JOIN bornes_mois bm
           ON bm.site_id = a.site_id AND bm.programme_id = a.programme_id AND bm.mois_paqd = a.mois_paqd
    WHERE a.programme_id IS NOT NULL
),
scores AS (
    SELECT n.*,
           dqa.note_sous_composante(n.taux_sdu_pct, 'ecart_sdu', n.mois_paqd)            AS score_sdu,
           dqa.note_sous_composante(n.taux_conso_pct, 'ecart_consommation', n.mois_paqd) AS score_conso
    FROM notes n
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
    score_sdu,
    score_conso,
    (SELECT round(avg(v.s), 1)::numeric(5, 1)
     FROM (VALUES (score_sdu), (score_conso)) AS v(s)
     WHERE v.s IS NOT NULL)                                    AS p_ecart_sdu
FROM scores;

CREATE UNIQUE INDEX mv_p4_uq
    ON mv_p4_ecart (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ P5 concordance ═══════════════════════════════════════════════════════
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
        WHERE ft.statut = 'fn' AND coalesce(ft.annulation, false) = false
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
clotures AS MATERIALIZED (
    SELECT site_id, mois_paqd FROM dqa.v_cloture_inventaire WHERE programme_id IS NULL
),
seuil_mois AS (
    SELECT mc.mois AS mois_paqd, max(sc.seuil) AS seuil, max(sc.sens) AS sens
    FROM mois_couverts mc
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(mc.mois)
     AND sc.sous_composante = 'concordance'
    GROUP BY mc.mois
),
-- Même inventaire retenu et mêmes lots sommés que P4 (mv_p4_ecart_produit) ;
-- taux recalculé sans arrondi pour ne pas déclarer concordant un 99,96 %.
-- Un code produit compte une fois : son article le moins concordant (ADR 0016).
par_code AS (
    SELECT
        ep.site_id, ep.programme_id, ep.mois_paqd, ep.produit_code,
        min(CASE
                WHEN greatest(abs(ep.theorique), abs(ep.comptee)) = 0 THEN 100.0
                ELSE least(abs(ep.theorique), abs(ep.comptee))
                     / greatest(abs(ep.theorique), abs(ep.comptee)) * 100.0
            END) AS taux_pct
    FROM dqa.mv_p4_ecart_produit ep
    WHERE ep.concordance_pct IS NOT NULL
    GROUP BY ep.site_id, ep.programme_id, ep.mois_paqd, ep.produit_code
),
agg AS (
    SELECT
        pc.site_id, pc.programme_id, pc.mois_paqd,
        round(avg(pc.taux_pct)::numeric, 1)                     AS taux_concordance_pct,
        count(*)::int                                           AS nb_produits,
        (count(*) FILTER (WHERE dqa.seuil_atteint(pc.taux_pct, sm.seuil, sm.sens)))::int AS nb_produits_conformes
    FROM par_code pc
    LEFT JOIN seuil_mois sm ON sm.mois_paqd = pc.mois_paqd
    GROUP BY pc.site_id, pc.programme_id, pc.mois_paqd
)
SELECT
    u.site_id, NULL::text AS programme_id, u.mois_paqd,
    CASE
        WHEN a.site_id IS NOT NULL THEN a.taux_concordance_pct
        WHEN EXISTS (SELECT 1 FROM clotures vc
                      WHERE vc.site_id = u.site_id AND vc.mois_paqd = u.mois_paqd) THEN NULL
        -- aucune clôture : 0 % une fois le mois jugé, sinon pas encore dû
        WHEN dqa.mois_juge_p4_p5(u.mois_paqd) THEN 0.0
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


-- ══ Score composite (définition 0057, sanction et bornes de la grille) ══
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
    dqa.classer_composite(c.score_composite, b.grille_id) AS classification
FROM base b
LEFT JOIN composite c ON c.site_id = b.site_id AND c.mois_paqd = b.mois_paqd
      AND coalesce(c.programme_id, '') = coalesce(b.programme_id, '');

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));


COMMENT ON COLUMN mv_p4_ecart.p_ecart_sdu IS
    'Moyenne simple des deux sous-composantes, sans usage pour le score : le score P4 est mv_score_pilier.p_ecart_sdu (migration 0057).';
