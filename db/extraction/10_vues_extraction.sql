-- ═══════════════════════════════════════════════════════════════════════════
--  Vues d'extraction DQA — une vue par onglet du classeur
--  Base cible : mSupply de la DAP. Ré-exécutable (CREATE OR REPLACE).
--  Prérequis : 01_config.sql + dqa_parametre_extraction / dqa_perimetre /
--  dqa_traceur alimentées (voir 00_README.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- ── SITES ──────────────────────────────────────────────────────────────────
-- Tous les magasins actifs. `dans_perimetre_dqa` = présence dans dqa_perimetre.
CREATE OR REPLACE VIEW v_dqa_sites AS
SELECT
    s.id                              AS site_id,
    s.code                            AS site_code,
    s.name                            AS site_nom,
    NULLIF(d.description, '')          AS district,
    NULLIF(reg.description, '')        AS region,
    NULLIF(ts.description, '')         AS type_structure,
    CASE WHEN s.disabled THEN 'NON' ELSE 'OUI' END           AS actif,
    CASE WHEN pm.site_code IS NOT NULL THEN 'OUI' ELSE 'NON' END AS dans_perimetre_dqa,
    CASE NULLIF(ts.description, '')
        WHEN 'CSU'  THEN 5 WHEN 'CSR' THEN 5 WHEN 'ESPC' THEN 5
        WHEN 'HG'   THEN 7 WHEN 'CHR' THEN 7
        ELSE 10
    END                               AS jour_limite_requisition
FROM store s
JOIN name n                        ON n.id = s.name_id
LEFT JOIN name_category1 d         ON d.id  = NULLIF(n.category1_id, '')
LEFT JOIN name_category1_level2 reg ON reg.id = NULLIF(d.parent_id, '')
LEFT JOIN name_category3 ts        ON ts.id = NULLIF(n.category3_id, '')
LEFT JOIN dqa_perimetre pm         ON pm.site_code = s.code
WHERE s.disabled = false;


-- ── SITE_PROGRAMME ─────────────────────────────────────────────────────────
-- Programmes de santé (list_master.isprogram) rattachés à chaque site du périmètre.
CREATE OR REPLACE VIEW v_dqa_site_programme AS
SELECT DISTINCT
    s.id                 AS site_id,
    lm.id                AS programme_id,
    NULLIF(lm.code, '')  AS programme_code,
    lm.description       AS programme_nom,
    CASE WHEN lm.inactive THEN 'NON' ELSE 'OUI' END AS actif
FROM list_master_name_join lmnj
JOIN list_master lm   ON lm.id = lmnj.list_master_id AND lm.isprogram = true
JOIN store s          ON s.name_id = lmnj.name_id AND s.disabled = false
JOIN dqa_perimetre pm ON pm.site_code = s.code;


-- ── PRODUITS ───────────────────────────────────────────────────────────────
-- Tous les produits. `est_traceur` n'est PAS fourni (géré côté tableau de bord).
CREATE OR REPLACE VIEW v_dqa_produits AS
SELECT
    i.id               AS produit_id,
    i.code             AS produit_code,
    i.item_name        AS produit_nom,
    NULLIF(u.units, '') AS unite,
    ( SELECT string_agg(DISTINCT lm.code, ';' ORDER BY lm.code)
      FROM list_master_line lml
      JOIN list_master lm ON lm.id = lml.item_master_id AND lm.isprogram = true
      WHERE lml.item_id = i.id )                            AS programmes
FROM item i
LEFT JOIN unit u ON u.id = NULLIF(i.unit_id, '');


-- ── TRANSACTIONS ───────────────────────────────────────────────────────────
-- En-têtes de transactions dont finalised_date (à défaut confirm_date) est dans
-- la fenêtre. `nature` dérivée : ajustement (lien stock_take.invad_* ou lignes
-- is_from_inventory_adjustment) > dispensation > distribution > facture > etc.
CREATE OR REPLACE VIEW v_dqa_transactions AS
WITH p AS (SELECT * FROM dqa_parametre_extraction),
invad AS (
    SELECT tx_id, min(nat) AS nat
    FROM (
        SELECT NULLIF(invad_additions_id, '')  AS tx_id, 'ajustement_positif' AS nat
        FROM stock_take WHERE NULLIF(invad_additions_id, '') IS NOT NULL
        UNION ALL
        SELECT NULLIF(invad_reductions_id, ''), 'ajustement_negatif'
        FROM stock_take WHERE NULLIF(invad_reductions_id, '') IS NOT NULL
    ) z
    GROUP BY tx_id
),
adj_line AS (
    SELECT DISTINCT transaction_id AS tx_id
    FROM trans_line
    WHERE is_from_inventory_adjustment = true
)
SELECT
    t.id                                  AS transaction_id,
    t.store_id                            AS site_id,
    COALESCE(
        iv.nat,
        CASE WHEN al.tx_id IS NOT NULL
             THEN CASE WHEN t.type = 'si' THEN 'ajustement_positif' ELSE 'ajustement_negatif' END
        END,
        CASE
            WHEN t.type = 'ci' AND t.mode = 'dispensary' THEN 'dispensation'
            WHEN t.type = 'ci' AND t.mode = 'store'      THEN 'distribution'
            WHEN t.type = 'si'                           THEN 'facture_fournisseur'
            WHEN t.type = 'rc'                           THEN 'reception'
            WHEN t.type = 'sc'                           THEN 'retour_fournisseur'
            WHEN t.type = 'cc'                           THEN 'retour_client'
            ELSE 'autre'
        END
    )                                     AS nature,
    NULLIF(t.programid, '')               AS programme_id,
    t.type                                AS type_transaction,
    NULLIF(t.mode, '')                    AS mode,
    t.status                              AS statut,
    CASE WHEN t.is_cancellation THEN 'OUI' ELSE 'NON' END AS annulation,
    to_char(t.entry_date,   'YYYY-MM-DD') AS date_saisie,
    to_char(t.confirm_date, 'YYYY-MM-DD') AS date_confirmation,
    to_char(t.ship_date,    'YYYY-MM-DD') AS date_livraison,
    NULLIF(t.requisition_id, '')          AS requisition_id,
    NULLIF(t.goods_received_id, '')       AS goods_received_id,
    NULLIF(t.comment, '')                 AS commentaire
FROM transact t
JOIN store st         ON st.id = t.store_id
JOIN dqa_perimetre pm ON pm.site_code = st.code
CROSS JOIN p
LEFT JOIN invad iv    ON iv.tx_id = t.id
LEFT JOIN adj_line al ON al.tx_id = t.id
WHERE COALESCE(t.finalised_date, t.confirm_date) BETWEEN p.fenetre_debut AND p.fenetre_fin;


-- ── LIGNES_TRANSACTIONS ────────────────────────────────────────────────────
-- Lignes des transactions ci-dessus, restreintes aux produits traceurs.
CREATE OR REPLACE VIEW v_dqa_lignes_transactions AS
SELECT
    tl.id                        AS ligne_id,
    tl.transaction_id            AS transaction_id,
    tl.item_id                   AS produit_id,
    NULLIF(tl.program_id, '')    AS programme_id,
    NULLIF(tl.batch, '')         AS lot,
    tl.quantity                  AS quantite,
    tl.pack_size                 AS taille_conditionnement,
    NULLIF(tl.type, '')          AS type_ligne,
    CASE WHEN tl.is_from_inventory_adjustment THEN 'OUI' ELSE 'NON' END AS issu_ajustement,
    to_char(tl.expiry_date, 'YYYY-MM-DD') AS date_peremption
FROM trans_line tl
JOIN v_dqa_transactions tx ON tx.transaction_id = tl.transaction_id
JOIN item i                ON i.id = tl.item_id
JOIN dqa_traceur tr        ON tr.item_code = i.code;


-- ── STOCK_ACTUEL ───────────────────────────────────────────────────────────
-- Stock disponible par lot dans les sites du périmètre, produits traceurs.
CREATE OR REPLACE VIEW v_dqa_stock_actuel AS
SELECT
    il.store_id                          AS site_id,
    il.item_id                           AS produit_id,
    NULLIF(il.batch, '')                 AS lot,
    il.available                         AS quantite_disponible,
    to_char(il.expiry_date, 'YYYY-MM-DD') AS date_peremption,
    to_char(p.date_extraction, 'YYYY-MM-DD') AS date_photo
FROM item_line il
CROSS JOIN dqa_parametre_extraction p
JOIN store st         ON st.id = il.store_id
JOIN dqa_perimetre pm ON pm.site_code = st.code
JOIN item i           ON i.id = il.item_id
JOIN dqa_traceur tr   ON tr.item_code = i.code
WHERE il.available <> 0;


-- ── INVENTAIRES ────────────────────────────────────────────────────────────
-- En-têtes d'inventaires (stock_take) datés dans la fenêtre, sites du périmètre.
CREATE OR REPLACE VIEW v_dqa_inventaires AS
SELECT
    stk.id                          AS inventaire_id,
    stk.store_id                    AS site_id,
    NULLIF(stk.programid, '')       AS programme_id,
    to_char(stk.stock_take_date, 'YYYY-MM-DD') AS date_inventaire,
    stk.status                      AS statut,
    NULLIF(stk.invad_additions_id, '')  AS invad_additions_id,
    NULLIF(stk.invad_reductions_id, '') AS invad_reductions_id
FROM stock_take stk
CROSS JOIN dqa_parametre_extraction p
JOIN store st         ON st.id = stk.store_id
JOIN dqa_perimetre pm ON pm.site_code = st.code
WHERE stk.stock_take_date BETWEEN p.fenetre_debut AND p.fenetre_fin;


-- ── INVENTAIRE_LIGNES ──────────────────────────────────────────────────────
-- Grain (inventaire, produit, lot). Le GROUP BY collapse tout doublon à la source.
CREATE OR REPLACE VIEW v_dqa_inventaire_lignes AS
SELECT
    stl.stock_take_id            AS inventaire_id,
    stl.item_id                  AS produit_id,
    NULLIF(stl.batch, '')        AS lot,
    SUM(stl.snapshot_qty * COALESCE(NULLIF(stl.snapshot_packsize, 0), 1)) AS quantite_theorique,
    SUM(stl.stock_take_qty)      AS quantite_comptee
FROM stock_take_lines stl
JOIN v_dqa_inventaires inv ON inv.inventaire_id = stl.stock_take_id
JOIN item i                ON i.id = stl.item_id
JOIN dqa_traceur tr        ON tr.item_code = i.code
GROUP BY stl.stock_take_id, stl.item_id, NULLIF(stl.batch, '');


-- ── REQUISITIONS ───────────────────────────────────────────────────────────
-- Réquisitions que le site adresse à son fournisseur (type = 'request'),
-- touchant la fenêtre par la date de soumission ou par la période couverte.
CREATE OR REPLACE VIEW v_dqa_requisitions AS
SELECT
    r.id                                  AS requisition_id,
    r.store_id                            AS site_id,
    NULLIF(r.programid, '')               AS programme_id,
    NULLIF(r.periodid, '')                AS periode_id,
    to_char(COALESCE(pe.startdate, date_trunc('month', r.date_stock_take)::date),
            'YYYY-MM-DD')                 AS mois_couvert_debut,
    to_char(COALESCE(pe.enddate,
            (date_trunc('month', r.date_stock_take)
                 + INTERVAL '1 month' - INTERVAL '1 day')::date),
            'YYYY-MM-DD')                 AS mois_couvert_fin,
    to_char(r.date_entered,        'YYYY-MM-DD') AS date_soumission,
    to_char(r.date_stock_take,     'YYYY-MM-DD') AS date_inventaire_ref,
    to_char(r.date_order_received, 'YYYY-MM-DD') AS date_reception,
    r.status                              AS statut,
    NULLIF(r.authorisationstatus, '')     AS statut_autorisation,
    CASE WHEN r.is_emergency THEN 'Urgente' ELSE 'Ordinaire' END AS type_requisition
FROM requisition r
CROSS JOIN dqa_parametre_extraction p
JOIN store st         ON st.id = r.store_id
JOIN dqa_perimetre pm ON pm.site_code = st.code
LEFT JOIN period pe   ON pe.id = NULLIF(r.periodid, '')
WHERE r.type = 'request'
  AND ( r.date_entered BETWEEN p.fenetre_debut AND p.fenetre_fin
        OR COALESCE(pe.enddate, r.date_stock_take) BETWEEN p.fenetre_debut AND p.fenetre_fin );


-- ── METADATA ───────────────────────────────────────────────────────────────
-- Clé / valeur. Les compteurs nb_lignes_* sont calculés depuis les vues
-- ci-dessus : cohérents par construction.
CREATE OR REPLACE VIEW v_dqa_metadata AS
WITH p AS (SELECT * FROM dqa_parametre_extraction)
SELECT champ, valeur FROM (
    SELECT 1  AS ord, 'date_extraction'  AS champ, to_char(p.date_extraction, 'YYYY-MM-DD') AS valeur FROM p
    UNION ALL SELECT 2,  'cycle_paqd',      p.cycle_paqd                          FROM p
    UNION ALL SELECT 3,  'mois_paqd',       p.mois_paqd                           FROM p
    UNION ALL SELECT 4,  'mois_debut',      to_char(p.mois_debut, 'YYYY-MM-DD')   FROM p
    UNION ALL SELECT 5,  'mois_fin',        to_char(p.mois_fin, 'YYYY-MM-DD')     FROM p
    UNION ALL SELECT 6,  'fenetre_debut',   to_char(p.fenetre_debut, 'YYYY-MM-DD') FROM p
    UNION ALL SELECT 7,  'fenetre_fin',     to_char(p.fenetre_fin, 'YYYY-MM-DD')  FROM p
    UNION ALL SELECT 8,  'version_msupply', p.version_msupply                     FROM p
    UNION ALL SELECT 9,  'realisee_par',    p.realisee_par                        FROM p
    UNION ALL SELECT 10, 'nb_lignes_SITES',              (SELECT count(*)::text FROM v_dqa_sites)
    UNION ALL SELECT 11, 'nb_lignes_SITE_PROGRAMME',      (SELECT count(*)::text FROM v_dqa_site_programme)
    UNION ALL SELECT 12, 'nb_lignes_PRODUITS',            (SELECT count(*)::text FROM v_dqa_produits)
    UNION ALL SELECT 13, 'nb_lignes_TRANSACTIONS',        (SELECT count(*)::text FROM v_dqa_transactions)
    UNION ALL SELECT 14, 'nb_lignes_LIGNES_TRANSACTIONS', (SELECT count(*)::text FROM v_dqa_lignes_transactions)
    UNION ALL SELECT 15, 'nb_lignes_STOCK_ACTUEL',        (SELECT count(*)::text FROM v_dqa_stock_actuel)
    UNION ALL SELECT 16, 'nb_lignes_INVENTAIRES',         (SELECT count(*)::text FROM v_dqa_inventaires)
    UNION ALL SELECT 17, 'nb_lignes_INVENTAIRE_LIGNES',   (SELECT count(*)::text FROM v_dqa_inventaire_lignes)
    UNION ALL SELECT 18, 'nb_lignes_REQUISITIONS',        (SELECT count(*)::text FROM v_dqa_requisitions)
) x
ORDER BY ord;
