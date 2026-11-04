-- ═══════════════════════════════════════════════════════════════════════════
--  Suivi des stocks : photos mSupply et statut de rupture.
--
--  1. Comparaison aux photos. La photo de stock mSupply (`fact_stock_snapshot`)
--     est le stock théorique du logiciel, qui ignore les pertes non saisies.
--     Par couple site × produit : la dernière photo connue à t et postérieure
--     à la borne de fin, le stock mSupply (lots sommés) et le stock projeté ce
--     jour-là. Écart affiché sans seuil.
--
--  2. Statut à t, d'après la couverture (stock projeté ÷ CMM journalière) :
--       en_rupture        stock projeté déjà à 0 ;
--       rupture_signalee  couverture ≤ seuil (15 jours, seuil inclus) ;
--       a_surveiller      couverture au-delà du seuil, rupture prévue dans
--                         l'horizon de projection (t + 90 jours) ;
--       sans_risque       aucune rupture prévue dans l'horizon ;
--       non_calculable    CMM non calculable.
--     Seuil dans `parametre_suivi` (`seuil_couverture_rupture_jours`).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

INSERT INTO parametre_suivi (cle, valeur, description) VALUES
    ('seuil_couverture_rupture_jours', 15,
     'Couverture (jours de stock projeté) à partir de laquelle, et en dessous, une rupture est signalée ; au-delà, une rupture prévue dans les 90 jours est à surveiller.');

DROP FUNCTION dqa.stocks_a_date(date);

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
    couverture_jours    numeric,
    statut              text,
    date_photo          date,
    stock_msupply       numeric,
    stock_projete_photo numeric
)
LANGUAGE sql STABLE AS $$
WITH s AS MATERIALIZED (SELECT * FROM dqa.series_stock(p_t)),
fins AS (
    SELECT DISTINCT site_id, produit_id, date_fin FROM s
),
-- Dernière photo de stock mSupply connue à t et postérieure à la borne de fin
-- (une photo plus ancienne précède le point de départ de la projection).
photo AS (
    SELECT DISTINCT ON (f.site_id, f.produit_id) f.site_id, f.produit_id, ph.date_photo, ph.q
    FROM fins f
    JOIN (SELECT site_id, produit_id, date_photo, sum(quantite_disponible) AS q
          FROM dqa.fact_stock_snapshot
          WHERE date_photo <= p_t
          GROUP BY 1, 2, 3) ph
      ON ph.site_id = f.site_id AND ph.produit_id = f.produit_id AND ph.date_photo >= f.date_fin
    ORDER BY f.site_id, f.produit_id, ph.date_photo DESC
),
couples AS (
    SELECT s.site_id, s.produit_id, s.date_debut, s.stock_debut, s.date_fin, s.stock_fin,
           s.receptions_bornes, s.declaree_bornes, s.cmm_reconstituee, s.cmm_declaree, s.raison_non_calcul,
           ph.date_photo, ph.q AS stock_msupply,
           sum(s.reception_jour)                                   AS receptions_apres_fin,
           max(s.stock_projete) FILTER (WHERE s.jour = p_t)        AS stock_t,
           max(s.stock_projete) FILTER (WHERE s.jour = ph.date_photo) AS stock_photo,
           -- à partir de t : une rupture passée suivie d'une réception n'est plus à prévoir
           min(s.jour) FILTER (WHERE s.stock_projete <= 0 AND s.jour >= p_t) AS rupture
    FROM s
    LEFT JOIN photo ph ON ph.site_id = s.site_id AND ph.produit_id = s.produit_id
    GROUP BY s.site_id, s.produit_id, s.date_debut, s.stock_debut, s.date_fin, s.stock_fin,
             s.receptions_bornes, s.declaree_bornes, s.cmm_reconstituee, s.cmm_declaree, s.raison_non_calcul,
             ph.date_photo, ph.q
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
),
seuil AS (
    SELECT coalesce(
        (SELECT valeur FROM dqa.parametre_suivi WHERE cle = 'seuil_couverture_rupture_jours'), 15) AS jours
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
JOIN dqa.dim_produit p ON p.produit_id = c.produit_id
LEFT JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code
LEFT JOIN programme_parent pp ON pp.site_id = c.site_id AND pp.produit_id = c.produit_id
$$;

COMMENT ON FUNCTION dqa.stocks_a_date(date) IS
    'Suivi des stocks à la date t : CMM reconstituée et déclarée, bornes, stock projeté à t, rupture prévue, couverture, statut (en rupture, signalée, à surveiller, sans risque, non calculable), programme parent, et dernière photo de stock mSupply comparée au stock projeté ce jour-là.';
