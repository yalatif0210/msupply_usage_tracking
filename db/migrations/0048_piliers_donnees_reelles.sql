-- ═══════════════════════════════════════════════════════════════════════════
--  Piliers fiabilisés sur données réelles (ADR 0018, 0019, 0020).
--
--  Audit du 2026-10-14 sur le premier fichier réel : le code appliquait
--  fidèlement ses règles, ce sont certaines règles qui ne tenaient pas. Cette
--  migration recrée la chaîne des vues de piliers :
--
--  1. Seules les transactions finalisées (`fn`) comptent (P3, P4, P6) ; les
--     autres restent en base, pour la traçabilité et pour le dénominateur des
--     réceptions (ADR 0018).
--  2. P4 consommation : les entrées de stock sont les lignes des factures `si`
--     réceptionnées (`fn`), hors ajustements, datées de leur finalisation.
--     `rc` (reçu de paiement, nature `encaissement`) ne compte jamais.
--  3. P1 = complétude des réquisitions + complétude des réceptions ; la
--     complétude d'inventaire sort de P1 (même fait que la promptitude P2).
--     Complétude des réceptions du mois M : factures `si` citant une
--     réquisition ordinaire finalisée couvrant M-1, acceptées (`fn`) dans
--     leur mois d'émission (ADR 0019). Calcul continu pendant le mois.
--  4. Programmes éligibles : seuls les couples site x programme actifs
--     (administrés dans la console, ADR 0020) sont attendus.
--  5. Échéances : une sous-composante dont l'échéance n'est pas passée est
--     non calculable (NULL), pas 0 : réquisitions (jour limite de M+1),
--     inventaire de fin de mois (dernier jour de M). Même règle que P4 / P5
--     (ADR 0014).
--  6. Grille : chaque sous-composante est jugée contre son propre seuil et son
--     propre sens (`sup` : au moins le seuil, `inf` : au plus).
--  7. Suivi hors score : réquisitions ordinaires sans facture, factures en
--     attente depuis plus de N jours (N en base, 7 par défaut).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

-- ══ Fonctions communes ═══════════════════════════════════════════════════

-- Le seuil est-il atteint, dans le sens de la grille ? NULL si l'un manque.
CREATE FUNCTION dqa.seuil_atteint(p_valeur numeric, p_seuil numeric, p_sens text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_valeur IS NULL OR p_seuil IS NULL THEN NULL
        WHEN p_sens = 'inf' THEN p_valeur <= p_seuil
        ELSE p_valeur >= p_seuil
    END
$$;

-- Note binaire d'une sous-composante (100 atteint, 0 non atteint, NULL non
-- calculable) selon la grille en vigueur pour le mois : seuil, sens, et seuil
-- district quand la grille en porte un (régularité de saisie, ADR 0011).
CREATE FUNCTION dqa.note_sous_composante(
    p_valeur numeric, p_sous_composante text, p_mois text, p_district boolean DEFAULT false
)
RETURNS numeric LANGUAGE sql STABLE AS $$
    SELECT CASE dqa.seuil_atteint(
                p_valeur,
                CASE WHEN p_district AND gs.seuil_district IS NOT NULL THEN gs.seuil_district ELSE gs.seuil END,
                gs.sens)
             WHEN true  THEN 100.0
             WHEN false THEN 0.0
           END
    FROM (SELECT 1) x
    LEFT JOIN dqa.grille_seuil_sous_composante gs
           ON gs.grille_id = dqa.grille_pour_mois(p_mois) AND gs.sous_composante = p_sous_composante
$$;

-- Dernier jour pour soumettre « à l'heure » la réquisition couvrant le mois.
CREATE FUNCTION dqa.echeance_requisition(p_mois text, p_type_structure text)
RETURNS date LANGUAGE sql STABLE AS $$
    SELECT ((p_mois || '-01')::date + interval '1 month')::date
           + (dqa.jour_limite_requisition(p_type_structure) - 1)
$$;

-- L'inventaire de fin de mois est attendu dans les 3 derniers jours du mois.
CREATE FUNCTION dqa.echeance_inventaire(p_mois text)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
    SELECT ((p_mois || '-01')::date + interval '1 month - 1 day')::date
$$;

-- Mois d'émission d'une facture `si` : finalisation de la livraison du
-- district qui l'a produite, à défaut sa propre création (site livré par la
-- NPSP, sans lien entre mSupply et le logiciel de la NPSP).
CREATE FUNCTION dqa.date_emission_facture(p_date_finalisation_liee date, p_date_saisie date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(p_date_finalisation_liee, p_date_saisie)
$$;

-- Date de réception d'une facture : sa finalisation (ADR 0018) ; repli sur la
-- confirmation pour un classeur antérieur au canevas v2.4.
CREATE FUNCTION dqa.date_reception_facture(
    p_date_finalisation date, p_date_confirmation date, p_date_saisie date
)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(p_date_finalisation, p_date_confirmation, p_date_saisie)
$$;

-- ══ Paramètres du suivi hors score ════════════════════════════════════════
CREATE TABLE parametre_suivi (
    cle         text PRIMARY KEY,
    valeur      numeric NOT NULL,
    description text NOT NULL
);
INSERT INTO parametre_suivi (cle, valeur, description) VALUES
    ('delai_alerte_facture_jours', 7,
     'Une facture fournisseur non finalisée depuis plus de ce nombre de jours (après son émission) est signalée.');

-- ══ La grille perd la complétude d'inventaire (ADR 0019) ══════════════════
DELETE FROM grille_seuil_sous_composante WHERE sous_composante = 'completude_inventaires';

DROP MATERIALIZED VIEW IF EXISTS
    mv_score_pilier, mv_p1_completude, mv_p2_promptitude, mv_p3_regularite,
    mv_p4_ecart, mv_p5_concordance, mv_p4_ecart_produit, mv_p6_ajustements,
    mv_synthese_rapports CASCADE;

-- ══ P1 complétude ════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW mv_p1_completude AS
WITH perimetre AS (
    SELECT site_id, type_structure FROM dqa.dim_site WHERE dans_perimetre_dqa
),
eligibles AS (
    SELECT sp.site_id, sp.programme_id AS prog
    FROM dqa.dim_site_programme sp
    JOIN perimetre p ON p.site_id = sp.site_id
    WHERE sp.actif
),
-- Base de la complétude des réceptions : réquisitions ORDINAIRES finalisées,
-- rattachées au mois évalué qui suit leur mois couvert. Une réquisition sans
-- programme ne compte que dans « tous programmes ».
req_ordinaires AS (
    SELECT fr.requisition_id, fr.site_id, fr.programme_id AS prog,
           to_char((fr.mois_couvert || '-01')::date + interval '1 month', 'YYYY-MM') AS mois
    FROM dqa.fact_requisition fr
    JOIN perimetre p ON p.site_id = fr.site_id
    WHERE fr.type_requisition = 'Ordinaire' AND fr.statut = 'fn'
      AND (fr.programme_id IS NULL
           OR EXISTS (SELECT 1 FROM eligibles e WHERE e.site_id = fr.site_id AND e.prog = fr.programme_id))
),
factures AS (
    SELECT r.site_id, r.prog, r.mois,
           (ft.statut = 'fn'
            AND to_char(dqa.date_reception_facture(ft.date_finalisation, ft.date_confirmation, ft.date_saisie), 'YYYY-MM')
              = to_char(dqa.date_emission_facture(ft.date_finalisation_liee, ft.date_saisie), 'YYYY-MM')) AS acceptee
    FROM req_ordinaires r
    JOIN dqa.fact_transaction ft
      ON ft.requisition_id = r.requisition_id AND ft.site_id = r.site_id
    WHERE ft.nature = 'facture_fournisseur'
      AND ft.statut IN ('fn', 'cn', 'nw')
      AND coalesce(ft.annulation, false) = false
),
activite AS (
    SELECT DISTINCT u.site_id, u.mois
    FROM (
        SELECT fi.site_id, to_char(fi.date_inventaire, 'YYYY-MM') AS mois
        FROM dqa.fact_inventaire fi JOIN perimetre p ON p.site_id = fi.site_id
        WHERE fi.statut = 'fn'
        UNION ALL
        SELECT fr.site_id, fr.mois_couvert
        FROM dqa.fact_requisition fr JOIN perimetre p ON p.site_id = fr.site_id
        UNION ALL
        -- Un mois n'existe pour les réceptions que si une facture y répond :
        -- une réquisition sans facture ne doit pas créer à elle seule un mois
        -- noté sur les seules réquisitions du mois suivant.
        SELECT site_id, mois FROM factures
    ) u
    WHERE u.mois IN (SELECT mois_paqd FROM dqa.dim_temps)
),
req_prog AS (
    SELECT a.site_id, a.mois, e.prog,
           EXISTS (SELECT 1 FROM dqa.fact_requisition fr
                    WHERE fr.site_id = a.site_id AND fr.programme_id = e.prog
                      AND fr.mois_couvert = a.mois)                         AS a_req,
           CURRENT_DATE > dqa.echeance_requisition(a.mois, p.type_structure) AS echu
    FROM activite a
    JOIN eligibles e ON e.site_id = a.site_id
    JOIN perimetre p ON p.site_id = a.site_id
),
req AS (
    SELECT site_id, mois, prog, echu,
           1 AS attendu, a_req::int AS realise
    FROM req_prog
    UNION ALL
    SELECT a.site_id, a.mois, NULL::text,
           coalesce(bool_and(rp.echu),
                    CURRENT_DATE > dqa.echeance_requisition(a.mois, max(p.type_structure))),
           count(rp.prog)::int,
           (count(rp.prog) FILTER (WHERE rp.a_req))::int
    FROM activite a
    JOIN perimetre p ON p.site_id = a.site_id
    LEFT JOIN req_prog rp ON rp.site_id = a.site_id AND rp.mois = a.mois
    GROUP BY a.site_id, a.mois
),
rec AS (
    SELECT site_id, mois, prog,
           count(*)::int AS nb_factures, (count(*) FILTER (WHERE acceptee))::int AS nb_acceptees
    FROM factures WHERE prog IS NOT NULL
    GROUP BY site_id, mois, prog
    UNION ALL
    SELECT site_id, mois, NULL::text,
           count(*)::int, (count(*) FILTER (WHERE acceptee))::int
    FROM factures
    GROUP BY site_id, mois
),
taux AS (
    SELECT r.site_id, r.prog, r.mois, r.echu,
           r.attendu, r.realise,
           -- Avant l'échéance : non calculable, jamais 0 (ADR 0019).
           CASE WHEN r.echu AND r.attendu > 0
                THEN round(100.0 * r.realise / r.attendu, 1) END                AS completude_requisitions_pct,
           coalesce(rc.nb_factures, 0)                                          AS nb_factures,
           coalesce(rc.nb_acceptees, 0)                                         AS nb_acceptees,
           -- Suivi continu, même en cours de mois (ADR 0019).
           CASE WHEN rc.nb_factures > 0
                THEN round(100.0 * rc.nb_acceptees / rc.nb_factures, 1) END     AS completude_receptions_pct
    FROM req r
    LEFT JOIN rec rc ON rc.site_id = r.site_id AND rc.mois = r.mois
                    AND rc.prog IS NOT DISTINCT FROM r.prog
),
notes AS (
    SELECT t.*,
           dqa.note_sous_composante(t.completude_requisitions_pct, 'completude_requisitions', t.mois) AS score_requisitions,
           dqa.note_sous_composante(t.completude_receptions_pct, 'completude_receptions', t.mois)     AS score_receptions
    FROM taux t
)
SELECT
    site_id,
    prog                                    AS programme_id,
    mois                                    AS mois_paqd,
    echu                                    AS requisitions_echues,
    completude_requisitions_pct,
    completude_receptions_pct,
    realise                                 AS nb_requisitions_realise,
    attendu                                 AS nb_requisitions_attendu,
    nb_acceptees                            AS nb_factures_acceptees,
    nb_factures,
    score_requisitions,
    score_receptions,
    (SELECT round(avg(v.s), 1)::numeric(5, 1)
     FROM (VALUES (score_requisitions), (score_receptions)) AS v(s)
     WHERE v.s IS NOT NULL)                 AS p_completude
FROM notes;

CREATE UNIQUE INDEX mv_p1_uq
    ON mv_p1_completude (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ P2 promptitude ═══════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW mv_p2_promptitude AS
WITH perimetre AS (
    SELECT site_id, type_structure FROM dqa.dim_site WHERE dans_perimetre_dqa
),
eligibles AS (
    SELECT sp.site_id, sp.programme_id AS prog
    FROM dqa.dim_site_programme sp
    JOIN perimetre p ON p.site_id = sp.site_id
    WHERE sp.actif
),
activite AS (
    SELECT DISTINCT u.site_id, u.mois
    FROM (
        SELECT fi.site_id, to_char(fi.date_inventaire, 'YYYY-MM') AS mois
        FROM dqa.fact_inventaire fi JOIN perimetre p ON p.site_id = fi.site_id
        WHERE fi.statut = 'fn'
        UNION ALL
        SELECT fr.site_id, fr.mois_couvert
        FROM dqa.fact_requisition fr JOIN perimetre p ON p.site_id = fr.site_id
    ) u
    WHERE u.mois IN (SELECT mois_paqd FROM dqa.dim_temps)
),
statut_prog AS (
    SELECT
        a.site_id, a.mois, e.prog,
        EXISTS (SELECT 1 FROM dqa.fact_inventaire fi
                 WHERE fi.site_id = a.site_id AND fi.statut = 'fn' AND fi.programme_id = e.prog
                   AND to_char(fi.date_inventaire, 'YYYY-MM') = a.mois)          AS inv_fait,
        EXISTS (SELECT 1 FROM dqa.fact_inventaire fi
                 WHERE fi.site_id = a.site_id AND fi.statut = 'fn' AND fi.programme_id = e.prog
                   AND to_char(fi.date_inventaire, 'YYYY-MM') = a.mois
                   AND fi.date_inventaire >= dqa.echeance_inventaire(a.mois) - 2) AS inv_ot,
        EXISTS (SELECT 1 FROM dqa.fact_requisition fr
                 WHERE fr.site_id = a.site_id AND fr.programme_id = e.prog
                   AND fr.mois_couvert = a.mois)                                AS req_faite,
        EXISTS (SELECT 1 FROM dqa.fact_requisition fr
                 WHERE fr.site_id = a.site_id AND fr.programme_id = e.prog
                   AND fr.mois_couvert = a.mois
                   AND fr.date_soumission IS NOT NULL
                   AND fr.date_soumission <= dqa.echeance_requisition(a.mois, p.type_structure)) AS req_ot,
        CURRENT_DATE > dqa.echeance_inventaire(a.mois)                          AS inv_echu,
        CURRENT_DATE > dqa.echeance_requisition(a.mois, p.type_structure)      AS req_echu
    FROM activite a
    JOIN eligibles e ON e.site_id = a.site_id
    JOIN perimetre p ON p.site_id = a.site_id
),
comptes AS (
    SELECT site_id, mois, prog, inv_echu, req_echu,
           1 AS nb_attendu, inv_fait::int AS nb_inv_fait, inv_ot::int AS nb_inv_ot,
           req_faite::int AS nb_req_faite, req_ot::int AS nb_req_ot
    FROM statut_prog
    UNION ALL
    SELECT site_id, mois, NULL::text, bool_and(inv_echu), bool_and(req_echu),
           count(*)::int,
           (count(*) FILTER (WHERE inv_fait))::int, (count(*) FILTER (WHERE inv_ot))::int,
           (count(*) FILTER (WHERE req_faite))::int, (count(*) FILTER (WHERE req_ot))::int
    FROM statut_prog
    GROUP BY site_id, mois
),
taux AS (
    SELECT c.*,
           CASE WHEN inv_echu THEN round(100.0 * nb_inv_ot / nb_attendu, 1) END AS promptitude_inventaires_pct,
           CASE WHEN req_echu THEN round(100.0 * nb_req_ot / nb_attendu, 1) END AS promptitude_requisitions_pct
    FROM comptes c
),
notes AS (
    SELECT t.*,
           dqa.note_sous_composante(t.promptitude_inventaires_pct, 'promptitude_inventaires', t.mois)   AS score_inventaires,
           dqa.note_sous_composante(t.promptitude_requisitions_pct, 'promptitude_requisitions', t.mois) AS score_requisitions
    FROM taux t
)
SELECT
    site_id,
    prog                       AS programme_id,
    mois                       AS mois_paqd,
    inv_echu                   AS inventaires_echus,
    req_echu                   AS requisitions_echues,
    promptitude_inventaires_pct,
    promptitude_requisitions_pct,
    nb_inv_fait                AS nb_inventaires_realise,
    nb_inv_ot                  AS nb_inventaires_a_lheure,
    nb_attendu                 AS nb_inventaires_attendu,
    nb_req_faite               AS nb_requisitions_realise,
    nb_req_ot                  AS nb_requisitions_a_lheure,
    nb_attendu                 AS nb_requisitions_attendu,
    score_inventaires,
    score_requisitions,
    (SELECT round(avg(v.s), 1)::numeric(5, 1)
     FROM (VALUES (score_inventaires), (score_requisitions)) AS v(s)
     WHERE v.s IS NOT NULL)    AS p_promptitude
FROM notes;

CREATE UNIQUE INDEX mv_p2_uq
    ON mv_p2_promptitude (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ P3 régularité (transactions finalisées seulement) ═════════════════════
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
        WHERE ft.statut = 'fn' AND coalesce(ft.annulation, false) = false
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
      AND ft.statut = 'fn'
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
              AND ft.statut = 'fn'
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

-- ══ P4 par produit ══════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW mv_p4_ecart_produit AS
WITH sites_district AS (
    SELECT site_id FROM dqa.dim_site
    WHERE dans_perimetre_dqa AND dqa.est_district(type_structure)
),
lignes_traceur AS MATERIALIZED (
    SELECT
        fi.site_id,
        fi.programme_id,
        fi.inventaire_id,
        fi.heure_inventaire,
        fi.numero_inventaire,
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
    GROUP BY fi.site_id, fi.programme_id, fi.inventaire_id, fi.heure_inventaire,
             fi.numero_inventaire, fi.date_inventaire,
             p.produit_id, p.produit_code, tr.libelle
),
-- Un seul inventaire par (site, jour, produit) : le dernier finalisé (heure,
-- puis numéro mSupply). Par programme, le dernier de ce programme ; tous
-- programmes, le dernier tous programmes confondus (même stock physique).
-- Un inventaire sans programme ne compte que dans « tous programmes ».
lignes_dim AS (
    SELECT site_id, prog, mois_paqd, date_inventaire,
           produit_id, produit_code, libelle, theorique, comptee
    FROM (
        SELECT site_id, programme_id AS prog, mois_paqd, date_inventaire,
               produit_id, produit_code, libelle, theorique, comptee,
               row_number() OVER (
                   PARTITION BY site_id, programme_id, date_inventaire, produit_id
                   ORDER BY heure_inventaire DESC NULLS LAST,
                            numero_inventaire DESC NULLS LAST, inventaire_id DESC) AS rang
        FROM lignes_traceur
        WHERE programme_id IS NOT NULL
        UNION ALL
        SELECT site_id, NULL, mois_paqd, date_inventaire,
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
        sb.site_id, sb.prog, sb.mois_paqd, sb.produit_id,
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
        t.seuil_concordance, t.sens_concordance,
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
    END                                                        AS conso_conforme
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
sites_avec_inv AS (
    SELECT DISTINCT fi.site_id, to_char(fi.date_inventaire, 'YYYY-MM') AS mois_paqd
    FROM dqa.fact_inventaire fi
    JOIN dqa.dim_site s ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    WHERE fi.statut = 'fn'
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
             ELSE NULL END                  AS taux_conso_pct
    FROM univers u
    LEFT JOIN agg a
           ON a.site_id = u.site_id AND a.mois_paqd = u.mois_paqd AND a.programme_id IS NULL
    UNION ALL
    SELECT
        a.site_id, a.programme_id, a.mois_paqd, a.est_district,
        a.nb_produits_sdu, a.nb_conformes_sdu, a.nb_produits_conso, a.nb_conformes_conso,
        round(a.nb_conformes_sdu::numeric / nullif(a.nb_produits_sdu, 0) * 100, 1),
        CASE WHEN a.nb_produits_conso > 0
             THEN round(a.nb_conformes_conso::numeric / a.nb_produits_conso * 100, 1)
             WHEN a.nb_conso_borne_ok > 0 THEN NULL
             ELSE 0.0 END
    FROM agg a
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
sites_avec_inv AS (
    SELECT DISTINCT fi.site_id, to_char(fi.date_inventaire, 'YYYY-MM') AS mois_paqd
    FROM dqa.fact_inventaire fi
    JOIN dqa.dim_site s ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    WHERE fi.statut = 'fn'
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

-- ══ P6 ratio d'ajustements (transactions finalisées seulement) ════════════
CREATE MATERIALIZED VIEW mv_p6_ajustements AS
WITH mouvements AS (
    SELECT
        ft.site_id,
        ft.programme_id,
        to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') AS mois_paqd,
        (fl.issu_ajustement OR ft.nature IN ('ajustement_positif', 'ajustement_negatif')) AS est_ajustement
    FROM dqa.fact_transaction ft
    JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
    JOIN dqa.dim_site s ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
    WHERE ft.statut = 'fn'
      AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
      AND coalesce(ft.annulation, false) = false
)
SELECT
    site_id,
    CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
    mois_paqd,
    count(*)                                        AS nb_mouvements,
    count(*) FILTER (WHERE est_ajustement)          AS nb_ajustements,
    round(count(*) FILTER (WHERE est_ajustement)::numeric / nullif(count(*), 0) * 100, 1) AS ratio_ajustements_pct
FROM mouvements
GROUP BY GROUPING SETS ((site_id, programme_id, mois_paqd), (site_id, mois_paqd))
HAVING grouping(programme_id) = 1 OR programme_id IS NOT NULL;

CREATE UNIQUE INDEX mv_p6_uq ON mv_p6_ajustements (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ Score composite ══════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW mv_score_pilier AS
WITH sites_mois AS (
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p1_completude
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p2_promptitude
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p3_regularite
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p4_ecart
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p5_concordance
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p6_ajustements
),
base AS (
    SELECT
        sm.site_id, sm.mois_paqd, sm.programme_id,
        dqa.grille_pour_mois(sm.mois_paqd)                            AS grille_id,
        p1.p_completude, p2.p_promptitude,
        dqa.note_sous_composante(p3.taux_regularite_pct, 'regularite_saisie', sm.mois_paqd,
                                 coalesce(p3.est_district, false))     AS p_regularite,
        p4.p_ecart_sdu,
        dqa.note_sous_composante(p5.taux_concordance_pct, 'concordance', sm.mois_paqd)       AS p_concordance,
        dqa.note_sous_composante(p6.ratio_ajustements_pct, 'ratio_ajustements', sm.mois_paqd) AS p_ajustements,
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
    dqa.classer_composite(c.score_composite) AS classification
FROM base b
LEFT JOIN composite c ON c.site_id = b.site_id AND c.mois_paqd = b.mois_paqd
      AND coalesce(c.programme_id, '') = coalesce(b.programme_id, '');

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ Atteinte par sous-composante : sans la complétude d'inventaire ════════
-- La colonne `hist_score_site.sc_completude_inventaires` garde les valeurs
-- figées avant l'ADR 0019, elle n'est plus lue.
CREATE OR REPLACE VIEW v_sous_composante_atteinte AS
WITH lignes AS (
    SELECT h.site_id, h.mois_paqd, h.programme_id, sc.sous_composante, sc.valeur, gs.sens,
           CASE WHEN sc.sous_composante = 'regularite_saisie' AND gs.seuil_district IS NOT NULL
                     AND dqa.strate_de(ds.type_structure) = 'District'
                THEN gs.seuil_district ELSE gs.seuil END AS seuil
    FROM dqa.hist_score_site h
    JOIN dqa.dim_site ds ON ds.site_id = h.site_id
    CROSS JOIN LATERAL (VALUES
        ('completude_requisitions',  h.sc_completude_requisitions),
        ('completude_receptions',    h.sc_completude_receptions),
        ('promptitude_inventaires',  h.sc_promptitude_inventaires),
        ('promptitude_requisitions', h.sc_promptitude_requisitions),
        ('regularite_saisie',        h.sc_regularite_saisie),
        ('ecart_sdu',                h.sc_ecart_sdu),
        ('ecart_consommation',       h.sc_ecart_consommation),
        ('concordance',              h.sc_concordance),
        ('ratio_ajustements',        h.sc_ratio_ajustements)
    ) AS sc(sous_composante, valeur)
    LEFT JOIN dqa.grille_seuil_sous_composante gs
           ON gs.grille_id = h.grille_id AND gs.sous_composante = sc.sous_composante
)
SELECT site_id, mois_paqd, programme_id, sous_composante, valeur, seuil, sens,
       CASE
           WHEN valeur IS NULL THEN NULL
           WHEN sous_composante IN ('ecart_sdu', 'ecart_consommation') THEN least(valeur, 100)
           WHEN sens = 'inf' THEN least(seuil / nullif(valeur, 0), 1) * 100
           ELSE least(valeur / nullif(seuil, 0), 1) * 100
       END AS taux_atteinte,
       CASE
           WHEN valeur IS NULL OR seuil IS NULL THEN 'NON_CALCULABLE'
           WHEN dqa.seuil_atteint(valeur, seuil, sens) THEN 'CONFORME'
           ELSE 'ALERTE'
       END AS statut
FROM lignes;

-- ══ Synthèse « Rapports & inventaires » ═══════════════════════════════════
-- Inventaires : attendus, réalisés (tout inventaire finalisé du mois) et à
-- l'heure, tous trois lus de la mesure P2 depuis que P1 ne compte plus
-- l'inventaire (ADR 0019).
CREATE MATERIALIZED VIEW mv_synthese_rapports AS
WITH brut AS (
    SELECT b.mois_paqd, dqa.strate_de(s.type_structure) AS strate, s.region,
           b.programme_id, b.mesure, b.nb_attendu, b.nb_realise, b.nb_a_lheure
    FROM dqa.hist_pilier_brut b
    JOIN dqa.dim_site s ON s.site_id = b.site_id AND s.dans_perimetre_dqa
    WHERE b.programme_id IS NOT NULL
      AND b.mesure IN ('p1_requisitions', 'p2_requisitions', 'p2_inventaires')
)
SELECT
    mois_paqd,
    strate,
    CASE WHEN grouping(region) = 1 THEN NULL ELSE region END             AS region,
    CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
    coalesce(sum(nb_attendu)  FILTER (WHERE mesure = 'p1_requisitions'), 0)::int AS req_attendu,
    coalesce(sum(nb_realise)  FILTER (WHERE mesure = 'p1_requisitions'), 0)::int AS req_realise,
    coalesce(sum(nb_a_lheure) FILTER (WHERE mesure = 'p2_requisitions'), 0)::int AS req_a_lheure,
    coalesce(sum(nb_attendu)  FILTER (WHERE mesure = 'p2_inventaires'), 0)::int  AS inv_attendu,
    coalesce(sum(nb_realise)  FILTER (WHERE mesure = 'p2_inventaires'), 0)::int  AS inv_realise,
    coalesce(sum(nb_a_lheure) FILTER (WHERE mesure = 'p2_inventaires'), 0)::int  AS inv_a_lheure
FROM brut
GROUP BY GROUPING SETS (
    (mois_paqd, strate), (mois_paqd, strate, region),
    (mois_paqd, strate, programme_id), (mois_paqd, strate, region, programme_id))
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(programme_id) = 1 OR programme_id IS NOT NULL);

CREATE UNIQUE INDEX mv_synthese_rapports_uq
    ON mv_synthese_rapports
       (mois_paqd, strate, coalesce(region, ''), coalesce(programme_id, ''));

-- ══ Suivi hors score (ADR 0019) ═══════════════════════════════════════════
-- Réquisitions ordinaires finalisées couvrant M-1, rattachées au mois évalué
-- M, et celles qui ont reçu au moins une facture (quel que soit son statut).
CREATE VIEW v_suivi_requisitions_factures AS
SELECT fr.site_id,
       to_char((fr.mois_couvert || '-01')::date + interval '1 month', 'YYYY-MM') AS mois_paqd,
       count(*)::int AS nb_requisitions,
       (count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM dqa.fact_transaction ft
            WHERE ft.requisition_id = fr.requisition_id AND ft.site_id = fr.site_id
              AND ft.nature = 'facture_fournisseur' AND coalesce(ft.annulation, false) = false
       )))::int AS nb_avec_facture
FROM dqa.fact_requisition fr
JOIN dqa.dim_site s ON s.site_id = fr.site_id AND s.dans_perimetre_dqa
WHERE fr.type_requisition = 'Ordinaire' AND fr.statut = 'fn'
  AND (fr.programme_id IS NULL OR EXISTS (
        SELECT 1 FROM dqa.dim_site_programme sp
        WHERE sp.site_id = fr.site_id AND sp.programme_id = fr.programme_id AND sp.actif))
GROUP BY fr.site_id, 2;

-- Factures fournisseur non finalisées (cn, nw) et leur ancienneté depuis
-- l'émission, mesurée à la date d'extraction du dernier lot validé : les
-- données ne sont pas en temps réel, la date du jour surestimerait l'attente.
CREATE VIEW v_factures_en_attente AS
WITH reference AS (
    SELECT max(date_extraction) AS date_reference FROM dqa.import_lot WHERE statut = 'valide'
),
delai AS (
    SELECT valeur AS jours FROM dqa.parametre_suivi WHERE cle = 'delai_alerte_facture_jours'
)
SELECT ft.site_id, ft.transaction_id, ft.statut, ft.requisition_id, ft.commentaire,
       fr.mois_couvert,
       dqa.date_emission_facture(ft.date_finalisation_liee, ft.date_saisie) AS date_emission,
       r.date_reference,
       (r.date_reference - dqa.date_emission_facture(ft.date_finalisation_liee, ft.date_saisie))::int AS anciennete_jours,
       (r.date_reference - dqa.date_emission_facture(ft.date_finalisation_liee, ft.date_saisie)) > d.jours AS en_alerte
FROM dqa.fact_transaction ft
JOIN dqa.dim_site s ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
LEFT JOIN dqa.fact_requisition fr ON fr.requisition_id = ft.requisition_id
CROSS JOIN reference r
CROSS JOIN delai d
WHERE ft.nature = 'facture_fournisseur'
  AND ft.statut IN ('cn', 'nw')
  AND coalesce(ft.annulation, false) = false
  AND dqa.date_emission_facture(ft.date_finalisation_liee, ft.date_saisie) IS NOT NULL;

-- ══ Gel : comptes bruts à la nouvelle composition ═════════════════════════
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
    DELETE FROM dqa.hist_pilier_brut b
    WHERE b.mesure IN ('p1_requisitions', 'p1_receptions', 'p2_inventaires', 'p2_requisitions')
      AND EXISTS (SELECT 1 FROM dqa.mv_score_pilier sp
                   WHERE sp.site_id = b.site_id AND sp.mois_paqd = b.mois_paqd
                     AND sp.programme_id IS NOT DISTINCT FROM b.programme_id)
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

    REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
END;
$$;

-- ── Rattrapage : reconstruit tous les mois trouvables dans le core ───────
CALL dqa.rafraichir_et_geler(NULL);
