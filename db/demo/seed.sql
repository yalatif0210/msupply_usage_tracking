-- ═══════════════════════════════════════════════════════════════════════════
--  Jeu de démonstration · chantier « données brutes des piliers »
--
--  Huit sites de strates variées, la fin du cycle C2 (2026-05 à 2026-08,
--  M+1 à M+4) et le tout début du cycle C3 (2026-09, M+1), des inventaires
--  et mouvements sur quatre produits traceurs, un lot d'import par mois plus
--  un cinquième lot « extraction du 5 septembre » à fenêtre de 45 jours.
--  Rejouable : purge le core avant d'insérer.
--
--  Narratif : la plupart des sites progressent de mois en mois (écarts SDU
--  résorbés, réquisitions rattrapées). CHR (réquisition longtemps en retard,
--  P3 faible) et CSU (réquisition jamais soumise) restent des points de
--  vigilance chroniques. Août et septembre sont **en cours** au regard de la
--  date du jour (2026-09-05). Le lot du 5 septembre chevauche deux mois : il
--  apporte les premiers jours de septembre ET les réquisitions d'août de CHU
--  et District, enfin soumises. Le gel corrige alors le score d'août (encore
--  ouvert) à la hausse, sans que le lot ait à redéclarer août (ADR 0010).
--
--  Ce qu'on peut voir après le seed (connexion coordination / coordination-2026) :
--   - sélecteur « Mois affiché » : cinq mois (2026-05 à 2026-09) ;
--   - repère « Mois en cours · score provisoire » sur 2026-08 et 2026-09 ;
--   - septembre : score très bas (5 jours seulement), qui n'est pas un verdict ;
--   - fiche site : couples attendu/réalisé dans les cartes, dépliants P1..P6,
--     bandeau calendaire P3, tableau produit P4·P5, avertissement ré-import
--     (SITE-REIMP), « Progression (score composite) » d'un mois à l'autre ;
--   - courbe de progression nationale sur cinq points ;
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
    ('INV-CHR-1','ITM-ALU', 250, 242), ('INV-CHR-1','ITM-TDR', 80, 79),        -- ~3 % : écart SDU chronique jusqu'en juillet
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

-- ═══════════════════════════════════════════════════════════════════════════
--  Second mois PAQD (2026-06, M+2 du cycle C2) — pour que le sélecteur
--  « Mois affiché » (tableau de bord, synthèse, fiches site/produit) ait
--  vraiment un mois passé à montrer, et que la « Progression (score
--  composite) » affiche un écart réel. Narratif : la plupart des sites
--  progressent (SDU rentré dans la tolérance, réquisitions à l'heure) ;
--  CHR et CSU restent des points de vigilance (persistants d'un mois à
--  l'autre), pour un tableau de bord qui ne soit pas uniformément vert.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut, importe_le)
VALUES ('demo_2026-06.xlsx', '2026-C2', '2026-06', '2026-06-01', '2026-06-30', 'valide', now());

CREATE TEMP TABLE _inventaire2 (inv text, site text, prog text, jour date);
INSERT INTO _inventaire2 VALUES
    ('INV2-CHU-1','SITE-CHU','PRG-VIH','2026-06-02'),  ('INV2-CHU-2','SITE-CHU','PRG-VIH','2026-06-29'),
    ('INV2-CHU-3','SITE-CHU','PRG-PALU','2026-06-29'),
    ('INV2-CHR-1','SITE-CHR','PRG-PALU','2026-06-11'), -- toujours hors des 3 derniers jours
    ('INV2-HG-1','SITE-HG','PRG-VIH','2026-06-03'),    ('INV2-HG-2','SITE-HG','PRG-VIH','2026-06-28'),
    ('INV2-ESPC-1','SITE-ESPC','PRG-PALU','2026-06-30'),
    ('INV2-CSU-1','SITE-CSU','PRG-PALU','2026-06-27'), -- réquisition toujours absente
    ('INV2-DIST-1','SITE-DIST','PRG-PALU','2026-06-28'),
    ('INV2-INST-1','SITE-INST','PRG-VIH','2026-06-29'),
    ('INV2-RIM-1','SITE-REIMP','PRG-PALU','2026-06-29');

INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
SELECT inv, site, prog, jour, 'fn', 2 FROM _inventaire2;

-- Lignes d'inventaire : écarts SDU resserrés dans la tolérance pour CHU, HG,
-- DIST (amélioration vs mai) ; CHR reste hors tolérance.
CREATE TEMP TABLE _inv_ligne2 (inv text, item text, theo numeric, cnt numeric);
INSERT INTO _inv_ligne2 VALUES
    ('INV2-CHU-1','ITM-ARV', 520, 520), ('INV2-CHU-2','ITM-ARV', 440, 440),
    ('INV2-CHU-1','ITM-HIV', 205, 204), ('INV2-CHU-2','ITM-HIV', 155, 155),
    ('INV2-CHU-3','ITM-ALU', 300, 297),                                      -- 1 % : rentré dans la tolérance
    ('INV2-CHU-3','ITM-TDR', 100, 99),
    ('INV2-CHR-1','ITM-ALU', 250, 240),                                      -- 4 % : CHR toujours hors tolérance
    ('INV2-CHR-1','ITM-TDR', 80, 79),
    ('INV2-HG-1','ITM-ARV', 310, 310),  ('INV2-HG-2','ITM-ARV', 305, 300),   -- 1,6 % : rentré dans la tolérance
    ('INV2-HG-1','ITM-HIV', 125, 125),  ('INV2-HG-2','ITM-HIV', 95, 95),
    ('INV2-ESPC-1','ITM-ALU', 145, 144), ('INV2-ESPC-1','ITM-TDR', 62, 62),
    ('INV2-CSU-1','ITM-ALU', 72, 70),
    ('INV2-DIST-1','ITM-ALU', 95, 95),   ('INV2-DIST-1','ITM-TDR', 45, 45),  -- écart résorbé
    ('INV2-INST-1','ITM-ARV', 215, 214),
    ('INV2-INST-1','ITM-HIV', 78, 78),
    ('INV2-RIM-1','ITM-ALU', 132, 132), ('INV2-RIM-1','ITM-TDR', 56, 56);

INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
SELECT inv, item, 'L1', theo, cnt, 2 FROM _inv_ligne2;

-- Transactions : mêmes rôles qu'en mai (réceptions, factures, ajustements),
-- dispensations toujours faibles pour CHR (P3 reste en alerte).
CREATE TEMP TABLE _transaction2 (id text, site text, prog text, nature text, jour date, item text, qte numeric, adj boolean);
INSERT INTO _transaction2 VALUES
    ('TX2-CHU-R1','SITE-CHU','PRG-VIH','reception','2026-06-09','ITM-ARV', 110, false),
    ('TX2-CHU-F1','SITE-CHU','PRG-VIH','facture_fournisseur','2026-06-07', NULL, NULL, false),
    ('TX2-CHU-A1','SITE-CHU','PRG-PALU','ajustement_negatif','2026-06-15','ITM-ALU', -12, true),
    ('TX2-CHR-D1','SITE-CHR','PRG-PALU','dispensation','2026-06-06','ITM-ALU', 18, false),
    ('TX2-CHR-D2','SITE-CHR','PRG-PALU','dispensation','2026-06-18','ITM-TDR', 14, false),
    ('TX2-CHR-R1','SITE-CHR','PRG-PALU','reception','2026-06-13','ITM-ALU', 65, false),
    ('TX2-CHR-F1','SITE-CHR','PRG-PALU','facture_fournisseur','2026-06-11', NULL, NULL, false),
    ('TX2-HG-D1','SITE-HG','PRG-VIH','dispensation','2026-06-04','ITM-ARV', 11, false),
    ('TX2-HG-D2','SITE-HG','PRG-VIH','dispensation','2026-06-13','ITM-HIV', 9, false),
    ('TX2-HG-D3','SITE-HG','PRG-VIH','dispensation','2026-06-20','ITM-ARV', 13, false),
    ('TX2-HG-R1','SITE-HG','PRG-VIH','reception','2026-06-10','ITM-ARV', 42, false),
    ('TX2-HG-A1','SITE-HG','PRG-VIH','ajustement_positif','2026-06-16','ITM-ARV', 4, true),
    ('TX2-ESPC-D1','SITE-ESPC','PRG-PALU','dispensation','2026-06-07','ITM-ALU', 7, false),
    ('TX2-ESPC-D2','SITE-ESPC','PRG-PALU','dispensation','2026-06-21','ITM-TDR', 6, false),
    ('TX2-DIST-D1','SITE-DIST','PRG-PALU','distribution','2026-06-09','ITM-ALU', 32, false),
    ('TX2-DIST-D2','SITE-DIST','PRG-PALU','distribution','2026-06-22','ITM-TDR', 13, false),
    ('TX2-INST-D1','SITE-INST','PRG-VIH','dispensation','2026-06-14','ITM-HIV', 10, false),
    ('TX2-RIM-D1','SITE-REIMP','PRG-PALU','dispensation','2026-06-08','ITM-ALU', 8, false),
    ('TX2-RIM-D2','SITE-REIMP','PRG-PALU','dispensation','2026-06-17','ITM-TDR', 5, false);

INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT id, site, nature, prog, 'fn', jour, jour, 2 FROM _transaction2;

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT id || '-L', id, item, prog, qte, 1, adj, 2
FROM _transaction2 WHERE item IS NOT NULL;

-- CHU : dispensation d'ARV du lundi au samedi sur tout juin → P3 conforme.
INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT 'TX2-CHU-DA-' || to_char(j, 'DD'), 'SITE-CHU', 'dispensation', 'PRG-VIH', 'fn', j, j, 2
FROM generate_series(DATE '2026-06-01', DATE '2026-06-30', INTERVAL '1 day') AS j
WHERE extract(isodow FROM j) < 7;

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT 'TX2-CHU-DA-' || to_char(j, 'DD') || '-L', 'TX2-CHU-DA-' || to_char(j, 'DD'),
       'ITM-ARV', 'PRG-VIH', 7 + (extract(day FROM j)::int % 4), 1, false, 2
FROM generate_series(DATE '2026-06-01', DATE '2026-06-30', INTERVAL '1 day') AS j
WHERE extract(isodow FROM j) < 7;

-- Réquisitions : la plupart passent à l'heure ce mois-ci (CHU-PALU, HG-PALU,
-- INST rattrapent leur retard de mai) ; CHR reste en retard, CSU toujours
-- sans réquisition.
INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
VALUES
    ('REQ2-CHU-VIH',  'SITE-CHU', 'PRG-VIH',  '2026-06', '2026-07-08', '2026-06-29', 'fn', 2),   -- à l'heure (≤ 10)
    ('REQ2-CHU-PALU', 'SITE-CHU', 'PRG-PALU', '2026-06', '2026-07-05', '2026-06-29', 'fn', 2),   -- à l'heure (amélioration)
    ('REQ2-CHR-PALU', 'SITE-CHR', 'PRG-PALU', '2026-06', '2026-07-09', '2026-06-11', 'fn', 2),   -- toujours en retard
    ('REQ2-HG-VIH',   'SITE-HG',  'PRG-VIH',  '2026-06', '2026-07-03', '2026-06-28', 'fn', 2),   -- à l'heure
    ('REQ2-HG-PALU',  'SITE-HG',  'PRG-PALU', '2026-06', '2026-07-04', NULL,         'fn', 2),   -- à l'heure (amélioration)
    ('REQ2-ESPC',     'SITE-ESPC','PRG-PALU', '2026-06', '2026-07-04', '2026-06-30', 'fn', 2),   -- à l'heure (= 5)
    -- CSU : toujours pas de réquisition → manquante
    ('REQ2-DIST',     'SITE-DIST','PRG-PALU', '2026-06', '2026-07-08', '2026-06-28', 'fn', 2),   -- à l'heure
    ('REQ2-INST',     'SITE-INST','PRG-VIH',  '2026-06', '2026-07-03', NULL,         'fn', 2),   -- à l'heure (amélioration)
    ('REQ2-RIM',      'SITE-REIMP','PRG-PALU','2026-06', '2026-07-02', '2026-06-29', 'fn', 2);

INSERT INTO dqa.fact_stock_snapshot (date_photo, site_id, produit_id, lot, quantite_disponible, lot_id_source)
VALUES
    ('2026-06-08', 'SITE-CHU', 'ITM-ARV', 'L1', 490, 2),
    ('2026-06-15', 'SITE-CHU', 'ITM-ARV', 'L1', 465, 2),
    ('2026-06-22', 'SITE-CHU', 'ITM-ARV', 'L1', 450, 2),
    ('2026-06-15', 'SITE-CHU', 'ITM-HIV', 'L1', 180, 2);

CALL dqa.rafraichir_et_geler(2);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
--  Troisième mois PAQD (2026-07, M+3 du cycle C2). CHR rattrape enfin sa
--  réquisition dans les délais ; CSU toujours sans réquisition.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut, importe_le)
VALUES ('demo_2026-07.xlsx', '2026-C2', '2026-07', '2026-07-01', '2026-07-31', 'valide', now());

CREATE TEMP TABLE _inventaire3 (inv text, site text, prog text, jour date);
INSERT INTO _inventaire3 VALUES
    ('INV3-CHU-1','SITE-CHU','PRG-VIH','2026-07-02'),  ('INV3-CHU-2','SITE-CHU','PRG-VIH','2026-07-30'),
    ('INV3-CHU-3','SITE-CHU','PRG-PALU','2026-07-30'),
    ('INV3-CHR-1','SITE-CHR','PRG-PALU','2026-07-12'), -- toujours hors des 3 derniers jours
    ('INV3-HG-1','SITE-HG','PRG-VIH','2026-07-03'),    ('INV3-HG-2','SITE-HG','PRG-VIH','2026-07-29'),
    ('INV3-ESPC-1','SITE-ESPC','PRG-PALU','2026-07-31'),
    ('INV3-CSU-1','SITE-CSU','PRG-PALU','2026-07-28'), -- réquisition toujours absente
    ('INV3-DIST-1','SITE-DIST','PRG-PALU','2026-07-29'),
    ('INV3-INST-1','SITE-INST','PRG-VIH','2026-07-30'),
    ('INV3-RIM-1','SITE-REIMP','PRG-PALU','2026-07-29');

INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
SELECT inv, site, prog, jour, 'fn', 3 FROM _inventaire3;

-- Juillet : les sites en progrès atteignent le compte exact ; CHR resserre son
-- écart SDU dans la tolérance (récupération, en écho à sa réquisition à l'heure).
CREATE TEMP TABLE _inv_ligne3 (inv text, item text, theo numeric, cnt numeric);
INSERT INTO _inv_ligne3 VALUES
    ('INV3-CHU-1','ITM-ARV', 530, 530), ('INV3-CHU-2','ITM-ARV', 455, 455),
    ('INV3-CHU-1','ITM-HIV', 210, 210), ('INV3-CHU-2','ITM-HIV', 160, 160),
    ('INV3-CHU-3','ITM-ALU', 305, 305),
    ('INV3-CHU-3','ITM-TDR', 102, 102),
    ('INV3-CHR-1','ITM-ALU', 255, 251),                                      -- ~1,6 % : rentré dans la tolérance
    ('INV3-CHR-1','ITM-TDR', 82, 82),
    ('INV3-HG-1','ITM-ARV', 315, 315),  ('INV3-HG-2','ITM-ARV', 300, 300),
    ('INV3-HG-1','ITM-HIV', 128, 128),  ('INV3-HG-2','ITM-HIV', 98, 98),
    ('INV3-ESPC-1','ITM-ALU', 148, 148), ('INV3-ESPC-1','ITM-TDR', 64, 64),
    ('INV3-CSU-1','ITM-ALU', 74, 73),
    ('INV3-DIST-1','ITM-ALU', 96, 96),   ('INV3-DIST-1','ITM-TDR', 46, 46),
    ('INV3-INST-1','ITM-ARV', 218, 218),
    ('INV3-INST-1','ITM-HIV', 80, 80),
    ('INV3-RIM-1','ITM-ALU', 134, 134), ('INV3-RIM-1','ITM-TDR', 58, 58);

INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
SELECT inv, item, 'L1', theo, cnt, 3 FROM _inv_ligne3;

CREATE TEMP TABLE _transaction3 (id text, site text, prog text, nature text, jour date, item text, qte numeric, adj boolean);
INSERT INTO _transaction3 VALUES
    ('TX3-CHU-R1','SITE-CHU','PRG-VIH','reception','2026-07-09','ITM-ARV', 115, false),
    ('TX3-CHU-F1','SITE-CHU','PRG-VIH','facture_fournisseur','2026-07-07', NULL, NULL, false),
    ('TX3-CHU-A1','SITE-CHU','PRG-PALU','ajustement_negatif','2026-07-15','ITM-ALU', -8, true),
    ('TX3-CHR-D1','SITE-CHR','PRG-PALU','dispensation','2026-07-06','ITM-ALU', 19, false),
    ('TX3-CHR-D2','SITE-CHR','PRG-PALU','dispensation','2026-07-10','ITM-TDR', 13, false),
    ('TX3-CHR-D3','SITE-CHR','PRG-PALU','dispensation','2026-07-15','ITM-ALU', 16, false),
    ('TX3-CHR-D4','SITE-CHR','PRG-PALU','dispensation','2026-07-19','ITM-TDR', 12, false),
    ('TX3-CHR-D5','SITE-CHR','PRG-PALU','dispensation','2026-07-24','ITM-ALU', 17, false),
    ('TX3-CHR-D6','SITE-CHR','PRG-PALU','dispensation','2026-07-28','ITM-TDR', 14, false),
    ('TX3-CHR-R1','SITE-CHR','PRG-PALU','reception','2026-07-13','ITM-ALU', 70, false),
    ('TX3-CHR-F1','SITE-CHR','PRG-PALU','facture_fournisseur','2026-07-11', NULL, NULL, false),
    ('TX3-HG-D1','SITE-HG','PRG-VIH','dispensation','2026-07-04','ITM-ARV', 12, false),
    ('TX3-HG-D2','SITE-HG','PRG-VIH','dispensation','2026-07-13','ITM-HIV', 9, false),
    ('TX3-HG-D3','SITE-HG','PRG-VIH','dispensation','2026-07-20','ITM-ARV', 14, false),
    ('TX3-HG-R1','SITE-HG','PRG-VIH','reception','2026-07-10','ITM-ARV', 44, false),
    ('TX3-HG-A1','SITE-HG','PRG-VIH','ajustement_positif','2026-07-16','ITM-ARV', 3, true),
    ('TX3-ESPC-D1','SITE-ESPC','PRG-PALU','dispensation','2026-07-07','ITM-ALU', 8, false),
    ('TX3-ESPC-D2','SITE-ESPC','PRG-PALU','dispensation','2026-07-21','ITM-TDR', 6, false),
    ('TX3-DIST-D1','SITE-DIST','PRG-PALU','distribution','2026-07-09','ITM-ALU', 34, false),
    ('TX3-DIST-D2','SITE-DIST','PRG-PALU','distribution','2026-07-22','ITM-TDR', 14, false),
    ('TX3-INST-D1','SITE-INST','PRG-VIH','dispensation','2026-07-14','ITM-HIV', 11, false),
    ('TX3-RIM-D1','SITE-REIMP','PRG-PALU','dispensation','2026-07-08','ITM-ALU', 9, false),
    ('TX3-RIM-D2','SITE-REIMP','PRG-PALU','dispensation','2026-07-17','ITM-TDR', 5, false);

INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT id, site, nature, prog, 'fn', jour, jour, 3 FROM _transaction3;

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT id || '-L', id, item, prog, qte, 1, adj, 3
FROM _transaction3 WHERE item IS NOT NULL;

INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT 'TX3-CHU-DA-' || to_char(j, 'DD'), 'SITE-CHU', 'dispensation', 'PRG-VIH', 'fn', j, j, 3
FROM generate_series(DATE '2026-07-01', DATE '2026-07-31', INTERVAL '1 day') AS j
WHERE extract(isodow FROM j) < 7;

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT 'TX3-CHU-DA-' || to_char(j, 'DD') || '-L', 'TX3-CHU-DA-' || to_char(j, 'DD'),
       'ITM-ARV', 'PRG-VIH', 7 + (extract(day FROM j)::int % 4), 1, false, 3
FROM generate_series(DATE '2026-07-01', DATE '2026-07-31', INTERVAL '1 day') AS j
WHERE extract(isodow FROM j) < 7;

INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
VALUES
    ('REQ3-CHU-VIH',  'SITE-CHU', 'PRG-VIH',  '2026-07', '2026-08-07', '2026-07-30', 'fn', 3),   -- à l'heure (≤ 10)
    ('REQ3-CHU-PALU', 'SITE-CHU', 'PRG-PALU', '2026-07', '2026-08-06', '2026-07-30', 'fn', 3),   -- à l'heure
    ('REQ3-CHR-PALU', 'SITE-CHR', 'PRG-PALU', '2026-07', '2026-08-06', '2026-07-12', 'fn', 3),   -- à l'heure (≤ 7) : CHR rattrape
    ('REQ3-HG-VIH',   'SITE-HG',  'PRG-VIH',  '2026-07', '2026-08-03', '2026-07-29', 'fn', 3),   -- à l'heure
    ('REQ3-HG-PALU',  'SITE-HG',  'PRG-PALU', '2026-07', '2026-08-04', NULL,         'fn', 3),   -- à l'heure
    ('REQ3-ESPC',     'SITE-ESPC','PRG-PALU', '2026-07', '2026-08-05', '2026-07-31', 'fn', 3),   -- à l'heure (= 5)
    -- CSU : toujours pas de réquisition → manquante
    ('REQ3-DIST',     'SITE-DIST','PRG-PALU', '2026-07', '2026-08-08', '2026-07-29', 'fn', 3),   -- à l'heure
    ('REQ3-INST',     'SITE-INST','PRG-VIH',  '2026-07', '2026-08-04', NULL,         'fn', 3),   -- à l'heure
    ('REQ3-RIM',      'SITE-REIMP','PRG-PALU','2026-07', '2026-08-03', '2026-07-29', 'fn', 3);

INSERT INTO dqa.fact_stock_snapshot (date_photo, site_id, produit_id, lot, quantite_disponible, lot_id_source)
VALUES
    ('2026-07-08', 'SITE-CHU', 'ITM-ARV', 'L1', 505, 3),
    ('2026-07-15', 'SITE-CHU', 'ITM-ARV', 'L1', 480, 3),
    ('2026-07-22', 'SITE-CHU', 'ITM-ARV', 'L1', 465, 3),
    ('2026-07-15', 'SITE-CHU', 'ITM-HIV', 'L1', 185, 3);

CALL dqa.rafraichir_et_geler(3);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
--  Quatrième mois PAQD (2026-08, M+4 du cycle C2) : le mois EN COURS.
--  Les inventaires et mouvements d'août sont là, mais deux réquisitions
--  d'août (CHU, District, échéance au 10 septembre) ne sont pas encore
--  soumises : le score d'août est provisoire et le restera jusqu'à la
--  clôture. CHR retombe en retard (chronique), CSU toujours absente.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut, importe_le)
VALUES ('demo_2026-08.xlsx', '2026-C2', '2026-08', '2026-08-01', '2026-08-31', 'valide', now());

CREATE TEMP TABLE _inventaire4 (inv text, site text, prog text, jour date);
INSERT INTO _inventaire4 VALUES
    ('INV4-CHU-1','SITE-CHU','PRG-VIH','2026-08-02'),  ('INV4-CHU-2','SITE-CHU','PRG-VIH','2026-08-29'),
    ('INV4-CHU-3','SITE-CHU','PRG-PALU','2026-08-29'),
    ('INV4-CHR-1','SITE-CHR','PRG-PALU','2026-08-11'), -- toujours hors des 3 derniers jours
    ('INV4-HG-1','SITE-HG','PRG-VIH','2026-08-04'),    ('INV4-HG-2','SITE-HG','PRG-VIH','2026-08-28'),
    ('INV4-ESPC-1','SITE-ESPC','PRG-PALU','2026-08-30'),
    ('INV4-CSU-1','SITE-CSU','PRG-PALU','2026-08-27'),
    ('INV4-DIST-1','SITE-DIST','PRG-PALU','2026-08-29'),
    ('INV4-INST-1','SITE-INST','PRG-VIH','2026-08-30'),
    ('INV4-RIM-1','SITE-REIMP','PRG-PALU','2026-08-29');

INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
SELECT inv, site, prog, jour, 'fn', 4 FROM _inventaire4;

CREATE TEMP TABLE _inv_ligne4 (inv text, item text, theo numeric, cnt numeric);
INSERT INTO _inv_ligne4 VALUES
    ('INV4-CHU-1','ITM-ARV', 540, 540), ('INV4-CHU-2','ITM-ARV', 460, 460),
    ('INV4-CHU-1','ITM-HIV', 215, 215), ('INV4-CHU-2','ITM-HIV', 165, 165),
    ('INV4-CHU-3','ITM-ALU', 310, 309),
    ('INV4-CHU-3','ITM-TDR', 105, 105),
    ('INV4-CHR-1','ITM-ALU', 260, 247),                                      -- ~5 % : CHR reste hors tolérance
    ('INV4-CHR-1','ITM-TDR', 84, 83),
    ('INV4-HG-1','ITM-ARV', 320, 320),  ('INV4-HG-2','ITM-ARV', 305, 305),
    ('INV4-HG-1','ITM-HIV', 130, 130),  ('INV4-HG-2','ITM-HIV', 100, 100),
    ('INV4-ESPC-1','ITM-ALU', 150, 150), ('INV4-ESPC-1','ITM-TDR', 66, 66),
    ('INV4-CSU-1','ITM-ALU', 76, 75),
    ('INV4-DIST-1','ITM-ALU', 98, 98),   ('INV4-DIST-1','ITM-TDR', 47, 47),
    ('INV4-INST-1','ITM-ARV', 222, 222),
    ('INV4-INST-1','ITM-HIV', 82, 82),
    ('INV4-RIM-1','ITM-ALU', 136, 136), ('INV4-RIM-1','ITM-TDR', 60, 60);

INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
SELECT inv, item, 'L1', theo, cnt, 4 FROM _inv_ligne4;

CREATE TEMP TABLE _transaction4 (id text, site text, prog text, nature text, jour date, item text, qte numeric, adj boolean);
INSERT INTO _transaction4 VALUES
    ('TX4-CHU-R1','SITE-CHU','PRG-VIH','reception','2026-08-09','ITM-ARV', 120, false),
    ('TX4-CHU-F1','SITE-CHU','PRG-VIH','facture_fournisseur','2026-08-07', NULL, NULL, false),
    ('TX4-CHU-A1','SITE-CHU','PRG-PALU','ajustement_negatif','2026-08-15','ITM-ALU', -6, true),
    ('TX4-CHR-D1','SITE-CHR','PRG-PALU','dispensation','2026-08-06','ITM-ALU', 20, false),
    ('TX4-CHR-D2','SITE-CHR','PRG-PALU','dispensation','2026-08-18','ITM-TDR', 15, false),
    ('TX4-CHR-R1','SITE-CHR','PRG-PALU','reception','2026-08-13','ITM-ALU', 72, false),
    ('TX4-CHR-F1','SITE-CHR','PRG-PALU','facture_fournisseur','2026-08-11', NULL, NULL, false),
    ('TX4-HG-D1','SITE-HG','PRG-VIH','dispensation','2026-08-04','ITM-ARV', 13, false),
    ('TX4-HG-D2','SITE-HG','PRG-VIH','dispensation','2026-08-13','ITM-HIV', 10, false),
    ('TX4-HG-D3','SITE-HG','PRG-VIH','dispensation','2026-08-21','ITM-ARV', 15, false),
    ('TX4-HG-R1','SITE-HG','PRG-VIH','reception','2026-08-10','ITM-ARV', 46, false),
    ('TX4-HG-A1','SITE-HG','PRG-VIH','ajustement_positif','2026-08-16','ITM-ARV', 2, true),
    ('TX4-ESPC-D1','SITE-ESPC','PRG-PALU','dispensation','2026-08-07','ITM-ALU', 9, false),
    ('TX4-ESPC-D2','SITE-ESPC','PRG-PALU','dispensation','2026-08-21','ITM-TDR', 7, false),
    ('TX4-DIST-D1','SITE-DIST','PRG-PALU','distribution','2026-08-09','ITM-ALU', 36, false),
    ('TX4-DIST-D2','SITE-DIST','PRG-PALU','distribution','2026-08-22','ITM-TDR', 15, false),
    ('TX4-INST-D1','SITE-INST','PRG-VIH','dispensation','2026-08-14','ITM-HIV', 12, false),
    ('TX4-RIM-D1','SITE-REIMP','PRG-PALU','dispensation','2026-08-08','ITM-ALU', 10, false),
    ('TX4-RIM-D2','SITE-REIMP','PRG-PALU','dispensation','2026-08-17','ITM-TDR', 6, false);

INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT id, site, nature, prog, 'fn', jour, jour, 4 FROM _transaction4;

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT id || '-L', id, item, prog, qte, 1, adj, 4
FROM _transaction4 WHERE item IS NOT NULL;

INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT 'TX4-CHU-DA-' || to_char(j, 'DD'), 'SITE-CHU', 'dispensation', 'PRG-VIH', 'fn', j, j, 4
FROM generate_series(DATE '2026-08-01', DATE '2026-08-31', INTERVAL '1 day') AS j
WHERE extract(isodow FROM j) < 7;

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT 'TX4-CHU-DA-' || to_char(j, 'DD') || '-L', 'TX4-CHU-DA-' || to_char(j, 'DD'),
       'ITM-ARV', 'PRG-VIH', 7 + (extract(day FROM j)::int % 4), 1, false, 4
FROM generate_series(DATE '2026-08-01', DATE '2026-08-31', INTERVAL '1 day') AS j
WHERE extract(isodow FROM j) < 7;

-- Réquisitions d'août telles que connues à la clôture du lot d'août : CHU et
-- District n'ont pas encore soumis (elles arriveront dans le lot de septembre,
-- plus bas) → score d'août provisoire. CHR en retard, CSU toujours absente.
INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
VALUES
    ('REQ4-CHR-PALU', 'SITE-CHR', 'PRG-PALU', '2026-08', '2026-09-09', '2026-08-11', 'fn', 4),   -- en retard (> 7)
    ('REQ4-HG-VIH',   'SITE-HG',  'PRG-VIH',  '2026-08', '2026-09-03', '2026-08-28', 'fn', 4),   -- à l'heure
    ('REQ4-HG-PALU',  'SITE-HG',  'PRG-PALU', '2026-08', '2026-09-04', NULL,         'fn', 4),   -- à l'heure
    ('REQ4-ESPC',     'SITE-ESPC','PRG-PALU', '2026-08', '2026-09-04', '2026-08-30', 'fn', 4),   -- à l'heure (= 5)
    -- CSU : toujours pas de réquisition
    -- District : réquisition d'août pas encore soumise
    ('REQ4-INST',     'SITE-INST','PRG-VIH',  '2026-08', '2026-09-03', NULL,         'fn', 4),   -- à l'heure
    ('REQ4-RIM',      'SITE-REIMP','PRG-PALU','2026-08', '2026-09-02', '2026-08-29', 'fn', 4);

INSERT INTO dqa.fact_stock_snapshot (date_photo, site_id, produit_id, lot, quantite_disponible, lot_id_source)
VALUES
    ('2026-08-08', 'SITE-CHU', 'ITM-ARV', 'L1', 520, 4),
    ('2026-08-15', 'SITE-CHU', 'ITM-ARV', 'L1', 495, 4),
    ('2026-08-22', 'SITE-CHU', 'ITM-ARV', 'L1', 478, 4),
    ('2026-08-15', 'SITE-CHU', 'ITM-HIV', 'L1', 190, 4);

CALL dqa.rafraichir_et_geler(4);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
--  Cinquième lot : extraction du 2026-09-05, fenêtre de 45 jours
--  (2026-07-22 → 2026-09-05), cycle C3, mois PAQD déclaré 2026-09 (M+1).
--
--  Ce lot illustre la fenêtre glissante qui chevauche deux mois :
--   - il apporte les premières données de septembre (5 jours) : le mois
--     apparaît, gelé mais très partiel (P3 ~4/30 jours), moisClos = faux ;
--   - dans la même fenêtre, les réquisitions d'août de CHU et District,
--     enfin soumises (2026-09-04 / 2026-09-05, avant l'échéance du 10),
--     remontent : au prochain gel, le score d'août (encore ouvert) se
--     corrige à la hausse. Le gel reconstitue les deux mois d'un coup
--     (ADR 0010), sans que le lot ait à redéclarer août.
--
--  Les données de juillet/août déjà dans le core ne sont pas ré-insérées
--  ici : un vrai import les re-porterait, la promotion en upsert les
--  écraserait à l'identique. On ne simule que le delta réel.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO dqa.import_lot
    (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, fenetre_debut, fenetre_fin, statut, importe_le)
VALUES ('demo_2026-09.xlsx', '2026-C3', '2026-09', '2026-09-01', '2026-09-30',
        '2026-07-22', '2026-09-05', 'valide', now());

-- Réquisitions d'août rattrapées, apportées par le lot de septembre (dans la
-- fenêtre de 45 jours). Soumises avant l'échéance du 10 → à l'heure.
INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
VALUES
    ('REQ4-CHU-VIH',  'SITE-CHU', 'PRG-VIH',  '2026-08', '2026-09-04', '2026-08-29', 'fn', 5),   -- à l'heure (≤ 10)
    ('REQ4-CHU-PALU', 'SITE-CHU', 'PRG-PALU', '2026-08', '2026-09-04', '2026-08-29', 'fn', 5),   -- à l'heure
    ('REQ4-DIST',     'SITE-DIST','PRG-PALU', '2026-08', '2026-09-05', '2026-08-29', 'fn', 5);   -- à l'heure

-- Septembre : cinq premiers jours seulement. Un inventaire de début de mois
-- pour le CHU, quelques dispensations. Aucune réquisition (échéance en octobre).
CREATE TEMP TABLE _inventaire5 (inv text, site text, prog text, jour date);
INSERT INTO _inventaire5 VALUES
    ('INV5-CHU-1','SITE-CHU','PRG-VIH','2026-09-02'),
    ('INV5-CHU-2','SITE-CHU','PRG-PALU','2026-09-03'),
    ('INV5-HG-1','SITE-HG','PRG-VIH','2026-09-02');

INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
SELECT inv, site, prog, jour, 'fn', 5 FROM _inventaire5;

CREATE TEMP TABLE _inv_ligne5 (inv text, item text, theo numeric, cnt numeric);
INSERT INTO _inv_ligne5 VALUES
    ('INV5-CHU-1','ITM-ARV', 545, 545), ('INV5-CHU-1','ITM-HIV', 218, 218),
    ('INV5-CHU-2','ITM-ALU', 312, 312), ('INV5-CHU-2','ITM-TDR', 106, 106),
    ('INV5-HG-1','ITM-ARV', 322, 322),  ('INV5-HG-1','ITM-HIV', 132, 132);

INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
SELECT inv, item, 'L1', theo, cnt, 5 FROM _inv_ligne5;

CREATE TEMP TABLE _transaction5 (id text, site text, prog text, nature text, jour date, item text, qte numeric, adj boolean);
INSERT INTO _transaction5 VALUES
    ('TX5-CHU-R1','SITE-CHU','PRG-VIH','reception','2026-09-03','ITM-ARV', 90, false),
    ('TX5-CHU-F1','SITE-CHU','PRG-VIH','facture_fournisseur','2026-09-02', NULL, NULL, false),
    ('TX5-CHR-D1','SITE-CHR','PRG-PALU','dispensation','2026-09-03','ITM-ALU', 15, false),
    ('TX5-HG-D1','SITE-HG','PRG-VIH','dispensation','2026-09-04','ITM-ARV', 12, false),
    ('TX5-ESPC-D1','SITE-ESPC','PRG-PALU','dispensation','2026-09-04','ITM-ALU', 8, false),
    ('TX5-DIST-D1','SITE-DIST','PRG-PALU','distribution','2026-09-03','ITM-ALU', 28, false);

INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT id, site, nature, prog, 'fn', jour, jour, 5 FROM _transaction5;

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT id || '-L', id, item, prog, qte, 1, adj, 5
FROM _transaction5 WHERE item IS NOT NULL;

-- CHU : dispensation d'ARV les jours ouvrés du 1er au 5 septembre.
INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT 'TX5-CHU-DA-' || to_char(j, 'DD'), 'SITE-CHU', 'dispensation', 'PRG-VIH', 'fn', j, j, 5
FROM generate_series(DATE '2026-09-01', DATE '2026-09-05', INTERVAL '1 day') AS j
WHERE extract(isodow FROM j) < 7;

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT 'TX5-CHU-DA-' || to_char(j, 'DD') || '-L', 'TX5-CHU-DA-' || to_char(j, 'DD'),
       'ITM-ARV', 'PRG-VIH', 8, 1, false, 5
FROM generate_series(DATE '2026-09-01', DATE '2026-09-05', INTERVAL '1 day') AS j
WHERE extract(isodow FROM j) < 7;

INSERT INTO dqa.fact_stock_snapshot (date_photo, site_id, produit_id, lot, quantite_disponible, lot_id_source)
VALUES
    ('2026-09-02', 'SITE-CHU', 'ITM-ARV', 'L1', 530, 5),
    ('2026-09-05', 'SITE-CHU', 'ITM-ARV', 'L1', 512, 5);

-- Un seul appel reconstitue mai à septembre (ADR 0010).
CALL dqa.rafraichir_et_geler(5);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
--  Zone du district de Man : trois sites rattachés qui adressent des
--  réquisitions au District. P3 du District (ADR 0011) mesure sa capacité à y
--  répondre par des distributions (liées par requisition_id) dans le mois.
--
--   P3(District, M) = réquisitions de la zone couvrant M-1 servies dans M
--                     ─────────────────────────────────────────────────────
--                     réquisitions de la zone couvrant M-1
--
--  Trajectoire : juin 2/3 (alerte), juillet 3/3 (conforme), août 2/3
--  (alerte), septembre 1/3 (provisoire, réponses en cours). Seuil 80 %.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO dqa.dim_site
    (site_id, site_code, site_nom, district, region, type_structure, dans_perimetre_dqa, jour_limite_requisition, lot_id_source)
VALUES
    ('SITE-MAN1', 'C-MAN1', 'CSU de Man centre',   'MAN', 'TONKPI', 'CSU',  true, 5, 1),
    ('SITE-MAN2', 'C-MAN2', 'CSR de Fagnampleu',   'MAN', 'TONKPI', 'CSR',  true, 5, 1),
    ('SITE-MAN3', 'C-MAN3', 'ESPC de Gbangbégouiné','MAN', 'TONKPI', 'ESPC', true, 5, 1);

INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif, lot_id_source)
VALUES
    ('SITE-MAN1', 'PRG-PALU', true, 1),
    ('SITE-MAN2', 'PRG-PALU', true, 1),
    ('SITE-MAN3', 'PRG-PALU', true, 1);

-- Réquisitions de la zone : 3 par mois couvert (mai à août), lot du mois suivant.
INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
VALUES
    ('REQ-MAN1-05','SITE-MAN1','PRG-PALU','2026-05','2026-06-04','2026-05-30','fn',2),
    ('REQ-MAN2-05','SITE-MAN2','PRG-PALU','2026-05','2026-06-05','2026-05-30','fn',2),
    ('REQ-MAN3-05','SITE-MAN3','PRG-PALU','2026-05','2026-06-05','2026-05-30','fn',2),
    ('REQ-MAN1-06','SITE-MAN1','PRG-PALU','2026-06','2026-07-04','2026-06-29','fn',3),
    ('REQ-MAN2-06','SITE-MAN2','PRG-PALU','2026-06','2026-07-05','2026-06-29','fn',3),
    ('REQ-MAN3-06','SITE-MAN3','PRG-PALU','2026-06','2026-07-05','2026-06-29','fn',3),
    ('REQ-MAN1-07','SITE-MAN1','PRG-PALU','2026-07','2026-08-04','2026-07-30','fn',4),
    ('REQ-MAN2-07','SITE-MAN2','PRG-PALU','2026-07','2026-08-05','2026-07-30','fn',4),
    ('REQ-MAN3-07','SITE-MAN3','PRG-PALU','2026-07','2026-08-05','2026-07-30','fn',4),
    ('REQ-MAN1-08','SITE-MAN1','PRG-PALU','2026-08','2026-09-03','2026-08-29','fn',5),
    ('REQ-MAN2-08','SITE-MAN2','PRG-PALU','2026-08','2026-09-04','2026-08-29','fn',5),
    ('REQ-MAN3-08','SITE-MAN3','PRG-PALU','2026-08','2026-09-04','2026-08-29','fn',5);

-- Distributions du District en réponse (nature 'distribution', requisition_id
-- renseigné), datées dans le mois PAQD = mois couvert + 1.
INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, requisition_id, lot_id_source)
VALUES
    -- juin : répond à MAN1 et MAN2 (2/3)
    ('TX-DIST-R05-1','SITE-DIST','distribution','PRG-PALU','fn','2026-06-10','2026-06-10','REQ-MAN1-05',2),
    ('TX-DIST-R05-2','SITE-DIST','distribution','PRG-PALU','fn','2026-06-18','2026-06-18','REQ-MAN2-05',2),
    -- juillet : répond aux trois (3/3)
    ('TX-DIST-R06-1','SITE-DIST','distribution','PRG-PALU','fn','2026-07-09','2026-07-09','REQ-MAN1-06',3),
    ('TX-DIST-R06-2','SITE-DIST','distribution','PRG-PALU','fn','2026-07-11','2026-07-11','REQ-MAN2-06',3),
    ('TX-DIST-R06-3','SITE-DIST','distribution','PRG-PALU','fn','2026-07-19','2026-07-19','REQ-MAN3-06',3),
    -- août : répond à MAN1 et MAN3 (2/3)
    ('TX-DIST-R07-1','SITE-DIST','distribution','PRG-PALU','fn','2026-08-08','2026-08-08','REQ-MAN1-07',4),
    ('TX-DIST-R07-2','SITE-DIST','distribution','PRG-PALU','fn','2026-08-20','2026-08-20','REQ-MAN3-07',4),
    -- septembre (en cours) : n'a répondu qu'à MAN1 pour l'instant (1/3)
    ('TX-DIST-R08-1','SITE-DIST','distribution','PRG-PALU','fn','2026-09-03','2026-09-03','REQ-MAN1-08',5);

INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT id || '-L', id, 'ITM-ALU', 'PRG-PALU', 40, 1, false, 5
FROM (VALUES
    ('TX-DIST-R05-1'),('TX-DIST-R05-2'),
    ('TX-DIST-R06-1'),('TX-DIST-R06-2'),('TX-DIST-R06-3'),
    ('TX-DIST-R07-1'),('TX-DIST-R07-2'),
    ('TX-DIST-R08-1')
) AS t(id);

CALL dqa.rafraichir_et_geler(5);

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

\echo 'Seed de démonstration appliqué : 11 sites (dont la zone du District de Man), 2026-05 à 2026-09. Août et septembre en cours.'
