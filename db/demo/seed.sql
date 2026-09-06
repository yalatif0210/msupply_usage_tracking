-- ═══════════════════════════════════════════════════════════════════════════
--  Jeu de démonstration · tableau de bord DQA mSupply
--
--  16 sites RÉELS repris de la feuille SITES du canevas d'extraction
--  (`Canevas_Extraction_mSupply_DQA.xlsx`) : 4 districts sanitaires, chacun
--  avec son hôpital de référence et 2 ESPC de sa zone. `site_id` = le
--  `store.id` mSupply réel ; `type_structure` = les trois valeurs réelles du
--  référentiel (`District sanitaire`, `Hôpital de référence`, `ESPC`).
--
--  Fin du cycle C2 (2026-05 à 2026-08) et début du C3 (2026-09). Les
--  trajectoires de stock des 4 traceurs sont générées (bloc `DO` + table
--  `_plan`) pour se réconcilier sur des fenêtres d'un mois : deux inventaires
--  en mai (borne d'ouverture intra-mois), un inventaire de fin de mois
--  ensuite, `compté(M) = compté(M-1) + réceptions - sorties`.
--
--  Un lot d'import par mois plus un cinquième « extraction du 5 septembre » à
--  fenêtre de 45 jours qui chevauche août et septembre : il apporte les
--  premiers jours de septembre ET des réquisitions d'août rattrapées ; le gel
--  corrige alors le score d'août (encore ouvert) sans redéclaration (ADR 0010).
--  2026-08 et 2026-09 sont les mois en cours, leur score est provisoire.
--
--  Narratif :
--   - CHR PUBLIC de DALOA : exemple du manuel (P1/P2/P3/P6 à 100, P4 à 50 —
--     1 produit SDU hors tolérance sur 2 —, P5 à 0 — concordance sous 100 % —
--     → composite 62,5 NON CONFORME).
--   - CHR PUBLIC de BONDOUKOU : vigilance chronique (P3 faible, écart SDU hors
--     tolérance mai-juin, réquisition en retard, ajustements).
--   - CSR-DM PUBLIC de BOBIA : réquisition jamais soumise → « rapport manquant ».
--   - CSU GONATE : core modifié après le gel → avertissement « données
--     modifiées depuis le gel ».
--   - DISTRICT SANITAIRE de NIAKARAMADOUGOU : P3 « distribution » (ADR 0011),
--     réponse aux réquisitions de sa zone (juin 2/3, juillet 3/3, août 2/3,
--     septembre 1/3). Les trois autres districts répondent bien.
--   - `/admin/strates` : les trois `type_structure` réels sont mappés (migration
--     0038) ; aucun « Non classé » dans ce jeu.
--
--  Rejouable : purge le core avant d'insérer.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

-- ── Identifiants réels (store.id mSupply) ─────────────────────────────────
\set d_bdk  '2C9D4FBD2B33F848BC3BA96DC0F0D120'
\set d_dal  '83313AC498EE094390691B9367D76D31'
\set d_gag  '0669E7D0A097B946B4ADD02A4DF4F4EE'
\set d_nia  'F7DAD29666D2BD4682A6F7DAD9BCDE52'
\set h_bdk  '2BDAD2F787F1C045A28E2A35277F5184'
\set h_dal  'AB256D09C93B3E4F970CE4E309F2D476'
\set h_gag  '36E8D6F20911964DA45689A89CF077EE'
\set h_nia  'AE3A0E11FFFA7C45A9BBC79715557E49'
\set e_tam  '54C8A3C005D2804DB4C1BE28FFD39928'
\set e_lao  'CEAE5C4E588FAA4B8FA73E0D2501B7B5'
\set e_bed  'A16C83E11D68604E8AABBBE1AD075DE8'
\set e_gon  '1E46EAD4C18A9D4D91077E7B53EF7592'
\set e_bob  '2742438AB5CE71448A8E41561E6D1851'
\set e_gue  'C18F82F669232948B3FA7F716337BEFE'
\set e_taf  '449CF4BC72A90F4480A745BC1979F64D'
\set e_tor  'D04EB0CDDB54E943917C4AAABDF040B2'

BEGIN;

TRUNCATE dqa.import_lot, dqa.dim_site, dqa.dim_programme, dqa.dim_produit
    RESTART IDENTITY CASCADE;

-- ── Lots d'import ────────────────────────────────────────────────────────
INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut, importe_le) VALUES
    ('demo_2026-05.xlsx', '2026-C2', '2026-05', '2026-05-01', '2026-05-31', 'valide', now()),
    ('demo_2026-06.xlsx', '2026-C2', '2026-06', '2026-06-01', '2026-06-30', 'valide', now()),
    ('demo_2026-07.xlsx', '2026-C2', '2026-07', '2026-07-01', '2026-07-31', 'valide', now()),
    ('demo_2026-08.xlsx', '2026-C2', '2026-08', '2026-08-01', '2026-08-31', 'valide', now());
INSERT INTO dqa.import_lot
    (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, fenetre_debut, fenetre_fin, statut, importe_le)
VALUES ('demo_2026-09.xlsx', '2026-C3', '2026-09', '2026-09-01', '2026-09-30',
        '2026-07-22', '2026-09-05', 'valide', now());

-- ── Programmes ──────────────────────────────────────────────────────────
INSERT INTO dqa.dim_programme (programme_id, programme_code, programme_nom, lot_id_source) VALUES
    ('PRG-VIH',  'VIH',  'VIH',       1),
    ('PRG-PALU', 'PALU', 'Paludisme', 1);

-- ── Sites réels ─────────────────────────────────────────────────────────
-- `type_structure` = le palier `name_category3` ; l'échéance de réquisition et
-- le régime de scoring viennent du référentiel administré (ADR 0013).
INSERT INTO dqa.dim_site
    (site_id, site_code, site_nom, district, region, type_structure, dans_perimetre_dqa, lot_id_source)
VALUES
    (:'d_bdk','50800010',    'DISTRICT SANITAIRE de BONDOUKOU',       'BONDOUKOU',       'GONTOUGO',       'District sanitaire',   true, 1),
    (:'d_dal','51600010',    'DISTRICT SANITAIRE de DALOA',           'DALOA',           'HAUT-SASSANDRA', 'District sanitaire',   true, 1),
    (:'d_gag','51300010',    'DISTRICT SANITAIRE de GAGNOA 1',        'GAGNOA 1',        'GOH',            'District sanitaire',   true, 1),
    (:'d_nia','51500030',    'DISTRICT SANITAIRE de NIAKARAMADOUGOU', 'NIAKARAMADOUGOU', 'HAMBOL',         'District sanitaire',   true, 1),
    (:'h_bdk','30800010',    'CHR PUBLIC de BONDOUKOU',               'BONDOUKOU',       'GONTOUGO',       'Hôpital de référence', true, 1),
    (:'h_dal','31600010',    'CHR PUBLIC de DALOA',                   'DALOA',           'HAUT-SASSANDRA', 'Hôpital de référence', true, 1),
    (:'h_gag','31300010',    'CHR PUBLIC de GAGNOA',                  'GAGNOA 1',        'GOH',            'Hôpital de référence', true, 1),
    (:'h_nia','41500020',    'HG PUBLIC de NIAKARAMADOUGOU',          'NIAKARAMADOUGOU', 'HAMBOL',         'Hôpital de référence', true, 1),
    (:'e_tam','14048CSR0031','CSR TAMBI',                             'BONDOUKOU',       'GONTOUGO',       'ESPC',                 true, 1),
    (:'e_lao','14048CSU0005','CSU LAOUDIBA',                          'BONDOUKOU',       'GONTOUGO',       'ESPC',                 true, 1),
    (:'e_bed','18063CSU0001','CSU BEDIALA',                           'DALOA',           'HAUT-SASSANDRA', 'ESPC',                 true, 1),
    (:'e_gon','18063CSU0005','CSU GONATE',                            'DALOA',           'HAUT-SASSANDRA', 'ESPC',                 true, 1),
    (:'e_bob','13045CSR0024','CSR-DM PUBLIC de BOBIA',                'GAGNOA 1',        'GOH',            'ESPC',                 true, 1),
    (:'e_gue','13045CSR0031','CSR-DM PUBLIC de GUEMENEDOU',           'GAGNOA 1',        'GOH',            'ESPC',                 true, 1),
    (:'e_taf','17061CSU0002','CSU TAFIRE',                            'NIAKARAMADOUGOU', 'HAMBOL',         'ESPC',                 true, 1),
    (:'e_tor','17061CSU0001','CSU TORTIYA',                           'NIAKARAMADOUGOU', 'HAMBOL',         'ESPC',                 true, 1);

INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif, lot_id_source)
SELECT s, 'PRG-VIH', true, 1  FROM (VALUES (:'h_bdk'),(:'h_dal'),(:'h_gag'),(:'h_nia')) AS v(s)
UNION ALL
SELECT s, 'PRG-PALU', true, 1 FROM (VALUES
    (:'d_bdk'),(:'d_dal'),(:'d_gag'),(:'d_nia'),
    (:'e_tam'),(:'e_lao'),(:'e_bed'),(:'e_gon'),(:'e_bob'),(:'e_gue'),(:'e_taf'),(:'e_tor')
) AS v(s);

-- ── Produits (4 traceurs de la liste réelle, migration 0013) ────────────
INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom, unite, lot_id_source) VALUES
    ('ITM-ARV', '3100014-ARV',  'DOLUTEGRAVIR/LAMIVUDINE/TENOFOVIR 50/300/300 mg comp. BTE/90', 'BTE', 1),
    ('ITM-ALU', '3050064-PNLP', 'ARTEMETHER/LUMEFANTRINE 20/120 mg ADULTE BTE/30',              'BTE', 1),
    ('ITM-TDR', '4030616-PNLP', 'TEST DE DIAGNOSTIC RAPIDE DU PALUDISME KIT/10',                'KIT', 1),
    ('ITM-HIV', '4040328-TRC',  'WONDFO HIV 1/2 TEST KIT/25',                                   'KIT', 1);

-- ═══════════════════════════════════════════════════════════════════════════
--  Générateur des trajectoires de traceurs
--
--  `_plan` : par (site, produit, programme, nature de sortie), le stock
--  d'ouverture, la réception mensuelle, la sortie mensuelle, le nombre de
--  jours de sortie (P3) et un bruit SDU (théorique = compté + bruit) mois par
--  mois. Contraintes : sortie_mois >= jours_sortie ; rec_mois ~ sortie_mois + 2
--  (le stock monte doucement). Sites réguliers : 22 jours de sortie / mois ;
--  CHR de Bondoukou et les districts : 7 (P3 en alerte).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _plan (
    site text, produit text, prog text, nature text,
    stock_ouv numeric, rec_mois numeric, sortie_mois numeric,
    jours_sortie int,
    sdu_bruit int[]   -- bruit théorique par mois [mai..sept] ; NULL -> 0
);
INSERT INTO _plan VALUES
    -- Hôpitaux de référence : VIH (ARV + test HIV)
    (:'h_bdk','ITM-ARV','PRG-VIH','dispensation', 380, 46, 44, 7,  ARRAY[12,10,3,2,2]),  -- CHR Bondoukou : P3 faible, SDU alerte mai-juin
    (:'h_bdk','ITM-HIV','PRG-VIH','dispensation', 130, 26, 24, 7,  NULL),
    (:'h_dal','ITM-ARV','PRG-VIH','dispensation', 380, 46, 44, 22, ARRAY[0,0,0,14,14]),  -- CHR Daloa : SDU ARV hors tol. août-sept (exemple manuel)
    (:'h_dal','ITM-HIV','PRG-VIH','dispensation', 130, 26, 24, 22, NULL),
    (:'h_gag','ITM-ARV','PRG-VIH','dispensation', 400, 48, 46, 22, NULL),
    (:'h_gag','ITM-HIV','PRG-VIH','dispensation', 140, 28, 26, 22, NULL),
    (:'h_nia','ITM-ARV','PRG-VIH','dispensation', 320, 42, 40, 22, NULL),
    (:'h_nia','ITM-HIV','PRG-VIH','dispensation', 110, 24, 22, 22, NULL),
    -- ESPC : Paludisme (ALU + certains TDR)
    (:'e_tam','ITM-ALU','PRG-PALU','dispensation', 150, 28, 26, 22, NULL),
    (:'e_tam','ITM-TDR','PRG-PALU','dispensation', 70,  26, 24, 22, NULL),
    (:'e_lao','ITM-ALU','PRG-PALU','dispensation', 90,  26, 24, 22, NULL),
    (:'e_bed','ITM-ALU','PRG-PALU','dispensation', 130, 28, 26, 22, NULL),
    (:'e_gon','ITM-ALU','PRG-PALU','dispensation', 140, 28, 26, 22, NULL),   -- CSU Gonate : ré-import après gel
    (:'e_gon','ITM-TDR','PRG-PALU','dispensation', 60,  26, 24, 22, NULL),
    (:'e_bob','ITM-ALU','PRG-PALU','dispensation', 110, 26, 24, 22, NULL),   -- CSR Bobia : réquisition jamais soumise
    (:'e_gue','ITM-ALU','PRG-PALU','dispensation', 120, 28, 26, 22, NULL),
    (:'e_gue','ITM-TDR','PRG-PALU','dispensation', 55,  26, 24, 22, NULL),
    (:'e_taf','ITM-ALU','PRG-PALU','dispensation', 100, 26, 24, 22, NULL),
    (:'e_tor','ITM-ALU','PRG-PALU','dispensation', 95,  26, 24, 22, NULL),
    -- Districts : distributions vers la zone (ALU + TDR)
    (:'d_bdk','ITM-ALU','PRG-PALU','distribution', 120, 30, 28, 7,  NULL),
    (:'d_bdk','ITM-TDR','PRG-PALU','distribution', 55,  16, 15, 7,  NULL),
    (:'d_dal','ITM-ALU','PRG-PALU','distribution', 130, 32, 30, 7,  NULL),
    (:'d_dal','ITM-TDR','PRG-PALU','distribution', 60,  16, 15, 7,  NULL),
    (:'d_gag','ITM-ALU','PRG-PALU','distribution', 125, 30, 28, 7,  NULL),
    (:'d_gag','ITM-TDR','PRG-PALU','distribution', 58,  16, 15, 7,  NULL),
    (:'d_nia','ITM-ALU','PRG-PALU','distribution', 120, 30, 28, 7,  NULL),
    (:'d_nia','ITM-TDR','PRG-PALU','distribution', 55,  16, 15, 7,  NULL);

DO $gen$
DECLARE
    p           _plan%ROWTYPE;
    m           int;
    mois        text;
    lot         int;
    d_rec       date;
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

        IF m = 5 THEN
            -- septembre : mois EN COURS (5 jours de données). AUCUN inventaire
            -- de fin de mois n'a encore été fait -> P1/P2 (complétude,
            -- promptitude) et P4/P5 (écart SDU, concordance, écart conso, faute
            -- de borne de clôture) restent à 0. Seuls P3 (régularité, au fil de
            -- l'eau) et P6 (ajustements) sont mesurés.
            q_cumul := 5;
            stock   := stock_prec - 5;
        ELSE
            q_cumul := p.sortie_mois;
            stock   := stock_prec + p.rec_mois - p.sortie_mois;

            bruit := COALESCE(p.sdu_bruit[m], 0);
            theo  := stock + bruit;

            -- inventaire de fin de mois
            inv_clot := format('INV-%s-%s-%s', p.site, replace(p.produit,'ITM-',''), mois);
            INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
            VALUES (inv_clot, p.site, p.prog, fin_mois[m], 'fn', lot)
            ON CONFLICT (inventaire_id) DO NOTHING;
            INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
            VALUES (inv_clot, p.produit, 'L1', theo, stock, lot);
        END IF;

        -- en mai : un second inventaire, le 1er du mois (borne d'ouverture)
        IF m = 1 THEN
            inv_ouv := format('INV-%s-%s-%s-ouv', p.site, replace(p.produit,'ITM-',''), mois);
            INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
            VALUES (inv_ouv, p.site, p.prog, DATE '2026-05-01', 'fn', lot)
            ON CONFLICT (inventaire_id) DO NOTHING;
            INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
            VALUES (inv_ouv, p.produit, 'L1', p.stock_ouv, p.stock_ouv, lot);
        END IF;

        -- réception mensuelle (sauf septembre)
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

        -- sorties : les `jours_sortie` premiers jours ouvrés du mois ;
        -- q_cumul réparti exactement (split entier). En mai on démarre le 2.
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
            IF q <= 0 THEN CONTINUE; END IF;

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

-- ── Ajustements de stock (P6) : quelques mouvements, peu d'ajustements ───
INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
VALUES
    ('AJ-BDK-06', :'h_bdk','ajustement_negatif','PRG-VIH', 'fn','2026-06-16','2026-06-16',2),
    ('AJ-BDK-07', :'h_bdk','ajustement_negatif','PRG-VIH', 'fn','2026-07-19','2026-07-19',3),
    ('AJ-BDK-08', :'h_bdk','ajustement_negatif','PRG-VIH', 'fn','2026-08-14','2026-08-14',4),
    ('AJ-GAG-07', :'h_gag','ajustement_positif','PRG-VIH', 'fn','2026-07-15','2026-07-15',3);
INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
VALUES
    ('AJ-BDK-06-L','AJ-BDK-06','ITM-ARV','PRG-VIH',-6,1,true,2),
    ('AJ-BDK-07-L','AJ-BDK-07','ITM-HIV','PRG-VIH',-4,1,true,3),
    ('AJ-BDK-08-L','AJ-BDK-08','ITM-ARV','PRG-VIH',-5,1,true,4),
    ('AJ-GAG-07-L','AJ-GAG-07','ITM-ARV','PRG-VIH', 4,1,true,3);

-- ── Factures fournisseur (dénominateur de la complétude des réceptions P1) ─
--  Une facture par réception de traceur pour les hôpitaux + BEDIALA / GUEMENEDOU
--  (ratio 100 %) ; pour CHR Bondoukou, une facture de plus par mois -> alerte.
INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT 'FA-' || rc.transaction_id, rc.site_id, 'facture_fournisseur', rc.programme_id, 'fn',
       rc.date_confirmation, rc.date_confirmation, rc.lot_id_source
FROM dqa.fact_transaction rc
WHERE rc.nature = 'reception'
  AND rc.site_id IN (:'h_bdk',:'h_dal',:'h_gag',:'h_nia',:'e_bed',:'e_gue');

INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, lot_id_source)
SELECT format('FA-BDK-EXTRA-%s', m.mois), :'h_bdk', 'facture_fournisseur', 'PRG-VIH', 'fn',
       (m.mois || '-06')::date, (m.mois || '-06')::date, m.lot
FROM (VALUES ('2026-05',1),('2026-06',2),('2026-07',3),('2026-08',4)) AS m(mois, lot);

-- ── Réquisitions (rapports mensuels) : à l'heure, en retard, manquantes ──
--  Limite : mois M+1 + (jour_limite - 1). ESPC -> 5, Hôpital de référence -> 7,
--  District sanitaire -> 10 (référentiel des structures, ADR 0013).
--
--  Chaque site de la zone d'un district (hôpital + ESPC du même `district`)
--  soumet une réquisition couvrant M ; elle sert P1/P2 ET le P3 du district
--  (réquisitions de la zone couvrant M-1). Le district soumet aussi la sienne.
INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
SELECT format('REQ-%s-%s', s.tag, m.mc), s.sid, s.prg, m.mc,
       (to_char((m.mc || '-01')::date + interval '1 month', 'YYYY-MM') || '-' || s.jj)::date,
       (m.mc || '-28')::date, 'fn', m.lot
FROM (VALUES
    -- (tag, site, programme, jour de soumission dans M+1)
    ('DBDK', :'d_bdk','PRG-PALU','09'), ('DDAL', :'d_dal','PRG-PALU','09'),
    ('DGAG', :'d_gag','PRG-PALU','09'), ('DNIA', :'d_nia','PRG-PALU','09'),
    ('HDAL', :'h_dal','PRG-VIH','03'),  ('HGAG', :'h_gag','PRG-VIH','04'),
    ('HNIA', :'h_nia','PRG-VIH','04'),
    ('ETAM', :'e_tam','PRG-PALU','04'), ('ELAO', :'e_lao','PRG-PALU','04'),
    ('EBED', :'e_bed','PRG-PALU','04'), ('EGON', :'e_gon','PRG-PALU','04'),
    ('EGUE', :'e_gue','PRG-PALU','04'), ('ETAF', :'e_taf','PRG-PALU','04'),
    ('ETOR', :'e_tor','PRG-PALU','04')
) AS s(tag, sid, prg, jj)
CROSS JOIN (VALUES ('2026-05',1),('2026-06',2),('2026-07',3),('2026-08',4)) AS m(mc, lot)
-- CHR de Daloa et district de Daloa : leur réquisition d'août n'est PAS dans le
-- lot d'août, elle arrive par le lot du 5 septembre (bloc « rattrapées »).
WHERE NOT (s.tag IN ('HDAL','DDAL') AND m.mc = '2026-08');

-- CHR de Bondoukou : réquisition chroniquement en retard (soumise le 9-11 du
-- mois suivant, limite le 7).
INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
VALUES
    ('REQ-HBDK-2026-05', :'h_bdk','PRG-VIH','2026-05','2026-06-11','2026-05-28','fn',1),
    ('REQ-HBDK-2026-06', :'h_bdk','PRG-VIH','2026-06','2026-07-10','2026-06-28','fn',2),
    ('REQ-HBDK-2026-07', :'h_bdk','PRG-VIH','2026-07','2026-08-06','2026-07-28','fn',3),  -- à l'heure
    ('REQ-HBDK-2026-08', :'h_bdk','PRG-VIH','2026-08','2026-09-09','2026-08-28','fn',4);  -- en retard

-- CSR-DM PUBLIC de BOBIA : aucune réquisition -> « rapport manquant » chronique.
-- (rien à insérer)

-- ── Réponses des districts aux réquisitions de leur zone ────────────────
--  Distribution (nature 'distribution', requisition_id renseigné), datée dans
--  le mois PAQD = mois couvert + 1. NIAKARAMADOUGOU répond partiellement
--  (juin 2/3, juillet 3/3, août 2/3, septembre 1/3) ; les autres répondent à
--  toute leur zone.
INSERT INTO dqa.fact_transaction
    (transaction_id, site_id, nature, programme_id, statut, date_saisie, date_confirmation, requisition_id, lot_id_source)
SELECT format('RZ-%s', r.requisition_id), r.district_id, 'distribution', 'PRG-PALU', 'fn',
       r.jour, r.jour, r.requisition_id, r.lot
FROM (
    -- toutes les réquisitions de zone (sites du même district que le district),
    -- avec la date de service = 13-19 du mois PAQD
    SELECT fr.requisition_id, fr.site_id, fr.mois_couvert,
           dd.site_id AS district_id,
           (to_char((fr.mois_couvert || '-01')::date + interval '1 month', 'YYYY-MM')
             || '-' || lpad((10 + (row_number() OVER (PARTITION BY dd.site_id, fr.mois_couvert))*3)::text, 2, '0'))::date AS jour,
           (extract(month FROM (fr.mois_couvert || '-01')::date)::int - 3) AS lot
    FROM dqa.fact_requisition fr
    JOIN dqa.dim_site s   ON s.site_id = fr.site_id
    JOIN dqa.dim_site dd  ON dd.district = s.district AND dqa.strate_de(dd.type_structure) = 'District'
    WHERE s.site_id <> dd.site_id
      AND dqa.strate_de(s.type_structure) <> 'District'
) r
-- NIAKARAMADOUGOU : on retire une réquisition servie en juin, une en août, deux
-- en septembre pour obtenir 2/3, 2/3, 1/3.
WHERE NOT (
    r.district_id = :'d_nia' AND (
        (r.mois_couvert = '2026-05' AND r.site_id = :'e_tor') OR   -- juin 2/3
        (r.mois_couvert = '2026-07' AND r.site_id = :'e_tor') OR   -- août 2/3
        (r.mois_couvert = '2026-08' AND r.site_id IN (:'h_nia', :'e_tor'))  -- sept 1/3
    )
);
INSERT INTO dqa.fact_ligne_transaction
    (ligne_id, transaction_id, produit_id, programme_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
SELECT transaction_id || '-L', transaction_id, 'ITM-ALU', 'PRG-PALU', 20, 1, false, lot_id_source
FROM dqa.fact_transaction WHERE nature = 'distribution' AND requisition_id IS NOT NULL;

-- ── Photos de stock (fiche produit-mois du CHR de Daloa) ────────────────
INSERT INTO dqa.fact_stock_snapshot (date_photo, site_id, produit_id, lot, quantite_disponible, lot_id_source)
VALUES
    ('2026-08-08', :'h_dal', 'ITM-ARV', 'L1', 384, 4),
    ('2026-08-18', :'h_dal', 'ITM-ARV', 'L1', 372, 4),
    ('2026-08-28', :'h_dal', 'ITM-ARV', 'L1', 389, 4),
    ('2026-09-03', :'h_dal', 'ITM-ARV', 'L1', 380, 5);

-- ── Réquisitions d'août rattrapées, apportées par le lot de septembre ───
--  Dans la fenêtre de 45 jours, soumises avant l'échéance -> à l'heure. Le gel
--  du lot 5 reconstitue août (encore ouvert), le score remonte, sans
--  redéclarer août (ADR 0010).
INSERT INTO dqa.fact_requisition
    (requisition_id, site_id, programme_id, mois_couvert, date_soumission, date_inventaire_ref, statut, lot_id_source)
VALUES
    ('REQ-HDAL-2026-08', :'h_dal','PRG-VIH', '2026-08','2026-09-04','2026-08-28','fn',5),
    ('REQ-DDAL-2026-08', :'d_dal','PRG-PALU','2026-08','2026-09-05','2026-08-28','fn',5);

-- ── Gel : un seul appel reconstitue mai à septembre (ADR 0010) ──────────
CALL dqa.rafraichir_et_geler(5);

COMMIT;

-- ── Ré-import « après le gel » de CSU GONATE : bouge le core sans regeler ─
UPDATE dqa.fact_transaction SET maj_le = now() + interval '1 day' WHERE site_id = :'e_gon';
UPDATE dqa.fact_inventaire  SET maj_le = now() + interval '1 day' WHERE site_id = :'e_gon';

\echo 'Seed de démonstration appliqué : 16 sites réels (4 districts + zones), 2026-05 à 2026-09. Août et septembre en cours.'
