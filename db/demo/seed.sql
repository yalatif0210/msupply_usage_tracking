-- ═══════════════════════════════════════════════════════════════════════════
--  Jeu de démonstration — chantier « données brutes des piliers »
--
--  Six sites de strates variées, un mois PAQD (2026-05), des inventaires et
--  mouvements sur quatre produits traceurs, puis le vrai gel
--  (`rafraichir_et_geler`). Rejouable : purge le core avant d'insérer.
--
--  Ce qu'on peut voir après le seed (connexion coordination / coordination-2026) :
--   - fiche site : couples attendu/réalisé dans les cartes, dépliants P1..P6,
--     bandeau calendaire P3, tableau produit P4·P5, avertissement ré-import
--     (SITE-REIMP) ;
--   - /synthese onglet « Rapports & inventaires » : strates CHU/CHR/HG/ESPC/CS/District ;
--   - /admin/strates : "Institut" non classé ;
--   - fiche produit-mois : depuis un code produit du tableau P4·P5.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

BEGIN;

TRUNCATE dqa.import_lot, dqa.dim_site, dqa.dim_programme, dqa.dim_produit
    RESTART IDENTITY CASCADE;

-- ── Lot d'import (mois PAQD 2026-05, cycle C2) ─────────────────────────────
INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut, importe_le)
VALUES ('demo_2026-05.xlsx', '2026-C2', '2026-05', '2026-05-01', '2026-05-31', 'valide', now());

-- ── Programmes ────────────────────────────────────────────────────────────
INSERT INTO dqa.dim_programme (programme_id, programme_code, programme_nom, lot_id_source) VALUES
    ('PRG-VIH',  'VIH',  'VIH',       1),
    ('PRG-PALU', 'PALU', 'Paludisme', 1);

-- ── Sites (une strate chacun ; « Institut » restera « Non classé ») ────────
INSERT INTO dqa.dim_site
    (site_id, site_code, site_nom, district, region, type_structure, dans_perimetre_dqa, jour_limite_requisition, lot_id_source)
VALUES
    ('SITE-CHU',   'C-CHU',  'CHU de Treichville',           'ABIDJAN 1',  'ABIDJAN',  'CHU',               true, 10, 1),
    ('SITE-CHR',   'C-CHR',  'CHR de Bouaké',                'BOUAKE NORD','GBEKE',    'CHR',               true, 7,  1),
    ('SITE-HG',    'C-HG',   'HG d''Abengourou',             'ABENGOUROU', 'INDENIE-DJUABLIN', 'HG',        true, 7,  1),
    ('SITE-ESPC',  'C-ESPC', 'ESPC de Yamoussoukro',         'YAMOUSSOUKRO','BELIER',  'ESPC',              true, 5,  1),
    ('SITE-CSU',   'C-CSU',  'CSU de Korhogo',               'KORHOGO',    'PORO',     'CSU',               true, 5,  1),
    ('SITE-DIST',  'C-DIST', 'District sanitaire de Man',    'MAN',        'TONKPI',   'District sanitaire',true, 10, 1),
    -- strate inconnue : tombera sous « Non classé » tant que /admin/strates ne la mappe pas
    ('SITE-INST',  'C-INST', 'Institut Pasteur de Côte d''Ivoire', 'ABIDJAN 2', 'ABIDJAN', 'Institut',      true, 10, 1),
    -- site à ré-importer après le gel : sert l'avertissement « données du core modifiées »
    ('SITE-REIMP', 'C-RIM',  'CSU de Daloa (ré-importé)',    'DALOA',      'HAUT-SASSANDRA', 'CSU',         true, 5,  1);

INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif, lot_id_source)
SELECT s.site_id, p.programme_id, true, 1
FROM (VALUES
    ('SITE-CHU','PRG-VIH'), ('SITE-CHU','PRG-PALU'),
    ('SITE-CHR','PRG-VIH'), ('SITE-CHR','PRG-PALU'),
    ('SITE-HG','PRG-VIH'),  ('SITE-HG','PRG-PALU'),
    ('SITE-ESPC','PRG-PALU'),
    ('SITE-CSU','PRG-PALU'),
    ('SITE-DIST','PRG-VIH'), ('SITE-DIST','PRG-PALU'),
    ('SITE-INST','PRG-VIH'),
    ('SITE-REIMP','PRG-PALU')
) AS s(site_id, programme_id)
JOIN dqa.dim_programme p ON p.programme_id = s.programme_id;

-- ── Produits (4 traceurs de la liste réelle, migration 0013) ──────────────
INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom, unite, lot_id_source) VALUES
    ('ITM-ARV', '3100014-ARV',  'DOLUTEGRAVIR/LAMIVUDINE/TENOFOVIR 50/300/300 mg comp. BTE/90', 'BTE', 1),
    ('ITM-ALU', '3050064-PNLP', 'ARTEMETHER/LUMEFANTRINE 20/120 mg ADULTE BTE/30',              'BTE', 1),
    ('ITM-TDR', '4030616-PNLP', 'TEST DE DIAGNOSTIC RAPIDE DU PALUDISME KIT/10',                'KIT', 1),
    ('ITM-HIV', '4040328-TRC',  'WONDFO HIV 1/2 TEST KIT/25',                                   'KIT', 1);

-- ── Helpers d'insertion (inventaires, lignes, transactions) ───────────────
-- Inventaire finalisé
CREATE TEMP TABLE _inventaire (inv text, site text, prog text, jour date);
INSERT INTO _inventaire VALUES
    -- CHU : deux inventaires bornants (début + fin), fin dans les 3 derniers jours → P2 OK
    ('INV-CHU-1','SITE-CHU','PRG-VIH','2026-05-02'), ('INV-CHU-2','SITE-CHU','PRG-VIH','2026-05-30'),
    ('INV-CHU-3','SITE-CHU','PRG-PALU','2026-05-30'),
    -- CHR : un seul inventaire, hors des 3 derniers jours → P2 inventaire en retard
    ('INV-CHR-1','SITE-CHR','PRG-PALU','2026-05-12'),
    -- HG : deux inventaires bornants VIH
    ('INV-HG-1','SITE-HG','PRG-VIH','2026-05-03'), ('INV-HG-2','SITE-HG','PRG-VIH','2026-05-29'),
    -- ESPC : inventaire à l'heure
    ('INV-ESPC-1','SITE-ESPC','PRG-PALU','2026-05-31'),
    -- CSU : inventaire présent mais réquisition absente → « rapport manquant »
    ('INV-CSU-1','SITE-CSU','PRG-PALU','2026-05-28'),
    -- DIST : inventaire à l'heure
    ('INV-DIST-1','SITE-DIST','PRG-PALU','2026-05-29'),
    -- INST : inventaire à l'heure
    ('INV-INST-1','SITE-INST','PRG-VIH','2026-05-30'),
    -- REIMP : inventaire à l'heure
    ('INV-RIM-1','SITE-REIMP','PRG-PALU','2026-05-30');

INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
SELECT inv, site, prog, jour, 'fn', 1 FROM _inventaire;

-- Lignes d'inventaire : (inv, produit, théorique, compté). NULL = quantité absente.
CREATE TEMP TABLE _inv_ligne (inv text, item text, theo numeric, cnt numeric);
INSERT INTO _inv_ligne VALUES
    ('INV-CHU-1','ITM-ARV', 500, 500), ('INV-CHU-2','ITM-ARV', 420, 420),   -- conso reconstituée OK
    ('INV-CHU-1','ITM-HIV', 200, 198), ('INV-CHU-2','ITM-HIV', 150, 150),
    ('INV-CHU-3','ITM-ALU', 300, 285),                                       -- SDU 5 % → hors tolérance 2 %
    ('INV-CHU-3','ITM-TDR', 100, NULL),                                      -- quantité absente → concordance NULL
    ('INV-CHR-1','ITM-ALU', 250, 250), ('INV-CHR-1','ITM-TDR', 80, 79),
    ('INV-HG-1','ITM-ARV', 360, 360),  ('INV-HG-2','ITM-ARV', 300, 260),     -- SDU hors tolérance
    ('INV-HG-1','ITM-HIV', 120, 120),  ('INV-HG-2','ITM-HIV', 90, 90),
    ('INV-ESPC-1','ITM-ALU', 140, 138), ('INV-ESPC-1','ITM-TDR', 60, 60),
    ('INV-CSU-1','ITM-ALU', 70, 68),
    ('INV-DIST-1','ITM-ALU', 90, 90),   ('INV-DIST-1','ITM-TDR', 45, 40),    -- SDU hors tolérance
    ('INV-INST-1','ITM-ARV', 210, 210),
    ('INV-INST-1','ITM-HIV', 75, 74),
    ('INV-RIM-1','ITM-ALU', 130, 130),  ('INV-RIM-1','ITM-TDR', 55, 55);

INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
SELECT inv, item, 'L1', theo, cnt, 1 FROM _inv_ligne;

-- Transactions : dispensations (P3), réceptions (P1), factures (P1), ajustements (P6).
CREATE TEMP TABLE _transaction (id text, site text, prog text, nature text, jour date, item text, qte numeric, adj boolean);
INSERT INTO _transaction VALUES
    -- CHU : une réception, une facture, un ajustement. Les dispensations sont
    -- ajoutées plus bas par generate_series (P3 conforme, ~24 jours / 31).
    ('TX-CHU-D4','SITE-CHU','PRG-VIH','dispensation','2026-05-11','ITM-HIV', 20, false),
    ('TX-CHU-D8','SITE-CHU','PRG-VIH','dispensation','2026-05-20','ITM-HIV', 12, false),
    ('TX-CHU-R1','SITE-CHU','PRG-VIH','reception','2026-05-10','ITM-ARV', 100, false),
    ('TX-CHU-F1','SITE-CHU','PRG-VIH','facture_fournisseur','2026-05-08', NULL, NULL, false),
    ('TX-CHU-A1','SITE-CHU','PRG-PALU','ajustement_negatif','2026-05-16','ITM-ALU', -15, true),
    -- CHR : peu de dispensations → P3 faible ; une réception
    ('TX-CHR-D1','SITE-CHR','PRG-PALU','dispensation','2026-05-07','ITM-ALU', 20, false),
    ('TX-CHR-D2','SITE-CHR','PRG-PALU','dispensation','2026-05-19','ITM-TDR', 15, false),
    ('TX-CHR-R1','SITE-CHR','PRG-PALU','reception','2026-05-14','ITM-ALU', 60, false),
    ('TX-CHR-F1','SITE-CHR','PRG-PALU','facture_fournisseur','2026-05-12', NULL, NULL, false),
    ('TX-CHR-F2','SITE-CHR','PRG-PALU','facture_fournisseur','2026-05-20', NULL, NULL, false),
    -- HG : dispensations moyennes ; deux ajustements
    ('TX-HG-D1','SITE-HG','PRG-VIH','dispensation','2026-05-05','ITM-ARV', 10, false),
    ('TX-HG-D2','SITE-HG','PRG-VIH','dispensation','2026-05-12','ITM-HIV', 8, false),
    ('TX-HG-D3','SITE-HG','PRG-VIH','dispensation','2026-05-21','ITM-ARV', 12, false),
    ('TX-HG-R1','SITE-HG','PRG-VIH','reception','2026-05-11','ITM-ARV', 40, false),
    ('TX-HG-A1','SITE-HG','PRG-VIH','ajustement_positif','2026-05-17','ITM-ARV', 5, true),
    ('TX-HG-A2','SITE-HG','PRG-VIH','ajustement_negatif','2026-05-24','ITM-HIV', -3, true),
    -- ESPC / DIST / INST / REIMP : quelques dispensations
    ('TX-ESPC-D1','SITE-ESPC','PRG-PALU','dispensation','2026-05-08','ITM-ALU', 6, false),
    ('TX-ESPC-D2','SITE-ESPC','PRG-PALU','dispensation','2026-05-22','ITM-TDR', 5, false),
    ('TX-DIST-D1','SITE-DIST','PRG-PALU','distribution','2026-05-10','ITM-ALU', 30, false),
    ('TX-DIST-D2','SITE-DIST','PRG-PALU','distribution','2026-05-23','ITM-TDR', 12, false),
    ('TX-INST-D1','SITE-INST','PRG-VIH','dispensation','2026-05-15','ITM-HIV', 9, false),
    ('TX-RIM-D1','SITE-REIMP','PRG-PALU','dispensation','2026-05-09','ITM-ALU', 7, false),
    ('TX-RIM-D2','SITE-REIMP','PRG-PALU','dispensation','2026-05-18','ITM-TDR', 4, false);

INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT id, site, nature, prog, 'fn', jour, jour, 1 FROM _transaction;

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT id || '-L', id, item, prog, qte, 1, adj, 1
FROM _transaction WHERE item IS NOT NULL;

-- CHU : dispensation d'ARV du lundi au samedi (24 jours de mai) → P3 conforme,
-- le bandeau calendaire montre les week-ends creux.
INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT 'TX-CHU-DA-' || to_char(j, 'DD'), 'SITE-CHU', 'dispensation', 'PRG-VIH', 'fn', j, j, 1
FROM generate_series(DATE '2026-05-01', DATE '2026-05-31', INTERVAL '1 day') AS j
WHERE extract(isodow FROM j) < 7;   -- exclut le dimanche

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT 'TX-CHU-DA-' || to_char(j, 'DD') || '-L', 'TX-CHU-DA-' || to_char(j, 'DD'),
       'ITM-ARV', 'PRG-VIH', 6 + (extract(day FROM j)::int % 5), 1, false, 1
FROM generate_series(DATE '2026-05-01', DATE '2026-05-31', INTERVAL '1 day') AS j
WHERE extract(isodow FROM j) < 7;

-- ── Réquisitions (rapports mensuels) : à l'heure, en retard, manquantes ───
--  Limite : mois M+1 + (jour_limite − 1). ESPC/CSU/... → 5, HG/CHR → 7, CHU/District → 10.
INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
VALUES
    ('REQ-CHU-VIH',  'SITE-CHU', 'PRG-VIH',  '2026-05', '2026-06-08', '2026-05-30', 'fn', 1),   -- à l'heure (≤ 10)
    ('REQ-CHU-PALU', 'SITE-CHU', 'PRG-PALU', '2026-05', '2026-06-15', '2026-05-30', 'fn', 1),   -- en retard
    ('REQ-CHR-PALU', 'SITE-CHR', 'PRG-PALU', '2026-05', '2026-06-06', '2026-05-12', 'fn', 1),   -- à l'heure (≤ 7)
    ('REQ-HG-VIH',   'SITE-HG',  'PRG-VIH',  '2026-05', '2026-06-04', '2026-05-29', 'fn', 1),   -- à l'heure
    ('REQ-HG-PALU',  'SITE-HG',  'PRG-PALU', '2026-05', '2026-06-12', NULL,         'fn', 1),   -- en retard
    ('REQ-ESPC',     'SITE-ESPC','PRG-PALU', '2026-05', '2026-06-05', '2026-05-31', 'fn', 1),   -- à l'heure (= 5)
    -- CSU : pas de réquisition → manquante
    ('REQ-DIST',     'SITE-DIST','PRG-PALU', '2026-05', '2026-06-09', '2026-05-29', 'fn', 1),   -- à l'heure
    ('REQ-INST',     'SITE-INST','PRG-VIH',  '2026-05', '2026-06-20', NULL,         'fn', 1),   -- en retard
    ('REQ-RIM',      'SITE-REIMP','PRG-PALU','2026-05', '2026-06-03', '2026-05-30', 'fn', 1);

-- ── Photos de stock (fiche produit-mois) ─────────────────────────────────
INSERT INTO dqa.fact_stock_snapshot (date_photo, site_id, produit_id, lot, quantite_disponible, lot_id_source)
VALUES
    ('2026-05-08', 'SITE-CHU', 'ITM-ARV', 'L1', 470, 1),
    ('2026-05-15', 'SITE-CHU', 'ITM-ARV', 'L1', 445, 1),
    ('2026-05-22', 'SITE-CHU', 'ITM-ARV', 'L1', 430, 1),
    ('2026-05-15', 'SITE-CHU', 'ITM-HIV', 'L1', 175, 1);

-- ── Gel : passe par la vraie procédure ──────────────────────────────────
CALL dqa.rafraichir_et_geler(1);

COMMIT;

-- ── Ré-import « après le gel » de SITE-REIMP : bouge le core sans regeler ──
--  Simule un correctif d'extraction postérieur au gel : le détail live du
--  pilier changera, l'avertissement « données modifiées depuis le gel »
--  apparaîtra sur la fiche de SITE-REIMP.
UPDATE dqa.fact_transaction
   SET maj_le = now() + interval '1 day'
 WHERE site_id = 'SITE-REIMP';
UPDATE dqa.fact_inventaire
   SET maj_le = now() + interval '1 day'
 WHERE site_id = 'SITE-REIMP';

\echo 'Seed de démonstration appliqué : 8 sites, mois PAQD 2026-05.'
