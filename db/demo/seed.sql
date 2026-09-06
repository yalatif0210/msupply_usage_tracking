-- ═══════════════════════════════════════════════════════════════════════════
--  Jeu de démonstration · tableau de bord DQA mSupply
--
--  11 sites de strates variées (dont un district et sa zone de trois sites),
--  la fin du cycle C2 (2026-05 à 2026-08, M+1 à M+4) et le début du cycle C3
--  (2026-09, M+1). Un lot d'import par mois, plus un cinquième « extraction du
--  5 septembre » à fenêtre de 45 jours qui chevauche août et septembre.
--
--  Les trajectoires de stock des quatre produits traceurs sont générées pour
--  se réconcilier sur des fenêtres d'un mois complet (bornes inter-mois de
--  l'écart consommation, ADR 0012) : chaque site fait deux inventaires en mai
--  (borne d'ouverture intra-mois) puis un inventaire de fin de mois, et
--  `compté(M) = compté(M-1) + réceptions(M) − sorties(M)` (± bruit pour les
--  cas ALERTE désignés).
--
--  Narratif :
--   - CHU : réquisitions d'août soumises en retard, rapportées par le lot du
--     5 septembre → le gel corrige le score d'août (encore ouvert) à la hausse
--     sans redéclaration (ADR 0010).
--   - CHR : P3 faible (peu de jours de dispensation), écart SDU sur l'ALU hors
--     tolérance en mai-juin puis résorbé.
--   - CSU : réquisition jamais soumise → « rapport manquant ».
--   - District de Man : P3 « distribution » (ADR 0011), réponse aux
--     réquisitions de sa zone (juin 2/3, juillet 3/3, août 2/3, septembre 1/3) ;
--     écart « distribution » sur l'ALU et le TDR.
--   - Institut Pasteur : strate « Non classé ».
--   - SITE-REIMP : core modifié après le gel → avertissement « données
--     modifiées depuis le gel ».
--   - Août et septembre sont les mois en cours (date du jour 2026-09-05) :
--     repère « Mois en cours · score provisoire ». P3 y est mesuré sur les
--     jours écoulés (ADR 0012).
--
--  Rejouable : purge le core avant d'insérer.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

BEGIN;

TRUNCATE dqa.import_lot, dqa.dim_site, dqa.dim_programme, dqa.dim_produit
    RESTART IDENTITY CASCADE;

-- ── Lots d'import ─────────────────────────────────────────────────────────
INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut, importe_le) VALUES
    ('demo_2026-05.xlsx', '2026-C2', '2026-05', '2026-05-01', '2026-05-31', 'valide', now()),
    ('demo_2026-06.xlsx', '2026-C2', '2026-06', '2026-06-01', '2026-06-30', 'valide', now()),
    ('demo_2026-07.xlsx', '2026-C2', '2026-07', '2026-07-01', '2026-07-31', 'valide', now()),
    ('demo_2026-08.xlsx', '2026-C2', '2026-08', '2026-08-01', '2026-08-31', 'valide', now());

INSERT INTO dqa.import_lot
    (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, fenetre_debut, fenetre_fin, statut, importe_le)
VALUES ('demo_2026-09.xlsx', '2026-C3', '2026-09', '2026-09-01', '2026-09-30',
        '2026-07-22', '2026-09-05', 'valide', now());

-- ── Programmes ───────────────────────────────────────────────────────────
INSERT INTO dqa.dim_programme (programme_id, programme_code, programme_nom, lot_id_source) VALUES
    ('PRG-VIH',  'VIH',  'VIH',       1),
    ('PRG-PALU', 'PALU', 'Paludisme', 1);

-- ── Sites (une strate chacun ; « Institut » restera « Non classé ») ───────
INSERT INTO dqa.dim_site
    (site_id, site_code, site_nom, district, region, type_structure, dans_perimetre_dqa, jour_limite_requisition, lot_id_source)
VALUES
    ('SITE-CHU',   'C-CHU',  'CHU de Treichville',                 'ABIDJAN 1',   'ABIDJAN',          'CHU',                true, 10, 1),
    ('SITE-CHR',   'C-CHR',  'CHR de Bouaké',                      'BOUAKE NORD', 'GBEKE',            'CHR',                true, 7,  1),
    ('SITE-HG',    'C-HG',   'HG d''Abengourou',                   'ABENGOUROU',  'INDENIE-DJUABLIN', 'HG',                 true, 7,  1),
    ('SITE-ESPC',  'C-ESPC', 'ESPC de Yamoussoukro',               'YAMOUSSOUKRO','BELIER',           'ESPC',               true, 5,  1),
    ('SITE-CSU',   'C-CSU',  'CSU de Korhogo',                     'KORHOGO',     'PORO',             'CSU',                true, 5,  1),
    ('SITE-DIST',  'C-DIST', 'District sanitaire de Man',          'MAN',         'TONKPI',           'District sanitaire', true, 10, 1),
    ('SITE-INST',  'C-INST', 'Institut Pasteur de Côte d''Ivoire', 'ABIDJAN 2',   'ABIDJAN',          'Institut',           true, 10, 1),
    ('SITE-REIMP', 'C-RIM',  'CSU de Daloa (ré-importé)',          'DALOA',       'HAUT-SASSANDRA',   'CSU',                true, 5,  1),
    ('SITE-MAN1',  'C-MAN1', 'CSU de Man centre',                  'MAN',         'TONKPI',           'CSU',                true, 5,  1),
    ('SITE-MAN2',  'C-MAN2', 'CSR de Fagnampleu',                  'MAN',         'TONKPI',           'CSR',                true, 5,  1),
    ('SITE-MAN3',  'C-MAN3', 'ESPC de Gbangbégouiné',              'MAN',         'TONKPI',           'ESPC',               true, 5,  1);

INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif, lot_id_source)
SELECT site_id, programme_id, true, 1
FROM (VALUES
    ('SITE-CHU','PRG-VIH'), ('SITE-CHU','PRG-PALU'),
    ('SITE-CHR','PRG-PALU'),
    ('SITE-HG','PRG-VIH'),
    ('SITE-ESPC','PRG-PALU'),
    ('SITE-CSU','PRG-PALU'),
    ('SITE-DIST','PRG-PALU'),
    ('SITE-INST','PRG-VIH'),
    ('SITE-REIMP','PRG-PALU'),
    ('SITE-MAN1','PRG-PALU'), ('SITE-MAN2','PRG-PALU'), ('SITE-MAN3','PRG-PALU')
) AS s(site_id, programme_id);

-- ── Produits (4 traceurs de la liste réelle, migration 0013) ─────────────
INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom, unite, lot_id_source) VALUES
    ('ITM-ARV', '3100014-ARV',  'DOLUTEGRAVIR/LAMIVUDINE/TENOFOVIR 50/300/300 mg comp. BTE/90', 'BTE', 1),
    ('ITM-ALU', '3050064-PNLP', 'ARTEMETHER/LUMEFANTRINE 20/120 mg ADULTE BTE/30',              'BTE', 1),
    ('ITM-TDR', '4030616-PNLP', 'TEST DE DIAGNOSTIC RAPIDE DU PALUDISME KIT/10',                'KIT', 1),
    ('ITM-HIV', '4040328-TRC',  'WONDFO HIV 1/2 TEST KIT/25',                                   'KIT', 1);

-- ═══════════════════════════════════════════════════════════════════════════
--  Générateur des trajectoires de traceurs
--
--  `_plan` : par (site, produit, programme, nature de sortie), le stock
--  d'ouverture, la réception mensuelle, la sortie mensuelle et un bruit SDU
--  (théorique = compté + bruit) mois par mois. La procédure ci-dessous
--  déroule mai → septembre et insère :
--    - inventaires (2 en mai, 1 fin de mois ensuite) avec leurs lignes ;
--    - une réception mensuelle datée dans la fenêtre (borne M-1, borne M] ;
--    - ~22 sorties (jours ouvrés) réparties pour sommer la sortie mensuelle,
--      moins pour les sites en alerte P3.
--  `jours_sortie` : nombre de jours distincts avec sortie (P3).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _plan (
    site text, produit text, prog text, nature text,
    stock_ouv numeric, rec_mois numeric, sortie_mois numeric,
    jours_sortie int,
    sdu_bruit int[]   -- bruit théorique par mois [mai..sept] ; NULL → 0
);
--  Contraintes : sortie_mois >= jours_sortie (chaque jour de sortie porte >= 1
--  unité) ; rec_mois ~ sortie_mois + 2 (le stock monte doucement). Sites
--  réguliers : 22 jours de sortie / mois ; CHR et le district : 7 (P3 en alerte).
INSERT INTO _plan VALUES
    -- VIH — ARV
    ('SITE-CHU','ITM-ARV','PRG-VIH','dispensation', 520, 54, 52, 22, NULL),
    ('SITE-HG', 'ITM-ARV','PRG-VIH','dispensation', 380, 46, 44, 22, ARRAY[0,0,0,14,14]),  -- SDU HG hors tol. août-sept
    ('SITE-INST','ITM-ARV','PRG-VIH','dispensation',220, 28, 26, 22, NULL),
    -- VIH — HIV
    ('SITE-CHU','ITM-HIV','PRG-VIH','dispensation', 210, 28, 26, 22, NULL),
    ('SITE-HG', 'ITM-HIV','PRG-VIH','dispensation', 130, 26, 24, 22, NULL),
    ('SITE-INST','ITM-HIV','PRG-VIH','dispensation', 95, 26, 24, 22, NULL),
    -- PALU — ALU
    ('SITE-CHU','ITM-ALU','PRG-PALU','dispensation', 320, 30, 28, 22, NULL),
    ('SITE-CHR','ITM-ALU','PRG-PALU','dispensation', 260, 26, 24, 7,  ARRAY[9,8,2,1,1]),  -- CHR : P3 faible, SDU alerte mai-juin
    ('SITE-ESPC','ITM-ALU','PRG-PALU','dispensation',150, 28, 26, 22, NULL),
    ('SITE-CSU','ITM-ALU','PRG-PALU','dispensation', 80, 28, 26, 22, NULL),
    ('SITE-REIMP','ITM-ALU','PRG-PALU','dispensation',140, 28, 26, 22, NULL),
    ('SITE-MAN1','ITM-ALU','PRG-PALU','dispensation', 95, 28, 26, 22, NULL),
    ('SITE-MAN2','ITM-ALU','PRG-PALU','dispensation', 85, 26, 24, 22, NULL),
    ('SITE-MAN3','ITM-ALU','PRG-PALU','dispensation', 80, 26, 24, 22, NULL),
    ('SITE-DIST','ITM-ALU','PRG-PALU','distribution', 120, 30, 28, 7,  NULL),  -- district : distributions
    -- PALU — TDR
    ('SITE-CHU','ITM-TDR','PRG-PALU','dispensation', 110, 28, 26, 22, NULL),
    ('SITE-CHR','ITM-TDR','PRG-PALU','dispensation', 90, 28, 26, 7,  NULL),
    ('SITE-ESPC','ITM-TDR','PRG-PALU','dispensation', 70, 26, 24, 22, NULL),
    ('SITE-REIMP','ITM-TDR','PRG-PALU','dispensation',60, 26, 24, 22, NULL),
    ('SITE-DIST','ITM-TDR','PRG-PALU','distribution', 55, 16, 15, 7,  NULL);

DO $gen$
DECLARE
    p           _plan%ROWTYPE;
    m           int;
    mois        text;
    lot         int;
    d_clot      date;   -- date inventaire de fin de mois M
    d_rec       date;   -- date de la réception du mois
    stock       numeric;
    stock_prec  numeric;
    theo        numeric;
    inv_clot    text;
    inv_ouv     text;
    jours       date[];
    n_jours     int;
    k           int;
    j           date;
    q           numeric;
    q_cumul     numeric;
    bruit       int;
    -- fins de mois (dans les 3 derniers jours) et débuts
    fin_mois    date[] := ARRAY['2026-05-30','2026-06-29','2026-07-30','2026-08-29','2026-09-30']::date[];
    deb_mois    date[] := ARRAY['2026-05-01','2026-06-01','2026-07-01','2026-08-01','2026-09-01']::date[];
    rec_jour    date[] := ARRAY['2026-05-12','2026-06-10','2026-07-10','2026-08-11','2026-09-03']::date[];
BEGIN
FOR p IN SELECT * FROM _plan LOOP
    stock := p.stock_ouv;
    FOR m IN 1..5 LOOP
        mois       := to_char(deb_mois[m], 'YYYY-MM');
        lot        := m;
        stock_prec := stock;

        -- septembre : mois partiel (5 jours ouvrés), une sortie par jour,
        -- pas de réception → la reconstituée du mois en cours vaut le total
        -- des sorties écoulées.
        IF m = 5 THEN
            q_cumul := 5;
            stock   := stock_prec - 5;
        ELSE
            q_cumul := p.sortie_mois;
            stock   := stock_prec + p.rec_mois - p.sortie_mois;
        END IF;

        bruit := COALESCE(p.sdu_bruit[m], 0);
        theo  := stock + bruit;

        -- ── Inventaire de fin de mois (pour septembre : le dernier jour de
        --    données, pour que toutes les sorties du mois tiennent dans la
        --    fenêtre de l'écart consommation) ──
        d_clot   := CASE WHEN m = 5 THEN DATE '2026-09-05' ELSE fin_mois[m] END;
        inv_clot := format('INV-%s-%s-%s', p.site, replace(p.produit,'ITM-',''), mois);
        INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
        VALUES (inv_clot, p.site, p.prog, d_clot, 'fn', lot)
        ON CONFLICT (inventaire_id) DO NOTHING;
        INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
        VALUES (inv_clot, p.produit, 'L1', theo, stock, lot);

        -- ── En mai : un second inventaire, le 1er du mois (borne d'ouverture) ──
        IF m = 1 THEN
            inv_ouv := format('INV-%s-%s-%s-ouv', p.site, replace(p.produit,'ITM-',''), mois);
            INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
            VALUES (inv_ouv, p.site, p.prog, DATE '2026-05-01', 'fn', lot)
            ON CONFLICT (inventaire_id) DO NOTHING;
            INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
            VALUES (inv_ouv, p.produit, 'L1', p.stock_ouv, p.stock_ouv, lot);
        END IF;

        -- ── Réception mensuelle (sauf septembre) ──
        IF m < 5 AND p.rec_mois > 0 THEN
            d_rec := rec_jour[m];
            INSERT INTO dqa.fact_transaction
                (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
            VALUES (format('RC-%s-%s-%s', p.site, replace(p.produit,'ITM-',''), mois),
                    p.site, 'reception', p.prog, 'fn', d_rec, d_rec, lot);
            INSERT INTO dqa.fact_ligne_transaction
                (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
            VALUES (format('RC-%s-%s-%s-L', p.site, replace(p.produit,'ITM-',''), mois),
                    format('RC-%s-%s-%s', p.site, replace(p.produit,'ITM-',''), mois),
                    p.produit, p.prog, p.rec_mois, 1, false, lot);
        END IF;

        -- ── Sorties : les `jours_sortie` premiers jours ouvrés du mois ──
        --  q_cumul est réparti exactement (split entier par la fonction floor)
        --  sur les n_jours jours retenus. En mai on démarre le 2 : le 1er porte
        --  l'inventaire d'ouverture et les sorties doivent tomber après lui pour
        --  entrer dans la fenêtre de l'écart consommation.
        jours := ARRAY(
            SELECT g::date FROM generate_series(
                CASE WHEN m = 5 THEN DATE '2026-09-01'
                     WHEN m = 1 THEN DATE '2026-05-02'
                     ELSE deb_mois[m] END,
                CASE WHEN m = 5 THEN DATE '2026-09-05'
                     ELSE (deb_mois[m] + interval '1 month - 1 day')::date END,
                interval '1 day') g
            WHERE extract(isodow FROM g) < 7
            ORDER BY g
            LIMIT p.jours_sortie);
        n_jours := array_length(jours, 1);

        FOR k IN 1..COALESCE(n_jours, 0) LOOP
            j := jours[k];
            q := floor(q_cumul::numeric * k / n_jours) - floor(q_cumul::numeric * (k - 1) / n_jours);
            IF q <= 0 THEN CONTINUE; END IF;   -- q_cumul < n_jours : jour sans sortie

            INSERT INTO dqa.fact_transaction
                (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
            VALUES (format('SO-%s-%s-%s', p.site, replace(p.produit,'ITM-',''), to_char(j,'YYYYMMDD')),
                    p.site, p.nature, p.prog, 'fn', j, j, lot);
            INSERT INTO dqa.fact_ligne_transaction
                (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
            VALUES (format('SO-%s-%s-%s-L', p.site, replace(p.produit,'ITM-',''), to_char(j,'YYYYMMDD')),
                    format('SO-%s-%s-%s', p.site, replace(p.produit,'ITM-',''), to_char(j,'YYYYMMDD')),
                    p.produit, p.prog, q, 1, false, lot);
        END LOOP;
    END LOOP;
END LOOP;
END
$gen$;

-- ── Ajustements de stock (P6) : quelques mouvements, peu d'ajustements ────
INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
VALUES
    ('AJ-CHU-06','SITE-CHU','ajustement_negatif','PRG-PALU','fn','2026-06-16','2026-06-16',2),
    ('AJ-HG-07', 'SITE-HG', 'ajustement_positif','PRG-VIH', 'fn','2026-07-15','2026-07-15',3),
    ('AJ-CHR-08','SITE-CHR','ajustement_negatif','PRG-PALU','fn','2026-08-14','2026-08-14',4),
    ('AJ-CHR-06','SITE-CHR','ajustement_negatif','PRG-PALU','fn','2026-06-12','2026-06-12',2),
    ('AJ-CHR-07','SITE-CHR','ajustement_negatif','PRG-PALU','fn','2026-07-19','2026-07-19',3);
INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
VALUES
    ('AJ-CHU-06-L','AJ-CHU-06','ITM-ALU','PRG-PALU',-6,1,true,2),
    ('AJ-HG-07-L', 'AJ-HG-07', 'ITM-ARV','PRG-VIH',  4,1,true,3),
    ('AJ-CHR-08-L','AJ-CHR-08','ITM-ALU','PRG-PALU',-5,1,true,4),
    ('AJ-CHR-06-L','AJ-CHR-06','ITM-ALU','PRG-PALU',-4,1,true,2),
    ('AJ-CHR-07-L','AJ-CHR-07','ITM-TDR','PRG-PALU',-3,1,true,3);

-- ── Factures fournisseur (dénominateur de la complétude des réceptions P1) ─
--  Une facture par réception de traceur pour CHU / HG / ESPC (ratio 100 %) ;
--  pour CHR, une facture de plus que les réceptions chaque mois → alerte.
INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT 'FA-' || rc.transaction_id, rc.site_id, 'facture_fournisseur', rc.programme_id, 'fn',
       rc.date_confirmation, rc.date_confirmation, rc.lot_id_source
FROM dqa.fact_transaction rc
WHERE rc.nature = 'reception'
  AND rc.site_id IN ('SITE-CHU','SITE-HG','SITE-ESPC','SITE-CHR');

INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
VALUES
    ('FA-CHR-EXTRA-05','SITE-CHR','facture_fournisseur','PRG-PALU','fn','2026-05-06','2026-05-06',1),
    ('FA-CHR-EXTRA-06','SITE-CHR','facture_fournisseur','PRG-PALU','fn','2026-06-06','2026-06-06',2),
    ('FA-CHR-EXTRA-07','SITE-CHR','facture_fournisseur','PRG-PALU','fn','2026-07-06','2026-07-06',3),
    ('FA-CHR-EXTRA-08','SITE-CHR','facture_fournisseur','PRG-PALU','fn','2026-08-06','2026-08-06',4);

-- ── Réquisitions (rapports mensuels) : à l'heure, en retard, manquantes ──
--  Limite de soumission : mois M+1 + (jour_limite − 1).
--  CSU/ESPC/MAN* → 5, CHR/HG → 7, CHU/DIST → 10.
INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
VALUES
    -- CHU : mai-juillet à l'heure ; août soumis en retard, rapporté par le lot de septembre (plus bas)
    ('REQ-CHU-VIH-05', 'SITE-CHU','PRG-VIH', '2026-05','2026-06-08','2026-05-30','fn',1),
    ('REQ-CHU-PALU-05','SITE-CHU','PRG-PALU','2026-05','2026-06-15','2026-05-30','fn',1),  -- en retard (> 10)
    ('REQ-CHU-VIH-06', 'SITE-CHU','PRG-VIH', '2026-06','2026-07-07','2026-06-29','fn',2),
    ('REQ-CHU-PALU-06','SITE-CHU','PRG-PALU','2026-06','2026-07-06','2026-06-29','fn',2),  -- rattrapé
    ('REQ-CHU-VIH-07', 'SITE-CHU','PRG-VIH', '2026-07','2026-08-07','2026-07-30','fn',3),
    ('REQ-CHU-PALU-07','SITE-CHU','PRG-PALU','2026-07','2026-08-06','2026-07-30','fn',3),
    -- CHR : réquisition chroniquement en retard (limite 7)
    ('REQ-CHR-05','SITE-CHR','PRG-PALU','2026-05','2026-06-11','2026-05-30','fn',1),  -- en retard
    ('REQ-CHR-06','SITE-CHR','PRG-PALU','2026-06','2026-07-10','2026-06-29','fn',2),  -- en retard
    ('REQ-CHR-07','SITE-CHR','PRG-PALU','2026-07','2026-08-06','2026-07-30','fn',3),  -- à l'heure
    ('REQ-CHR-08','SITE-CHR','PRG-PALU','2026-08','2026-09-09','2026-08-29','fn',4),  -- en retard
    -- HG : VIH à l'heure
    ('REQ-HG-VIH-05','SITE-HG','PRG-VIH','2026-05','2026-06-04','2026-05-30','fn',1),
    ('REQ-HG-VIH-06','SITE-HG','PRG-VIH','2026-06','2026-07-03','2026-06-29','fn',2),
    ('REQ-HG-VIH-07','SITE-HG','PRG-VIH','2026-07','2026-08-03','2026-07-30','fn',3),
    ('REQ-HG-VIH-08','SITE-HG','PRG-VIH','2026-08','2026-09-03','2026-08-29','fn',4),
    -- ESPC : à l'heure (= 5)
    ('REQ-ESPC-05','SITE-ESPC','PRG-PALU','2026-05','2026-06-05','2026-05-30','fn',1),
    ('REQ-ESPC-06','SITE-ESPC','PRG-PALU','2026-06','2026-07-04','2026-06-29','fn',2),
    ('REQ-ESPC-07','SITE-ESPC','PRG-PALU','2026-07','2026-08-05','2026-07-30','fn',3),
    ('REQ-ESPC-08','SITE-ESPC','PRG-PALU','2026-08','2026-09-04','2026-08-29','fn',4),
    -- CSU : aucune réquisition → « rapport manquant » chronique
    -- District : mai-juillet à l'heure ; août rapporté par le lot de septembre
    ('REQ-DIST-05','SITE-DIST','PRG-PALU','2026-05','2026-06-09','2026-05-30','fn',1),
    ('REQ-DIST-06','SITE-DIST','PRG-PALU','2026-06','2026-07-08','2026-06-29','fn',2),
    ('REQ-DIST-07','SITE-DIST','PRG-PALU','2026-07','2026-08-08','2026-07-30','fn',3),
    -- Institut : en retard (limite 10)
    ('REQ-INST-05','SITE-INST','PRG-VIH','2026-05','2026-06-20',NULL,'fn',1),
    ('REQ-INST-06','SITE-INST','PRG-VIH','2026-06','2026-07-03',NULL,'fn',2),
    ('REQ-INST-07','SITE-INST','PRG-VIH','2026-07','2026-08-04',NULL,'fn',3),
    ('REQ-INST-08','SITE-INST','PRG-VIH','2026-08','2026-09-03',NULL,'fn',4),
    -- REIMP : à l'heure
    ('REQ-RIM-05','SITE-REIMP','PRG-PALU','2026-05','2026-06-03','2026-05-30','fn',1),
    ('REQ-RIM-06','SITE-REIMP','PRG-PALU','2026-06','2026-07-02','2026-06-29','fn',2),
    ('REQ-RIM-07','SITE-REIMP','PRG-PALU','2026-07','2026-08-03','2026-07-30','fn',3),
    ('REQ-RIM-08','SITE-REIMP','PRG-PALU','2026-08','2026-09-02','2026-08-29','fn',4);

-- ── Zone du district de Man : réquisitions des trois sites rattachés ─────
--  P3(District, M) = réquisitions de la zone couvrant M-1 servies dans M
--                    ÷ réquisitions de la zone couvrant M-1. Seuil 80 %.
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

-- Distributions du District en réponse (requisition_id renseigné), datées
-- dans le mois PAQD = mois couvert + 1. Trajectoire : juin 2/3, juillet 3/3,
-- août 2/3, septembre 1/3 (en cours). Ces distributions portent l'ALU et
-- s'ajoutent au flux de distribution du district généré plus haut.
INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, requisition_id, lot_id_source)
VALUES
    ('TX-DIST-RZ-1','SITE-DIST','distribution','PRG-PALU','fn','2026-06-10','2026-06-10','REQ-MAN1-05',2),
    ('TX-DIST-RZ-2','SITE-DIST','distribution','PRG-PALU','fn','2026-06-18','2026-06-18','REQ-MAN2-05',2),
    ('TX-DIST-RZ-3','SITE-DIST','distribution','PRG-PALU','fn','2026-07-09','2026-07-09','REQ-MAN1-06',3),
    ('TX-DIST-RZ-4','SITE-DIST','distribution','PRG-PALU','fn','2026-07-11','2026-07-11','REQ-MAN2-06',3),
    ('TX-DIST-RZ-5','SITE-DIST','distribution','PRG-PALU','fn','2026-07-19','2026-07-19','REQ-MAN3-06',3),
    ('TX-DIST-RZ-6','SITE-DIST','distribution','PRG-PALU','fn','2026-08-08','2026-08-08','REQ-MAN1-07',4),
    ('TX-DIST-RZ-7','SITE-DIST','distribution','PRG-PALU','fn','2026-08-20','2026-08-20','REQ-MAN3-07',4),
    ('TX-DIST-RZ-8','SITE-DIST','distribution','PRG-PALU','fn','2026-09-03','2026-09-03','REQ-MAN1-08',5);
INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT id || '-L', id, 'ITM-ALU', 'PRG-PALU', 25, 1, false, 5
FROM (VALUES ('TX-DIST-RZ-1'),('TX-DIST-RZ-2'),('TX-DIST-RZ-3'),('TX-DIST-RZ-4'),
             ('TX-DIST-RZ-5'),('TX-DIST-RZ-6'),('TX-DIST-RZ-7'),('TX-DIST-RZ-8')) AS t(id);

-- ── Photos de stock (fiche produit-mois) ───────────────────────────────
INSERT INTO dqa.fact_stock_snapshot (date_photo, site_id, produit_id, lot, quantite_disponible, lot_id_source)
VALUES
    ('2026-08-08', 'SITE-HG',  'ITM-ARV', 'L1', 384, 4),
    ('2026-08-18', 'SITE-HG',  'ITM-ARV', 'L1', 372, 4),
    ('2026-08-28', 'SITE-HG',  'ITM-ARV', 'L1', 389, 4),
    ('2026-09-03', 'SITE-HG',  'ITM-ARV', 'L1', 380, 5),
    ('2026-08-08', 'SITE-CHU', 'ITM-ARV', 'L1', 520, 4),
    ('2026-08-18', 'SITE-CHU', 'ITM-ARV', 'L1', 512, 4),
    ('2026-08-28', 'SITE-CHU', 'ITM-ARV', 'L1', 525, 4);

-- ── Réquisitions d'août rattrapées, apportées par le lot de septembre ───
--  Dans la fenêtre de 45 jours (2026-07-22 → 2026-09-05), soumises avant
--  l'échéance du 10 → à l'heure. Le gel du lot 5 reconstitue août (encore
--  ouvert) et le score remonte, sans que le lot ait à redéclarer août.
INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
VALUES
    ('REQ-CHU-VIH-08', 'SITE-CHU','PRG-VIH', '2026-08','2026-09-04','2026-08-29','fn',5),
    ('REQ-CHU-PALU-08','SITE-CHU','PRG-PALU','2026-08','2026-09-04','2026-08-29','fn',5),
    ('REQ-DIST-08',    'SITE-DIST','PRG-PALU','2026-08','2026-09-05','2026-08-29','fn',5);

-- ── Gel : un seul appel reconstitue mai à septembre (ADR 0010) ──────────
CALL dqa.rafraichir_et_geler(5);

COMMIT;

-- ── Ré-import « après le gel » de SITE-REIMP : bouge le core sans regeler ─
--  Simule un correctif d'extraction postérieur au gel : le détail live d'un
--  pilier changera, l'avertissement « données modifiées depuis le gel »
--  apparaîtra sur la fiche de SITE-REIMP.
UPDATE dqa.fact_transaction SET maj_le = now() + interval '1 day' WHERE site_id = 'SITE-REIMP';
UPDATE dqa.fact_inventaire  SET maj_le = now() + interval '1 day' WHERE site_id = 'SITE-REIMP';

\echo 'Seed de démonstration appliqué : 11 sites (dont la zone du District de Man), 2026-05 à 2026-09. Août et septembre en cours.'
