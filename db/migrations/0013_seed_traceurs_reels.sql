-- ═══════════════════════════════════════════════════════════════════════════
--  Produits traceurs — liste réelle
--  Reprise des 13 produits marqués traceurs dans l'onglet PRODUITS du fichier
--  d'extraction fourni par la DAP (Canevas_Extraction_mSupply_DQA.xlsx).
--  `produit_code` correspond à `item.code` dans mSupply.
--
--  À revoir à chaque cycle PAQD si le panier traceur évolue.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DELETE FROM dim_produit_traceur WHERE produit_code LIKE '\_\_PLACEHOLDER%';

INSERT INTO dim_produit_traceur (produit_code, libelle) VALUES
    ('5060001-GTC',  'KIT ACCOUCHEMENT'),
    ('5060001-GGV',  'KIT ACCOUCHEMENT (gros volume)'),
    ('3050498-PNLP', 'ARTEMETHER/LUMEFANTRINE 80/480 mg PLAQ/6 comp. BTE/1'),
    ('3050064-PNLP', 'ARTEMETHER/LUMEFANTRINE 20/120 mg ADULTE PLAQ/24 comp. BTE/30'),
    ('4030616-PNLP', 'TEST DE DIAGNOSTIC RAPIDE DU PALUDISME KIT/10'),
    ('3100014-ARV',  'DOLUTEGRAVIR/LAMIVUDINE/TENOFOVIR 50/300/300 mg comp. BTE/90'),
    ('4040328-TRC',  'WONDFO HIV 1/2 TEST KIT/25'),
    ('3050355-SNS',  'RHZ 75 (RIFAMPICINE 75 + ISONIAZIDE 50 + PYRAZINAMIDE 150) CP BTE/84'),
    ('3050356-SNS',  'RHZE (RIFAMP 150 / ISON 75 / PYRAZ 400 / ETHAM 275) comp. BTE/672'),
    ('3150049-PNN',  'VITAMINE A 100 000 UI caps BTE/100'),
    ('3150050-PNN',  'VITAMINE A 200 000 UI caps'),
    ('3230040-PNN',  'PLUMPY NUT sach 92 g carton/150'),
    ('3120022-SGT',  'SULFATE DE MAGNESIUM 500 mg/ml amp 2 ml BTE/10')
ON CONFLICT (produit_code) DO UPDATE SET libelle = EXCLUDED.libelle;
