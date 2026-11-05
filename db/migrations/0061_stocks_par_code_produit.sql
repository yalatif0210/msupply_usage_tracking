-- ═══════════════════════════════════════════════════════════════════════════
--  Suivi des stocks par code produit : un code = un produit (complément de
--  l'ADR 0016).
--
--  Les vues de lecture (0055) et le calcul de la CMM reconstituée, de la
--  projection et du statut travaillaient par article mSupply (`produit_id`).
--  Un code porté par deux articles donnait deux lignes, chacune avec une CMM
--  et une rupture partielles. Tout passe par `produit_code` :
--    - stock compté d'un article un jour donné : son dernier inventaire du
--      jour (heure, numéro) ;
--    - stock compté d'un code un jour où l'un de ses articles est compté :
--      somme, pour chaque article déjà compté, de son dernier comptage à ce
--      jour (un article inventorié à part, la veille ou à une autre heure,
--      n'est pas perdu) ;
--    - mouvements et photos : sommés par code.
--  Les quantités sont en unités de dispensation (ADR 0017).
--
--  `v_mouvement_stock_jour` expose aussi les autres entrées (ajustements
--  positifs, retours client) et sorties enregistrées (ajustements négatifs,
--  retours fournisseur), lues par les produits écartés (migration 0062).
--  `mv_produit_ecarte`, emportée par le remplacement de la vue, est recréée
--  en 0062.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP FUNCTION dqa.serie_stock(text, text, date);
DROP FUNCTION dqa.stocks_a_date(date);
DROP FUNCTION dqa.series_stock(date);
DROP VIEW dqa.v_stock_compte_jour;
DROP VIEW dqa.v_photo_stock_jour;
DROP VIEW dqa.v_mouvement_stock_jour CASCADE;

-- Stock compté d'un article un jour donné : le dernier inventaire finalisé du
-- jour (heure, numéro), lots sommés.
CREATE VIEW dqa.v_stock_compte_article_jour AS
SELECT site_id, produit_id, produit_code, date_inventaire, comptee
FROM (
    SELECT fi.site_id, fil.produit_id, p.produit_code, fi.date_inventaire,
           sum(fil.quantite_comptee) AS comptee,
           row_number() OVER (
               PARTITION BY fi.site_id, fil.produit_id, fi.date_inventaire
               ORDER BY fi.heure_inventaire DESC NULLS LAST,
                        fi.numero_inventaire DESC NULLS LAST, fi.inventaire_id DESC) AS rang
    FROM dqa.fact_inventaire fi
    JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
    JOIN dqa.dim_site s ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    JOIN dqa.dim_produit p ON p.produit_id = fil.produit_id
    JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
    WHERE fi.statut = 'fn'
    GROUP BY fi.site_id, fil.produit_id, p.produit_code, fi.date_inventaire, fi.inventaire_id,
             fi.heure_inventaire, fi.numero_inventaire
) x
WHERE rang = 1;

-- Stock compté d'un code, chaque jour où l'un de ses articles est compté :
-- somme du dernier comptage connu à ce jour de chacun de ses articles.
CREATE VIEW dqa.v_stock_compte_jour AS
WITH jours AS (
    SELECT DISTINCT site_id, produit_code, date_inventaire FROM dqa.v_stock_compte_article_jour
)
SELECT j.site_id, j.produit_code, j.date_inventaire, sum(d.comptee) AS comptee
FROM jours j
CROSS JOIN LATERAL (
    SELECT DISTINCT ON (a.produit_id) a.comptee
    FROM dqa.v_stock_compte_article_jour a
    WHERE a.site_id = j.site_id AND a.produit_code = j.produit_code
      AND a.date_inventaire <= j.date_inventaire
    ORDER BY a.produit_id, a.date_inventaire DESC
) d
GROUP BY j.site_id, j.produit_code, j.date_inventaire;

CREATE VIEW dqa.v_mouvement_stock_jour AS
SELECT ft.site_id, p.produit_code,
       CASE WHEN ft.nature = 'facture_fournisseur'
            THEN dqa.date_reception_facture(ft.date_finalisation, ft.date_confirmation, ft.date_saisie)
            ELSE coalesce(ft.date_confirmation, ft.date_saisie)
       END AS jour,
       coalesce(sum(l.quantite_unitaire) FILTER (WHERE ft.nature = 'facture_fournisseur'), 0) AS reception,
       coalesce(sum(l.quantite_unitaire) FILTER (WHERE ft.nature = 'dispensation'), 0)        AS dispensation,
       coalesce(sum(l.quantite_unitaire) FILTER (WHERE ft.nature = 'distribution'), 0)        AS distribution,
       -- autres entrées et sorties enregistrées, en valeur absolue (le signe
       -- d'une ligne d'ajustement varie selon la saisie)
       coalesce(sum(abs(l.quantite_unitaire)) FILTER (
           WHERE ft.nature IN ('ajustement_positif', 'retour_client')), 0)                     AS entree_autre,
       coalesce(sum(abs(l.quantite_unitaire)) FILTER (
           WHERE ft.nature IN ('ajustement_negatif', 'retour_fournisseur')), 0)                AS sortie_autre
FROM dqa.fact_transaction ft
JOIN dqa.fact_ligne_transaction l ON l.transaction_id = ft.transaction_id
JOIN dqa.dim_site s ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
JOIN dqa.dim_produit p ON p.produit_id = l.produit_id
JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
WHERE ft.nature IN ('facture_fournisseur', 'dispensation', 'distribution',
                    'ajustement_positif', 'ajustement_negatif', 'retour_client', 'retour_fournisseur')
  AND ft.statut = 'fn'
  AND NOT coalesce(ft.annulation, false)
  AND NOT (ft.nature = 'facture_fournisseur' AND coalesce(l.issu_ajustement, false))
GROUP BY 1, 2, 3;

CREATE VIEW dqa.v_photo_stock_jour AS
SELECT ph.site_id, p.produit_code, ph.date_photo, sum(ph.quantite_disponible) AS stock_msupply
FROM dqa.fact_stock_snapshot ph
JOIN dqa.dim_site s ON s.site_id = ph.site_id AND s.dans_perimetre_dqa
JOIN dqa.dim_produit p ON p.produit_id = ph.produit_id
JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
GROUP BY 1, 2, 3;

CREATE FUNCTION dqa.series_stock(p_t date)
RETURNS TABLE (
    site_id               text,
    produit_code            text,
    date_debut            date,
    stock_debut           numeric,
    date_fin              date,
    stock_fin             numeric,
    receptions_bornes     numeric,
    declaree_bornes       numeric,
    cmm_reconstituee      numeric,
    cmm_declaree          numeric,
    raison_non_calcul     text,
    jour                  date,
    reception_jour        numeric,
    stock_projete         numeric
)
LANGUAGE sql STABLE AS $$
WITH perimetre AS (
    SELECT s.site_id, dqa.est_district(s.type_structure) AS est_district
    FROM dqa.dim_site s WHERE s.dans_perimetre_dqa
),
inventaires AS (
    SELECT site_id, produit_code, date_inventaire, comptee
    FROM dqa.v_stock_compte_jour WHERE date_inventaire <= p_t
),
fin AS (
    SELECT DISTINCT ON (site_id, produit_code) site_id, produit_code,
           date_inventaire AS date_fin, coalesce(comptee, 0) AS stock_fin
    FROM inventaires
    ORDER BY site_id, produit_code, date_inventaire DESC
),
debut AS (
    SELECT DISTINCT ON (f.site_id, f.produit_code) f.site_id, f.produit_code,
           i.date_inventaire AS date_debut, coalesce(i.comptee, 0) AS stock_debut
    FROM fin f
    JOIN inventaires i ON i.site_id = f.site_id AND i.produit_code = f.produit_code
     AND i.date_inventaire BETWEEN f.date_fin - 105 AND f.date_fin - 1
    -- le plus proche de fin - 90 ; à égalité, le plus ancien
    ORDER BY f.site_id, f.produit_code,
             abs(i.date_inventaire - (f.date_fin - 90)), i.date_inventaire
),
mouvements AS MATERIALIZED (
    SELECT site_id, produit_code, jour, reception, dispensation, distribution
    FROM dqa.v_mouvement_stock_jour
),
bornes AS (
    SELECT f.site_id, f.produit_code, pe.est_district,
           d.date_debut, d.stock_debut, f.date_fin, f.stock_fin,
           (f.date_fin - d.date_debut) AS jours,
           coalesce(sum(m.reception), 0) AS receptions,
           coalesce(sum(CASE WHEN pe.est_district THEN m.distribution ELSE m.dispensation END), 0) AS declaree
    FROM fin f
    JOIN perimetre pe ON pe.site_id = f.site_id
    LEFT JOIN debut d ON d.site_id = f.site_id AND d.produit_code = f.produit_code
    LEFT JOIN mouvements m ON m.site_id = f.site_id AND m.produit_code = f.produit_code
     AND m.jour > d.date_debut AND m.jour <= f.date_fin
    GROUP BY f.site_id, f.produit_code, pe.est_district, d.date_debut, d.stock_debut, f.date_fin, f.stock_fin
),
cmm AS (
    SELECT b.*,
           CASE WHEN b.date_debut IS NULL THEN 'un_seul_inventaire'
                WHEN b.stock_debut + b.receptions - b.stock_fin <= 0 THEN 'sorties_non_positives'
           END AS raison,
           CASE WHEN b.date_debut IS NOT NULL AND b.stock_debut + b.receptions - b.stock_fin > 0
                THEN (b.stock_debut + b.receptions - b.stock_fin) / b.jours * 30.4
           END AS cmm_r,
           CASE WHEN b.date_debut IS NOT NULL THEN b.declaree / b.jours * 30.4 END AS cmm_d
    FROM bornes b
),
-- Réceptions connues après la borne de fin, jusqu'à t : aucune au-delà.
jours AS (
    SELECT c.site_id, c.produit_code, g.jour,
           CASE WHEN g.jour > c.date_fin AND g.jour <= p_t THEN coalesce(m.reception, 0) ELSE 0 END AS reception
    FROM cmm c
    CROSS JOIN LATERAL (SELECT j::date AS jour FROM generate_series(c.date_fin, p_t + 90, interval '1 day') j) g
    LEFT JOIN mouvements m ON m.site_id = c.site_id AND m.produit_code = c.produit_code AND m.jour = g.jour
),
-- Marche plafonnée à 0 : brut = compté + cumul (réceptions - CMM jour) ;
-- projeté = brut - min(0, plus bas brut atteint jusque-là).
marche AS (
    SELECT j.site_id, j.produit_code, j.jour, j.reception,
           c.stock_fin
             + sum(j.reception - CASE WHEN j.jour > c.date_fin THEN coalesce(c.cmm_r, 0) / 30.4 ELSE 0 END)
               OVER (PARTITION BY j.site_id, j.produit_code ORDER BY j.jour) AS brut
    FROM jours j
    JOIN cmm c ON c.site_id = j.site_id AND c.produit_code = j.produit_code
)
SELECT c.site_id, c.produit_code, c.date_debut, c.stock_debut, c.date_fin, c.stock_fin,
       c.receptions, c.declaree, c.cmm_r, c.cmm_d, c.raison,
       m.jour, m.reception,
       CASE WHEN c.cmm_r IS NULL THEN NULL
            ELSE m.brut - least(0, min(m.brut) OVER (PARTITION BY m.site_id, m.produit_code ORDER BY m.jour))
       END AS stock_projete
FROM cmm c
JOIN marche m ON m.site_id = c.site_id AND m.produit_code = c.produit_code
$$;

CREATE FUNCTION dqa.stocks_a_date(p_t date)
RETURNS TABLE (
    site_id             text,
    produit_code        text,
    libelle             text,
    programme_id        text,
    date_debut          date,
    stock_debut         numeric,
    date_fin            date,
    stock_fin           numeric,
    jours               integer,
    nb_mois             integer,
    receptions          numeric,
    sorties_reconstituees numeric,
    declaree            numeric,
    cmm_reconstituee    numeric,
    cmm_declaree        numeric,
    raison_non_calcul   text,
    receptions_apres_fin numeric,
    stock_projete_t     numeric,
    date_rupture        date,
    couverture_jours    numeric,
    statut              text,
    date_photo          date,
    stock_msupply       numeric,
    stock_projete_photo numeric
)
LANGUAGE sql STABLE AS $$
WITH s AS MATERIALIZED (SELECT * FROM dqa.series_stock(p_t)),
fins AS (
    SELECT DISTINCT site_id, produit_code, date_fin FROM s
),
-- Dernière photo de stock mSupply connue à t et postérieure à la borne de fin
-- (une photo plus ancienne précède le point de départ de la projection).
photo AS (
    SELECT DISTINCT ON (f.site_id, f.produit_code) f.site_id, f.produit_code, ph.date_photo, ph.q
    FROM fins f
    JOIN (SELECT site_id, produit_code, date_photo, stock_msupply AS q
          FROM dqa.v_photo_stock_jour
          WHERE date_photo <= p_t) ph
      ON ph.site_id = f.site_id AND ph.produit_code = f.produit_code AND ph.date_photo >= f.date_fin
    ORDER BY f.site_id, f.produit_code, ph.date_photo DESC
),
couples AS (
    SELECT s.site_id, s.produit_code, s.date_debut, s.stock_debut, s.date_fin, s.stock_fin,
           s.receptions_bornes, s.declaree_bornes, s.cmm_reconstituee, s.cmm_declaree, s.raison_non_calcul,
           ph.date_photo, ph.q AS stock_msupply,
           sum(s.reception_jour)                                   AS receptions_apres_fin,
           max(s.stock_projete) FILTER (WHERE s.jour = p_t)        AS stock_t,
           max(s.stock_projete) FILTER (WHERE s.jour = ph.date_photo) AS stock_photo,
           -- à partir de t : une rupture passée suivie d'une réception n'est plus à prévoir
           min(s.jour) FILTER (WHERE s.stock_projete <= 0 AND s.jour >= p_t) AS rupture
    FROM s
    LEFT JOIN photo ph ON ph.site_id = s.site_id AND ph.produit_code = s.produit_code
    GROUP BY s.site_id, s.produit_code, s.date_debut, s.stock_debut, s.date_fin, s.stock_fin,
             s.receptions_bornes, s.declaree_bornes, s.cmm_reconstituee, s.cmm_declaree, s.raison_non_calcul,
             ph.date_photo, ph.q
),
-- Programme parent : celui du dernier inventaire du produit au site (au plus
-- tard à t), à défaut celui de son dernier mouvement.
programme_parent AS (
    SELECT DISTINCT ON (c.site_id, c.produit_code) c.site_id, c.produit_code, x.programme_id
    FROM couples c
    JOIN LATERAL (
        SELECT fi.programme_id, fi.date_inventaire AS d, 1 AS priorite
        FROM dqa.fact_inventaire fi
        JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
        JOIN dqa.dim_produit p ON p.produit_id = fil.produit_id
        WHERE fi.site_id = c.site_id AND p.produit_code = c.produit_code
          AND fi.statut = 'fn' AND fi.programme_id IS NOT NULL AND fi.date_inventaire <= p_t
        UNION ALL
        SELECT ft.programme_id, coalesce(ft.date_confirmation, ft.date_saisie), 2
        FROM dqa.fact_transaction ft
        JOIN dqa.fact_ligne_transaction l ON l.transaction_id = ft.transaction_id
        JOIN dqa.dim_produit p ON p.produit_id = l.produit_id
        WHERE ft.site_id = c.site_id AND p.produit_code = c.produit_code
          AND ft.programme_id IS NOT NULL AND coalesce(ft.date_confirmation, ft.date_saisie) <= p_t
    ) x ON true
    ORDER BY c.site_id, c.produit_code, x.priorite, x.d DESC
),
seuil AS (
    SELECT coalesce(
        (SELECT valeur FROM dqa.parametre_suivi WHERE cle = 'seuil_couverture_rupture_jours'), 15) AS jours
)
SELECT c.site_id, c.produit_code, coalesce(tr.libelle, c.produit_code),
       pp.programme_id,
       c.date_debut, c.stock_debut, c.date_fin, c.stock_fin,
       (c.date_fin - c.date_debut),
       round((c.date_fin - c.date_debut) / 30.4)::int,
       c.receptions_bornes,
       CASE WHEN c.date_debut IS NOT NULL THEN c.stock_debut + c.receptions_bornes - c.stock_fin END,
       c.declaree_bornes,
       round(c.cmm_reconstituee, 1), round(c.cmm_declaree, 1),
       c.raison_non_calcul,
       c.receptions_apres_fin,
       round(c.stock_t, 1),
       c.rupture,
       round(c.stock_t / nullif(c.cmm_reconstituee / 30.4, 0), 0),
       CASE
           WHEN c.cmm_reconstituee IS NULL THEN 'non_calculable'
           WHEN c.stock_t <= 0 THEN 'en_rupture'
           -- couverture exacte, pas arrondie : 15,4 jours n'est pas « 15 jours ou moins »
           WHEN c.stock_t / (c.cmm_reconstituee / 30.4) <= (SELECT jours FROM seuil) THEN 'rupture_signalee'
           WHEN c.rupture IS NOT NULL THEN 'a_surveiller'
           ELSE 'sans_risque'
       END,
       c.date_photo,
       c.stock_msupply,
       round(c.stock_photo, 1)
FROM couples c
LEFT JOIN dqa.dim_produit_traceur tr ON tr.produit_code = c.produit_code
LEFT JOIN programme_parent pp ON pp.site_id = c.site_id AND pp.produit_code = c.produit_code
$$;

CREATE FUNCTION dqa.serie_stock(p_site text, p_code text, p_t date)
RETURNS TABLE (jour date, reception numeric, stock_projete numeric)
LANGUAGE sql STABLE AS $$
    SELECT s.jour, s.reception_jour, round(s.stock_projete, 1)
    FROM dqa.series_stock(p_t) s
    WHERE s.site_id = p_site AND s.produit_code = p_code
    ORDER BY s.jour
$$;

COMMENT ON FUNCTION dqa.series_stock(date) IS
    'Stock projeté jour par jour de chaque couple site × code produit traceur, calculé à la date t (données postérieures à t ignorées). Base de stocks_a_date et serie_stock.';
COMMENT ON FUNCTION dqa.stocks_a_date(date) IS
    'Suivi des stocks à la date t, par couple site × code produit : CMM reconstituée et déclarée, bornes, stock projeté à t, rupture prévue, couverture, statut, programme parent, dernière photo de stock mSupply comparée au stock projeté ce jour-là.';
COMMENT ON FUNCTION dqa.serie_stock(text, text, date) IS
    'Série journalière (réception, stock projeté) d''un couple site × code produit à la date t, pour le détail.';
