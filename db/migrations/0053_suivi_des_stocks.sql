-- ═══════════════════════════════════════════════════════════════════════════
--  Suivi des stocks : CMM reconstituée et stock projeté à une date choisie.
--
--  Pour chaque site du périmètre et chaque produit traceur, « comme si l'on
--  était à la date t » (inventaires et réceptions datés au plus tard de t) :
--    - bornes : fin = dernier inventaire au plus tard à t ; début = inventaire
--      le plus proche de fin - 90 jours, cherché entre fin - 105 jours et la
--      veille de fin (avec un inventaire par mois, le 4e en remontant) ;
--    - CMM reconstituée = (compté début + réceptions - compté fin)
--      ÷ jours × 30,4 : sorties physiques, pertes comprises ;
--    - CMM déclarée = dispensations (distributions pour un district) sur les
--      mêmes bornes ÷ jours × 30,4, pour comparaison ;
--    - stock projeté jour par jour depuis la borne de fin jusqu'à t + 90 :
--      compté + réceptions connues (jusqu'à t) - CMM ÷ 30,4 par jour,
--      plafonné à 0 (une réception après une rupture repart de 0) ;
--    - rupture prévue = premier jour à 0 à partir de t (t compris) ;
--      couverture = stock à t ÷ CMM jour.
--
--  Approximation d'orientation : retours et transferts non déduits, ruptures
--  non corrigées. Aucun effet sur le score. Inventaires et réceptions lus
--  selon les règles de mv_p4_ecart_produit (dernier inventaire finalisé du
--  jour, lots sommés ; factures fournisseur finalisées hors ajustement).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

-- Série journalière de tous les couples site × traceur à la date t. Base des
-- deux fonctions publiques : la liste et le détail d'un couple ne divergent pas.
CREATE FUNCTION dqa.series_stock(p_t date)
RETURNS TABLE (
    site_id               text,
    produit_id            text,
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
traceurs AS (
    SELECT p.produit_id
    FROM dqa.dim_produit p
    JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
),
-- Un stock compté par (site, produit, jour) : le dernier inventaire finalisé
-- du jour, tous programmes confondus, lots sommés.
inventaires AS (
    SELECT site_id, produit_id, date_inventaire, comptee
    FROM (
        SELECT fi.site_id, fil.produit_id, fi.date_inventaire,
               sum(fil.quantite_comptee) AS comptee,
               row_number() OVER (
                   PARTITION BY fi.site_id, fil.produit_id, fi.date_inventaire
                   ORDER BY fi.heure_inventaire DESC NULLS LAST,
                            fi.numero_inventaire DESC NULLS LAST, fi.inventaire_id DESC) AS rang
        FROM dqa.fact_inventaire fi
        JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
        JOIN perimetre pe ON pe.site_id = fi.site_id
        JOIN traceurs tr  ON tr.produit_id = fil.produit_id
        WHERE fi.statut = 'fn' AND fi.date_inventaire <= p_t
        GROUP BY fi.site_id, fil.produit_id, fi.date_inventaire, fi.inventaire_id,
                 fi.heure_inventaire, fi.numero_inventaire
    ) x
    WHERE rang = 1
),
fin AS (
    SELECT DISTINCT ON (site_id, produit_id) site_id, produit_id,
           date_inventaire AS date_fin, coalesce(comptee, 0) AS stock_fin
    FROM inventaires
    ORDER BY site_id, produit_id, date_inventaire DESC
),
debut AS (
    SELECT DISTINCT ON (f.site_id, f.produit_id) f.site_id, f.produit_id,
           i.date_inventaire AS date_debut, coalesce(i.comptee, 0) AS stock_debut
    FROM fin f
    JOIN inventaires i ON i.site_id = f.site_id AND i.produit_id = f.produit_id
     AND i.date_inventaire BETWEEN f.date_fin - 105 AND f.date_fin - 1
    -- le plus proche de fin - 90 ; à égalité, le plus ancien
    ORDER BY f.site_id, f.produit_id,
             abs(i.date_inventaire - (f.date_fin - 90)), i.date_inventaire
),
-- Mouvements par (site, produit, jour) : réceptions et sorties déclarées.
mouvements AS MATERIALIZED (
    SELECT ft.site_id, l.produit_id,
           CASE WHEN ft.nature = 'facture_fournisseur'
                THEN dqa.date_reception_facture(ft.date_finalisation, ft.date_confirmation, ft.date_saisie)
                ELSE coalesce(ft.date_confirmation, ft.date_saisie)
           END AS jour,
           coalesce(sum(l.quantite_unitaire) FILTER (WHERE ft.nature = 'facture_fournisseur'), 0) AS reception,
           coalesce(sum(l.quantite_unitaire) FILTER (WHERE ft.nature = 'dispensation'), 0)        AS dispensation,
           coalesce(sum(l.quantite_unitaire) FILTER (WHERE ft.nature = 'distribution'), 0)        AS distribution
    FROM dqa.fact_transaction ft
    JOIN dqa.fact_ligne_transaction l ON l.transaction_id = ft.transaction_id
    JOIN traceurs tr ON tr.produit_id = l.produit_id
    WHERE ft.nature IN ('facture_fournisseur', 'dispensation', 'distribution')
      AND ft.statut = 'fn'
      AND NOT coalesce(ft.annulation, false)
      AND NOT (ft.nature = 'facture_fournisseur' AND coalesce(l.issu_ajustement, false))
    GROUP BY 1, 2, 3
),
bornes AS (
    SELECT f.site_id, f.produit_id, pe.est_district,
           d.date_debut, d.stock_debut, f.date_fin, f.stock_fin,
           (f.date_fin - d.date_debut) AS jours,
           coalesce(sum(m.reception), 0) AS receptions,
           coalesce(sum(CASE WHEN pe.est_district THEN m.distribution ELSE m.dispensation END), 0) AS declaree
    FROM fin f
    JOIN perimetre pe ON pe.site_id = f.site_id
    LEFT JOIN debut d ON d.site_id = f.site_id AND d.produit_id = f.produit_id
    LEFT JOIN mouvements m ON m.site_id = f.site_id AND m.produit_id = f.produit_id
     AND m.jour > d.date_debut AND m.jour <= f.date_fin
    GROUP BY f.site_id, f.produit_id, pe.est_district, d.date_debut, d.stock_debut, f.date_fin, f.stock_fin
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
    SELECT c.site_id, c.produit_id, g.jour,
           CASE WHEN g.jour > c.date_fin AND g.jour <= p_t THEN coalesce(m.reception, 0) ELSE 0 END AS reception
    FROM cmm c
    CROSS JOIN LATERAL (SELECT j::date AS jour FROM generate_series(c.date_fin, p_t + 90, interval '1 day') j) g
    LEFT JOIN mouvements m ON m.site_id = c.site_id AND m.produit_id = c.produit_id AND m.jour = g.jour
),
-- Marche plafonnée à 0 : brut = compté + cumul (réceptions - CMM jour) ;
-- projeté = brut - min(0, plus bas brut atteint jusque-là).
marche AS (
    SELECT j.site_id, j.produit_id, j.jour, j.reception,
           c.stock_fin
             + sum(j.reception - CASE WHEN j.jour > c.date_fin THEN coalesce(c.cmm_r, 0) / 30.4 ELSE 0 END)
               OVER (PARTITION BY j.site_id, j.produit_id ORDER BY j.jour) AS brut
    FROM jours j
    JOIN cmm c ON c.site_id = j.site_id AND c.produit_id = j.produit_id
)
SELECT c.site_id, c.produit_id, c.date_debut, c.stock_debut, c.date_fin, c.stock_fin,
       c.receptions, c.declaree, c.cmm_r, c.cmm_d, c.raison,
       m.jour, m.reception,
       CASE WHEN c.cmm_r IS NULL THEN NULL
            ELSE m.brut - least(0, min(m.brut) OVER (PARTITION BY m.site_id, m.produit_id ORDER BY m.jour))
       END AS stock_projete
FROM cmm c
JOIN marche m ON m.site_id = c.site_id AND m.produit_id = c.produit_id
$$;

COMMENT ON FUNCTION dqa.series_stock(date) IS
    'Stock projeté jour par jour de chaque couple site × produit traceur, calculé à la date t (données postérieures à t ignorées). Base de stocks_a_date et serie_stock.';

-- ── Liste : un couple site × produit traceur à la date t ──────────────────
CREATE FUNCTION dqa.stocks_a_date(p_t date)
RETURNS TABLE (
    site_id             text,
    produit_id          text,
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
    couverture_jours    numeric
)
LANGUAGE sql STABLE AS $$
WITH s AS MATERIALIZED (SELECT * FROM dqa.series_stock(p_t)),
couples AS (
    SELECT site_id, produit_id, date_debut, stock_debut, date_fin, stock_fin,
           receptions_bornes, declaree_bornes, cmm_reconstituee, cmm_declaree, raison_non_calcul,
           sum(reception_jour)                             AS receptions_apres_fin,
           max(stock_projete) FILTER (WHERE jour = p_t)    AS stock_t,
           -- à partir de t : une rupture passée suivie d'une réception n'est plus à prévoir
           min(jour) FILTER (WHERE stock_projete <= 0 AND jour >= p_t) AS rupture
    FROM s
    GROUP BY site_id, produit_id, date_debut, stock_debut, date_fin, stock_fin,
             receptions_bornes, declaree_bornes, cmm_reconstituee, cmm_declaree, raison_non_calcul
),
-- Programme parent : celui du dernier inventaire du produit au site (au plus
-- tard à t), à défaut celui de son dernier mouvement.
programme_parent AS (
    SELECT DISTINCT ON (c.site_id, c.produit_id) c.site_id, c.produit_id, x.programme_id
    FROM couples c
    JOIN LATERAL (
        SELECT fi.programme_id, fi.date_inventaire AS d, 1 AS priorite
        FROM dqa.fact_inventaire fi
        JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
        WHERE fi.site_id = c.site_id AND fil.produit_id = c.produit_id
          AND fi.statut = 'fn' AND fi.programme_id IS NOT NULL AND fi.date_inventaire <= p_t
        UNION ALL
        SELECT ft.programme_id, coalesce(ft.date_confirmation, ft.date_saisie), 2
        FROM dqa.fact_transaction ft
        JOIN dqa.fact_ligne_transaction l ON l.transaction_id = ft.transaction_id
        WHERE ft.site_id = c.site_id AND l.produit_id = c.produit_id
          AND ft.programme_id IS NOT NULL AND coalesce(ft.date_confirmation, ft.date_saisie) <= p_t
    ) x ON true
    ORDER BY c.site_id, c.produit_id, x.priorite, x.d DESC
)
SELECT c.site_id, c.produit_id, p.produit_code, coalesce(tr.libelle, p.produit_nom),
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
       round(c.stock_t / nullif(c.cmm_reconstituee / 30.4, 0), 0)
FROM couples c
JOIN dqa.dim_produit p ON p.produit_id = c.produit_id
LEFT JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code
LEFT JOIN programme_parent pp ON pp.site_id = c.site_id AND pp.produit_id = c.produit_id
$$;

COMMENT ON FUNCTION dqa.stocks_a_date(date) IS
    'Suivi des stocks à la date t : CMM reconstituée et déclarée, bornes, stock projeté à t, rupture prévue, couverture, programme parent, par couple site × produit traceur.';

-- ── Détail : série journalière d'un couple ────────────────────────────────
CREATE FUNCTION dqa.serie_stock(p_site text, p_produit text, p_t date)
RETURNS TABLE (jour date, reception numeric, stock_projete numeric)
LANGUAGE sql STABLE AS $$
    SELECT s.jour, s.reception_jour, round(s.stock_projete, 1)
    FROM dqa.series_stock(p_t) s
    WHERE s.site_id = p_site AND s.produit_id = p_produit
    ORDER BY s.jour
$$;

-- Date t par défaut : fin de fenêtre du dernier import validé.
CREATE FUNCTION dqa.date_reference_stocks()
RETURNS date LANGUAGE sql STABLE AS $$
    SELECT coalesce(max(fenetre_fin), CURRENT_DATE)
    FROM dqa.import_lot WHERE statut = 'valide'
$$;
