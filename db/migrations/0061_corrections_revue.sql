-- ═══════════════════════════════════════════════════════════════════════════
--  Corrections de la revue de code de la série « clôture de mois et
--  composition des piliers » (décisions du 2026-11-04).
--
--  1. Sanction au grain programme : un programme géré par le site
--     (dim_site_programme actif) sans inventaire de clôture prend 0 sur P4 et
--     P5 une fois le mois jugé, comme le site (il n'avait pas de ligne : non
--     calculable, alors qu'un programme sans ouverture prenait 0).
--  2. Dénominateur de la conformité consommation : tout produit présent aux
--     deux inventaires ; une consommation reconstituée ≤ 0 (hausse de stock
--     sans réception enregistrée) compte non conforme au lieu d'être écartée.
--  3. Un code inventorié sous un autre article à l'ouverture : raison
--     `autre_article_ouverture` au lieu de `absent_ouverture` (le produit
--     n'est pas absent au sens de la liste des produits écartés, par code).
--  4. Mois jugé : chaque jour de la fenêtre de clôture doit être couvert par
--     la fenêtre d'un import validé (un trou entre deux imports n'est plus
--     ignoré) ; sans aucune fenêtre d'import, repli sur la date du jour.
--  5. `mv_score_pilier` expose les dénominateurs (poids des sous-composantes
--     retenues et calculables, poids des piliers calculables) : l'API ne les
--     recalcule plus.
--  6. Historique des produits écartés : seule une absence corrigée par un
--     ré-import est retirée ; un site sorti du périmètre ou un traceur
--     désactivé garde son historique.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

-- Mois jugé : la fenêtre de clôture est entièrement couverte par les données.
CREATE OR REPLACE FUNCTION dqa.mois_juge_p4_p5(p_mois text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM dqa.import_lot
                          WHERE statut = 'valide' AND fenetre_debut IS NOT NULL AND fenetre_fin IS NOT NULL)
            THEN CURRENT_DATE >= f.fin
        ELSE NOT EXISTS (
            SELECT 1 FROM generate_series(f.debut, f.fin, interval '1 day') AS j(jour)
            WHERE NOT EXISTS (SELECT 1 FROM dqa.import_lot l
                               WHERE l.statut = 'valide'
                                 AND j.jour::date BETWEEN l.fenetre_debut AND l.fenetre_fin))
    END
    FROM dqa.fenetre_cloture(p_mois) f
$$;

-- Dénominateur d'un score de pilier : poids des sous-composantes retenues et
-- calculables (mêmes règles que dqa.score_pilier).
CREATE FUNCTION dqa.poids_calculables(p_grille_id bigint, p_notes jsonb)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT coalesce(sum(gs.poids_pct), 0)
    FROM dqa.grille_seuil_sous_composante gs
    WHERE gs.grille_id = p_grille_id
      AND gs.retenue
      AND p_notes ? gs.sous_composante
      AND p_notes ->> gs.sous_composante IS NOT NULL
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
            -- le code figure à l'ouverture, mais sous un autre article mSupply :
            -- les bornes se rapprochent par article (ADR 0016)
            WHEN cp.produit_id IS NULL AND EXISTS (
                SELECT 1 FROM lignes_dim o
                WHERE o.site_id = sp.site_id AND o.prog IS NOT DISTINCT FROM sp.prog
                  AND o.mois_paqd = dqa.mois_precedent(sp.mois_paqd)
                  AND o.produit_code = sp.produit_code)
                THEN 'autre_article_ouverture'
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
-- Mois jugés, évalués une fois (la couverture se vérifie jour par jour).
mois_juges AS MATERIALIZED (
    SELECT mois,
           dqa.mois_juge_p4_p5(mois)                      AS juge,
           dqa.mois_juge_p4_p5(dqa.mois_precedent(mois))  AS juge_precedent
    FROM mois_couverts
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
        -- un produit aux deux bornes compte au dénominateur ; reconstituée ≤ 0
        -- (hausse de stock sans réception) : non conforme (migration 0061)
        coalesce(bool_and(conso_conforme) FILTER (WHERE conso_borne_ok), false) AS conso_conforme,
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
        (count(*) FILTER (WHERE conso_borne_ok))::int             AS nb_produits_conso,
        (count(*) FILTER (WHERE conso_borne_ok AND conso_conforme))::int AS nb_conformes_conso,
        (count(*) FILTER (WHERE conso_borne_ok))::int             AS nb_conso_borne_ok
    FROM par_code
    GROUP BY site_id, programme_id, mois_paqd
),
programmes_univers AS (
    SELECT site_id, programme_id, mois_paqd FROM agg WHERE programme_id IS NOT NULL
    UNION
    SELECT sp.site_id, sp.programme_id, mc.mois
    FROM dqa.dim_site_programme sp
    JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
    JOIN mois_couverts mc ON dqa.mois_mesurable(mc.mois)
    WHERE sp.actif
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
             WHEN mj_u.juge THEN 0.0
             ELSE NULL END                  AS taux_sdu_pct,
        -- sans clôture, ou sans ouverture alors que le mois précédent est
        -- jugé : 0 % une fois le mois jugé ; avec les deux mais aucun produit
        -- évaluable : non calculable
        CASE WHEN coalesce(a.nb_produits_conso, 0) > 0
             THEN round(a.nb_conformes_conso::numeric / a.nb_produits_conso * 100, 1)
             WHEN coalesce(bm.a_ouverture, false) THEN NULL
             WHEN mj_u.juge
              AND (bm.site_id IS NULL OR mj_u.juge_precedent) THEN 0.0
             ELSE NULL END                  AS taux_conso_pct
    FROM univers u
    JOIN mois_juges mj_u ON mj_u.mois = u.mois_paqd
    LEFT JOIN agg a
           ON a.site_id = u.site_id AND a.mois_paqd = u.mois_paqd AND a.programme_id IS NULL
    LEFT JOIN bornes_mois bm
           ON bm.site_id = u.site_id AND bm.mois_paqd = u.mois_paqd AND bm.programme_id IS NULL
    UNION ALL
    -- grain programme : les programmes gérés par le site (dim_site_programme)
    -- et ceux qu'il a inventoriés ; même règle de sanction que le site
    SELECT
        pu.site_id, pu.programme_id, pu.mois_paqd, dqa.est_district(s.type_structure),
        coalesce(a.nb_produits_sdu, 0), coalesce(a.nb_conformes_sdu, 0),
        coalesce(a.nb_produits_conso, 0), coalesce(a.nb_conformes_conso, 0),
        CASE WHEN coalesce(a.nb_produits_sdu, 0) > 0
             THEN round(a.nb_conformes_sdu::numeric / a.nb_produits_sdu * 100, 1)
             WHEN bm.site_id IS NOT NULL THEN NULL
             WHEN coalesce(mj_pu.juge, false) THEN 0.0
             ELSE NULL END,
        CASE WHEN coalesce(a.nb_produits_conso, 0) > 0
             THEN round(a.nb_conformes_conso::numeric / a.nb_produits_conso * 100, 1)
             WHEN coalesce(bm.a_ouverture, false) THEN NULL
             WHEN coalesce(mj_pu.juge, false)
              AND (bm.site_id IS NULL OR coalesce(mj_pu.juge_precedent, false)) THEN 0.0
             ELSE NULL END
    FROM programmes_univers pu
    JOIN dqa.dim_site s ON s.site_id = pu.site_id
    LEFT JOIN mois_juges mj_pu ON mj_pu.mois = pu.mois_paqd
    LEFT JOIN agg a
           ON a.site_id = pu.site_id AND a.programme_id = pu.programme_id AND a.mois_paqd = pu.mois_paqd
    LEFT JOIN bornes_mois bm
           ON bm.site_id = pu.site_id AND bm.programme_id = pu.programme_id AND bm.mois_paqd = pu.mois_paqd
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
-- Mois jugés, évalués une fois (la couverture se vérifie jour par jour).
mois_juges AS MATERIALIZED (
    SELECT mois,
           dqa.mois_juge_p4_p5(mois)                      AS juge,
           dqa.mois_juge_p4_p5(dqa.mois_precedent(mois))  AS juge_precedent
    FROM mois_couverts
),
univers AS (
    SELECT s.site_id, mc.mois AS mois_paqd
    FROM dqa.dim_site s
    CROSS JOIN mois_couverts mc
    WHERE s.dans_perimetre_dqa
),
clotures AS MATERIALIZED (
    SELECT site_id, programme_id, mois_paqd FROM dqa.v_cloture_inventaire
),
programmes_univers AS (
    SELECT sp.site_id, sp.programme_id, mc.mois AS mois_paqd
    FROM dqa.dim_site_programme sp
    JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
    JOIN mois_couverts mc ON dqa.mois_mesurable(mc.mois)
    WHERE sp.actif
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
                      WHERE vc.site_id = u.site_id AND vc.programme_id IS NULL
                        AND vc.mois_paqd = u.mois_paqd) THEN NULL
        -- aucune clôture : 0 % une fois le mois jugé, sinon pas encore dû
        WHEN mj_u.juge THEN 0.0
        ELSE NULL
    END                                                                 AS taux_concordance_pct,
    coalesce(a.nb_produits, 0)                                           AS nb_produits,
    coalesce(a.nb_produits_conformes, 0)                                 AS nb_produits_conformes
FROM univers u
JOIN mois_juges mj_u ON mj_u.mois = u.mois_paqd
LEFT JOIN agg a ON a.site_id = u.site_id AND a.mois_paqd = u.mois_paqd AND a.programme_id IS NULL
UNION ALL
-- grain programme : programmes inventoriés et programmes gérés (migration 0061)
SELECT
    pu.site_id, pu.programme_id, pu.mois_paqd,
    CASE
        WHEN a.site_id IS NOT NULL THEN a.taux_concordance_pct
        WHEN EXISTS (SELECT 1 FROM clotures vc
                      WHERE vc.site_id = pu.site_id AND vc.programme_id = pu.programme_id
                        AND vc.mois_paqd = pu.mois_paqd) THEN NULL
        WHEN coalesce(mj_pu.juge, false) THEN 0.0
        ELSE NULL
    END,
    coalesce(a.nb_produits, 0),
    coalesce(a.nb_produits_conformes, 0)
FROM (SELECT site_id, programme_id, mois_paqd FROM agg WHERE programme_id IS NOT NULL
      UNION
      SELECT site_id, programme_id, mois_paqd FROM programmes_univers) pu
LEFT JOIN mois_juges mj_pu ON mj_pu.mois = pu.mois_paqd
LEFT JOIN agg a
       ON a.site_id = pu.site_id AND a.programme_id = pu.programme_id AND a.mois_paqd = pu.mois_paqd;

CREATE UNIQUE INDEX mv_p5_uq ON mv_p5_concordance (site_id, mois_paqd, coalesce(programme_id, ''));


-- ══ Score composite (définition 0059, poids calculables) ════════════════
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
notes_piliers AS (
    SELECT j.*,
        jsonb_build_object('completude_requisitions', j.n_completude_requisitions,
                           'completude_receptions', j.n_completude_receptions)          AS n_p1,
        jsonb_build_object('promptitude_inventaires', j.n_promptitude_inventaires,
                           'promptitude_requisitions', j.n_promptitude_requisitions)    AS n_p2,
        jsonb_build_object('regularite_saisie', j.n_regularite_saisie)                 AS n_p3,
        jsonb_build_object('ecart_sdu', j.n_ecart_sdu,
                           'ecart_consommation', j.n_ecart_consommation)                AS n_p4,
        jsonb_build_object('concordance', j.n_concordance)                             AS n_p5,
        jsonb_build_object('ratio_ajustements', j.n_ratio_ajustements)                 AS n_p6
    FROM jointes j
),
base AS (
    SELECT np.*,
        dqa.score_pilier(np.grille_id, np.n_p1)      AS p_completude,
        dqa.score_pilier(np.grille_id, np.n_p2)      AS p_promptitude,
        dqa.score_pilier(np.grille_id, np.n_p3)      AS p_regularite,
        dqa.score_pilier(np.grille_id, np.n_p4)      AS p_ecart_sdu,
        dqa.score_pilier(np.grille_id, np.n_p5)      AS p_concordance,
        dqa.score_pilier(np.grille_id, np.n_p6)      AS p_ajustements,
        -- dénominateurs des scores de pilier, pour la transparence (migration 0061)
        dqa.poids_calculables(np.grille_id, np.n_p1) AS poids_calc_p1,
        dqa.poids_calculables(np.grille_id, np.n_p2) AS poids_calc_p2,
        dqa.poids_calculables(np.grille_id, np.n_p3) AS poids_calc_p3,
        dqa.poids_calculables(np.grille_id, np.n_p4) AS poids_calc_p4,
        dqa.poids_calculables(np.grille_id, np.n_p5) AS poids_calc_p5,
        dqa.poids_calculables(np.grille_id, np.n_p6) AS poids_calc_p6
    FROM notes_piliers np
),
composite AS (
    SELECT b.site_id, b.mois_paqd, b.programme_id,
        round(sum(pil.score * gp.poids_pct) / nullif(sum(gp.poids_pct), 0), 1)::numeric(5, 1) AS score_composite,
        sum(gp.poids_pct)                                          AS poids_piliers_calcules
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
    dqa.classer_composite(c.score_composite, b.grille_id) AS classification,
    b.n_completude_requisitions  AS note_completude_requisitions,
    b.n_completude_receptions    AS note_completude_receptions,
    b.n_promptitude_inventaires  AS note_promptitude_inventaires,
    b.n_promptitude_requisitions AS note_promptitude_requisitions,
    b.n_regularite_saisie        AS note_regularite_saisie,
    b.n_ecart_sdu                AS note_ecart_sdu,
    b.n_ecart_consommation       AS note_ecart_consommation,
    b.n_concordance              AS note_concordance,
    b.n_ratio_ajustements        AS note_ratio_ajustements,
    b.poids_calc_p1, b.poids_calc_p2, b.poids_calc_p3, b.poids_calc_p4, b.poids_calc_p5, b.poids_calc_p6,
    coalesce(c.poids_piliers_calcules, 0) AS poids_piliers_calcules
FROM base b
LEFT JOIN composite c ON c.site_id = b.site_id AND c.mois_paqd = b.mois_paqd
      AND coalesce(c.programme_id, '') = coalesce(b.programme_id, '');

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ Produits écartés (définition 0060, recréée avec P4 par produit) ══════
CREATE MATERIALIZED VIEW mv_produit_ecarte AS
WITH base AS (
    -- clôtures retenues, tous programmes, un code compte une fois (ADR 0016)
    SELECT site_id, mois_paqd, produit_code,
           max(libelle)          AS libelle,
           max(date_inventaire)  AS date_inventaire,
           sum(comptee)          AS comptee,
           bool_or(est_district) AS est_district
    FROM dqa.mv_p4_ecart_produit
    WHERE programme_id IS NULL
    GROUP BY site_id, mois_paqd, produit_code
),
cloture_site AS (
    SELECT site_id, mois_paqd, max(date_inventaire) AS date_cloture
    FROM base GROUP BY site_id, mois_paqd
),
paires AS (
    SELECT c.site_id, c.mois_paqd, o.date_cloture AS date_ouverture, c.date_cloture
    FROM cloture_site c
    JOIN cloture_site o ON o.site_id = c.site_id AND o.mois_paqd = dqa.mois_precedent(c.mois_paqd)
),
absents AS (
    SELECT p.site_id, p.mois_paqd, p.date_ouverture, p.date_cloture,
           b.produit_code, b.libelle, b.est_district, b.comptee AS stock_connu,
           'absent_ouverture'::text AS sens
    FROM paires p
    JOIN base b ON b.site_id = p.site_id AND b.mois_paqd = p.mois_paqd
    WHERE NOT EXISTS (SELECT 1 FROM base x
                       WHERE x.site_id = p.site_id AND x.mois_paqd = dqa.mois_precedent(p.mois_paqd)
                         AND x.produit_code = b.produit_code)
    UNION ALL
    SELECT p.site_id, p.mois_paqd, p.date_ouverture, p.date_cloture,
           b.produit_code, b.libelle, b.est_district, b.comptee,
           'absent_cloture'
    FROM paires p
    JOIN base b ON b.site_id = p.site_id AND b.mois_paqd = dqa.mois_precedent(p.mois_paqd)
    WHERE NOT EXISTS (SELECT 1 FROM base x
                       WHERE x.site_id = p.site_id AND x.mois_paqd = p.mois_paqd
                         AND x.produit_code = b.produit_code)
),
flux AS (
    SELECT a.site_id, a.mois_paqd, a.produit_code, a.sens,
           coalesce(sum(m.reception), 0) AS receptions,
           coalesce(sum(CASE WHEN a.est_district THEN m.distribution ELSE m.dispensation END), 0) AS sorties_declarees
    FROM absents a
    LEFT JOIN dqa.dim_produit p ON p.produit_code = a.produit_code
    LEFT JOIN dqa.v_mouvement_stock_jour m
           ON m.site_id = a.site_id AND m.produit_id = p.produit_id
          AND m.jour > a.date_ouverture AND m.jour <= a.date_cloture
    GROUP BY a.site_id, a.mois_paqd, a.produit_code, a.sens
)
SELECT a.site_id, a.mois_paqd, a.produit_code, a.libelle, a.sens,
       a.date_ouverture, a.date_cloture,
       a.stock_connu, f.receptions, f.sorties_declarees,
       c.stock_calcule,
       CASE
           WHEN a.sens = 'absent_ouverture' AND c.stock_calcule > 0 THEN 'oubli_demontre'
           WHEN a.sens = 'absent_ouverture'                         THEN 'indetermine'
           WHEN c.stock_calcule > 0                                 THEN 'oubli_probable'
           ELSE 'epuise'
       END AS qualification
FROM absents a
JOIN flux f USING (site_id, mois_paqd, produit_code, sens)
CROSS JOIN LATERAL (SELECT CASE WHEN a.sens = 'absent_ouverture'
                                THEN a.stock_connu + f.sorties_declarees - f.receptions
                                ELSE a.stock_connu + f.receptions - f.sorties_declarees
                           END AS stock_calcule) c;

CREATE UNIQUE INDEX mv_produit_ecarte_uq ON mv_produit_ecarte (site_id, mois_paqd, produit_code, sens);

-- ══ Gel : définition 0060, historique des produits écartés protégé ═════
CREATE OR REPLACE PROCEDURE rafraichir_et_geler(p_lot_id bigint)
LANGUAGE plpgsql AS $$
DECLARE
    v_lot_id bigint;
BEGIN
    SELECT id INTO v_lot_id FROM dqa.import_lot WHERE id = p_lot_id;

    REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
    REFRESH MATERIALIZED VIEW dqa.mv_p2_promptitude;
    REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
    REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart_produit;
    REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
    REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
    REFRESH MATERIALIZED VIEW dqa.mv_p6_ajustements;
    REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;

    INSERT INTO dqa.hist_score_site
        (site_id, mois_paqd, programme_id, grille_id,
         p_completude, p_promptitude, p_regularite, p_ecart_sdu,
         p_concordance, p_ajustements,
         sc_completude_requisitions, sc_completude_receptions,
         sc_promptitude_inventaires, sc_promptitude_requisitions, sc_regularite_saisie,
         sc_ecart_sdu, sc_ecart_consommation, sc_concordance, sc_ratio_ajustements,
         score_composite, classification, lot_id, calcule_le)
    SELECT sp.site_id, sp.mois_paqd, sp.programme_id, dqa.grille_pour_mois(sp.mois_paqd),
           sp.p_completude, sp.p_promptitude, sp.p_regularite, sp.p_ecart_sdu,
           sp.p_concordance, sp.p_ajustements,
           sp.sc_completude_requisitions, sp.sc_completude_receptions,
           sp.sc_promptitude_inventaires, sp.sc_promptitude_requisitions, sp.sc_regularite_saisie,
           sp.sc_ecart_sdu, sp.sc_ecart_consommation, sp.sc_concordance, sp.sc_ratio_ajustements,
           sp.score_composite, sp.classification, v_lot_id, now()
    FROM dqa.mv_score_pilier sp
    JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
    ON CONFLICT (site_id, mois_paqd, programme_id) DO UPDATE SET
        grille_id                   = EXCLUDED.grille_id,
        p_completude                = EXCLUDED.p_completude,
        p_promptitude               = EXCLUDED.p_promptitude,
        p_regularite                = EXCLUDED.p_regularite,
        p_ecart_sdu                 = EXCLUDED.p_ecart_sdu,
        p_concordance               = EXCLUDED.p_concordance,
        p_ajustements               = EXCLUDED.p_ajustements,
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

    -- Un compte n'est figé que si sa sous-composante est calculable : avant
    -- l'échéance, aucun couple attendu / réalisé ne circule.
    INSERT INTO dqa.hist_pilier_brut
        (site_id, mois_paqd, programme_id, mesure, nb_attendu, nb_realise, nb_a_lheure, lot_id, calcule_le)
    SELECT sm.site_id, sm.mois_paqd, sm.programme_id, m.mesure,
           m.nb_attendu::int, m.nb_realise::int, m.nb_a_lheure::int, v_lot_id, now()
    FROM (SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_score_pilier) sm
    JOIN dqa.dim_site s ON s.site_id = sm.site_id AND s.dans_perimetre_dqa
    LEFT JOIN dqa.mv_p1_completude  p1 ON p1.site_id = sm.site_id AND p1.mois_paqd = sm.mois_paqd AND p1.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p2_promptitude p2 ON p2.site_id = sm.site_id AND p2.mois_paqd = sm.mois_paqd AND p2.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p3_regularite  p3 ON p3.site_id = sm.site_id AND p3.mois_paqd = sm.mois_paqd AND p3.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p4_ecart       p4 ON p4.site_id = sm.site_id AND p4.mois_paqd = sm.mois_paqd AND p4.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p5_concordance p5 ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd AND p5.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p6_ajustements p6 ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd AND p6.programme_id IS NOT DISTINCT FROM sm.programme_id
    CROSS JOIN LATERAL (VALUES
        ('p1_requisitions',       p1.nb_requisitions_attendu, p1.nb_requisitions_realise,  NULL::int,                     p1.completude_requisitions_pct),
        ('p1_receptions',         p1.nb_factures,             p1.nb_factures_acceptees,    NULL::int,                     p1.completude_receptions_pct),
        ('p2_inventaires',        p2.nb_inventaires_attendu,  p2.nb_inventaires_realise,   p2.nb_inventaires_a_lheure,    p2.promptitude_inventaires_pct),
        ('p2_requisitions',       p2.nb_requisitions_attendu, p2.nb_requisitions_realise,  p2.nb_requisitions_a_lheure,   p2.promptitude_requisitions_pct),
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

    -- Un compte devenu non calculable (mois rouvert par la nouvelle règle des
    -- échéances, programme retiré) ne doit pas survivre à côté d'un score nul.
    -- Sur un mois encore ouvert, un compte figé sous l'ancienne règle pour un
    -- couple qui n'a plus de score (programme désormais non éligible, échéance
    -- non arrivée) est retiré aussi : sinon les synthèses le recomptent (lot
    -- du 2026-10-14, 76 réquisitions « attendues » en octobre). Les mois clos
    -- gardent leur historique.
    DELETE FROM dqa.hist_pilier_brut b
    WHERE b.mesure IN ('p1_requisitions', 'p1_receptions', 'p2_inventaires', 'p2_requisitions')
      AND (EXISTS (SELECT 1 FROM dqa.mv_score_pilier sp
                    WHERE sp.site_id = b.site_id AND sp.mois_paqd = b.mois_paqd
                      AND sp.programme_id IS NOT DISTINCT FROM b.programme_id)
           OR NOT dqa.mois_est_clos(b.mois_paqd))
      AND NOT EXISTS (
          SELECT 1 FROM dqa.mv_p1_completude p1
          WHERE p1.site_id = b.site_id AND p1.mois_paqd = b.mois_paqd
            AND p1.programme_id IS NOT DISTINCT FROM b.programme_id
            AND ((b.mesure = 'p1_requisitions' AND p1.completude_requisitions_pct IS NOT NULL)
              OR (b.mesure = 'p1_receptions'   AND p1.completude_receptions_pct IS NOT NULL))
          UNION ALL
          SELECT 1 FROM dqa.mv_p2_promptitude p2
          WHERE p2.site_id = b.site_id AND p2.mois_paqd = b.mois_paqd
            AND p2.programme_id IS NOT DISTINCT FROM b.programme_id
            AND ((b.mesure = 'p2_inventaires'  AND p2.promptitude_inventaires_pct IS NOT NULL)
              OR (b.mesure = 'p2_requisitions' AND p2.promptitude_requisitions_pct IS NOT NULL)));

    -- Produits écartés d'un inventaire (migration 0060) : historisés comme les
    -- scores, tout mois reconstruit à chaque gel (ADR 0010) ; une absence qui
    -- n'existe plus dans le core (ré-import corrigé) est retirée.
    REFRESH MATERIALIZED VIEW dqa.mv_produit_ecarte;
    INSERT INTO dqa.hist_produit_ecarte
        (site_id, mois_paqd, produit_code, sens, libelle, date_ouverture, date_cloture,
         stock_connu, receptions, sorties_declarees, stock_calcule, qualification, lot_id, calcule_le)
    SELECT site_id, mois_paqd, produit_code, sens, libelle, date_ouverture, date_cloture,
           stock_connu, receptions, sorties_declarees, stock_calcule, qualification, v_lot_id, now()
    FROM dqa.mv_produit_ecarte
    ON CONFLICT (site_id, mois_paqd, produit_code, sens) DO UPDATE SET
        libelle           = EXCLUDED.libelle,
        date_ouverture    = EXCLUDED.date_ouverture,
        date_cloture      = EXCLUDED.date_cloture,
        stock_connu       = EXCLUDED.stock_connu,
        receptions        = EXCLUDED.receptions,
        sorties_declarees = EXCLUDED.sorties_declarees,
        stock_calcule     = EXCLUDED.stock_calcule,
        qualification     = EXCLUDED.qualification,
        lot_id            = EXCLUDED.lot_id,
        calcule_le        = now();
    -- Seule une absence corrigée par un ré-import est retirée : un site sorti
    -- du périmètre ou un traceur désactivé garde son historique (migration 0061).
    DELETE FROM dqa.hist_produit_ecarte h
    WHERE NOT EXISTS (SELECT 1 FROM dqa.mv_produit_ecarte v
                       WHERE v.site_id = h.site_id AND v.mois_paqd = h.mois_paqd
                         AND v.produit_code = h.produit_code AND v.sens = h.sens)
      AND EXISTS (SELECT 1 FROM dqa.dim_site s WHERE s.site_id = h.site_id AND s.dans_perimetre_dqa)
      AND EXISTS (SELECT 1 FROM dqa.dim_produit_traceur t WHERE t.produit_code = h.produit_code AND t.actif);

    REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_territoire_rapports;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_territoire_scores;
END;
$$;

COMMENT ON COLUMN mv_p4_ecart.p_ecart_sdu IS
    'Moyenne simple des deux sous-composantes, sans usage pour le score : le score P4 est mv_score_pilier.p_ecart_sdu (migration 0057).';
