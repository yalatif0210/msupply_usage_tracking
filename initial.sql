-- ═══════════════════════════════════════════════════════════════════════════
--  MODÈLE DE DONNÉES — TABLEAU DE BORD DQA mSupply
--  Alimentation par exports Excel périodiques transmis par la DAP
--
--  LHSPLA-TA / Nouvelle PSP-CI
--  Cible : PostgreSQL 14+
--
--  ARCHITECTURE EN TROIS COUCHES
--  ─────────────────────────────
--   1. STAGING (stg_*)  : miroir brut des onglets Excel, tout en TEXT.
--                         Aucune contrainte. Tolère les données sales.
--   2. CORE (dim_/fact_): données typées, dédoublonnées, historisées.
--                         C'est la vérité du système.
--   3. INDICATEURS (mv_*): vues matérialisées calculant les indicateurs PAQD.
--                         C'est ce que le tableau de bord interroge.
--
--  Pourquoi trois couches : un export Excel manuel arrive parfois avec des
--  dates au mauvais format, des colonnes décalées ou des lignes vides. La
--  couche staging absorbe tout sans échouer ; la promotion vers le core ne
--  laisse passer que ce qui est valide, et journalise le reste.
-- ═══════════════════════════════════════════════════════════════════════════


CREATE SCHEMA IF NOT EXISTS dqa;
SET search_path TO dqa, public;


-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 0 — CONTRÔLE DES IMPORTS
--  Traçabilité de chaque fichier Excel reçu. Indispensable avec un flux
--  manuel : c'est le seul moyen de savoir quel fichier a produit quelle
--  donnée et de détecter une semaine manquante.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS import_lot (
    id                  BIGSERIAL PRIMARY KEY,
    nom_fichier         TEXT        NOT NULL,
    empreinte_sha256    TEXT        NOT NULL,       -- détecte un fichier renvoyé deux fois
    date_export_declaree DATE       NOT NULL,       -- issue de l'onglet METADATA
    periode_debut       DATE        NOT NULL,       -- issue de l'onglet METADATA
    periode_fin         DATE        NOT NULL,
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    importe_le          TIMESTAMPTZ,
    statut              TEXT        NOT NULL DEFAULT 'recu'
                        CHECK (statut IN ('recu','en_cours','valide','rejete')),
    nb_lignes_declarees JSONB,                      -- compteurs annoncés par onglet
    nb_lignes_reelles   JSONB,                      -- compteurs constatés à la lecture
    commentaire         TEXT,
    UNIQUE (empreinte_sha256)
);

COMMENT ON TABLE import_lot IS
    'Un enregistrement par fichier Excel reçu de la DAP. L''empreinte SHA-256 empêche le double import du même fichier.';

CREATE TABLE IF NOT EXISTS import_anomalie (
    id              BIGSERIAL PRIMARY KEY,
    lot_id          BIGINT      NOT NULL REFERENCES import_lot(id) ON DELETE CASCADE,
    onglet          TEXT        NOT NULL,
    ligne_source    INTEGER,                        -- n° de ligne dans l'onglet Excel
    gravite         TEXT        NOT NULL DEFAULT 'avertissement'
                    CHECK (gravite IN ('info','avertissement','erreur')),
    code            TEXT        NOT NULL,           -- ex: DATE_INVALIDE, SITE_INCONNU
    message         TEXT        NOT NULL,
    valeur_brute    TEXT,
    detecte_le      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomalie_lot ON import_anomalie(lot_id, gravite);

COMMENT ON TABLE import_anomalie IS
    'Journal des problèmes rencontrés à l''import. Permet de renvoyer un retour précis à la DAP plutôt qu''un simple "le fichier est invalide".';


-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 1 — STAGING
--  Miroir exact des onglets Excel. Toutes les colonnes en TEXT : on ne
--  refuse aucune ligne à ce stade, on veut d'abord tout capturer.
-- ═══════════════════════════════════════════════════════════════════════════

-- Onglet « SITES »
CREATE TABLE IF NOT EXISTS stg_sites (
    lot_id          BIGINT REFERENCES import_lot(id) ON DELETE CASCADE,
    ligne_source    INTEGER,
    site_id         TEXT,
    site_code       TEXT,
    site_nom        TEXT,
    district        TEXT,
    region          TEXT,
    type_structure  TEXT,
    actif           TEXT
);

-- Onglet « PRODUITS »
CREATE TABLE IF NOT EXISTS stg_produits (
    lot_id          BIGINT REFERENCES import_lot(id) ON DELETE CASCADE,
    ligne_source    INTEGER,
    produit_id      TEXT,
    produit_code    TEXT,
    produit_nom     TEXT,
    unite           TEXT,
    est_traceur     TEXT,
    programme       TEXT
);

-- Onglet « TRANSACTIONS »
CREATE TABLE IF NOT EXISTS stg_transactions (
    lot_id              BIGINT REFERENCES import_lot(id) ON DELETE CASCADE,
    ligne_source        INTEGER,
    transaction_id      TEXT,
    site_id             TEXT,
    type_transaction    TEXT,
    statut              TEXT,
    date_confirmation   TEXT,
    date_saisie         TEXT,
    date_livraison      TEXT,
    utilisateur         TEXT,
    commentaire         TEXT,
    requisition_id      TEXT
);

-- Onglet « LIGNES_TRANSACTIONS » (restreint aux produits traceurs)
CREATE TABLE IF NOT EXISTS stg_lignes_transactions (
    lot_id          BIGINT REFERENCES import_lot(id) ON DELETE CASCADE,
    ligne_source    INTEGER,
    ligne_id        TEXT,
    transaction_id  TEXT,
    site_id         TEXT,
    produit_id      TEXT,
    lot_produit     TEXT,
    quantite        TEXT,
    taille_conditionnement TEXT,
    date_peremption TEXT
);

-- Onglet « STOCK_ACTUEL » (photographie à la date d'export)
CREATE TABLE IF NOT EXISTS stg_stock_actuel (
    lot_id              BIGINT REFERENCES import_lot(id) ON DELETE CASCADE,
    ligne_source        INTEGER,
    site_id             TEXT,
    produit_id          TEXT,
    lot_produit         TEXT,
    quantite_disponible TEXT,
    date_peremption     TEXT,
    date_photo          TEXT
);

-- Onglet « INVENTAIRES »
CREATE TABLE IF NOT EXISTS stg_inventaires (
    lot_id              BIGINT REFERENCES import_lot(id) ON DELETE CASCADE,
    ligne_source        INTEGER,
    inventaire_id       TEXT,
    site_id             TEXT,
    produit_id          TEXT,
    date_inventaire     TEXT,
    quantite_comptee    TEXT,
    quantite_theorique  TEXT,
    statut              TEXT
);

-- Onglet « REQUISITIONS »
CREATE TABLE IF NOT EXISTS stg_requisitions (
    lot_id              BIGINT REFERENCES import_lot(id) ON DELETE CASCADE,
    ligne_source        INTEGER,
    requisition_id      TEXT,
    site_id             TEXT,
    statut              TEXT,
    date_saisie         TEXT,
    date_inventaire_ref TEXT,
    date_reception      TEXT,
    type_requisition    TEXT
);


-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 2 — CORE
--  Données typées et dédoublonnées. C'est ici que le tableau de bord
--  puise sa vérité.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Dimensions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dim_site (
    site_id         TEXT PRIMARY KEY,               -- identifiant mSupply
    site_code       TEXT,
    site_nom        TEXT        NOT NULL,
    district        TEXT,
    region          TEXT,
    type_structure  TEXT,
    actif           BOOLEAN     NOT NULL DEFAULT TRUE,
    dans_perimetre_dqa BOOLEAN  NOT NULL DEFAULT FALSE,  -- les 40 sites de la mission
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    maj_le          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_district ON dim_site(district) WHERE actif;
CREATE INDEX IF NOT EXISTS idx_site_perimetre ON dim_site(dans_perimetre_dqa) WHERE dans_perimetre_dqa;

COMMENT ON COLUMN dim_site.dans_perimetre_dqa IS
    'Marque les 40 sites de la mission DQA. Permet de calculer les scores nationaux sans polluer avec les autres sites.';


CREATE TABLE IF NOT EXISTS dim_produit (
    produit_id      TEXT PRIMARY KEY,
    produit_code    TEXT,
    produit_nom     TEXT        NOT NULL,
    unite           TEXT,
    est_traceur     BOOLEAN     NOT NULL DEFAULT FALSE,
    programme       TEXT,                           -- VIH, TB, PALU, SR...
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    maj_le          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produit_traceur ON dim_produit(est_traceur) WHERE est_traceur;

COMMENT ON COLUMN dim_produit.est_traceur IS
    'Produits traceurs retenus pour les calculs de précision SDU (P3) et de concordance (P5).';


-- Calendrier : indispensable pour calculer la régularité des dispensations,
-- qui compte les jours SANS saisie autant que ceux avec.
CREATE TABLE IF NOT EXISTS dim_temps (
    jour            DATE PRIMARY KEY,
    annee           INTEGER     NOT NULL,
    mois            INTEGER     NOT NULL,
    libelle_mois    TEXT        NOT NULL,
    semaine_iso     INTEGER     NOT NULL,
    jour_semaine    INTEGER     NOT NULL,           -- 1 = lundi
    est_ouvrable    BOOLEAN     NOT NULL DEFAULT TRUE,
    periode_dqa     TEXT                            -- M+1, M+2, M+3, M+4
);


-- ── Faits ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fact_transaction (
    transaction_id      TEXT PRIMARY KEY,           -- id mSupply, stable
    site_id             TEXT        NOT NULL REFERENCES dim_site(site_id),
    type_transaction    TEXT        NOT NULL,       -- ci, si, sc, ri, im+, im-
    statut              TEXT        NOT NULL,
    date_confirmation   DATE,
    date_saisie         DATE,
    date_livraison      DATE,                       -- ship_date, pour le délai de réception
    utilisateur         TEXT,
    commentaire         TEXT,
    requisition_id      TEXT,
    lot_id_source       BIGINT REFERENCES import_lot(id),
    maj_le              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_site_type_date
    ON fact_transaction(site_id, type_transaction, date_confirmation);
CREATE INDEX IF NOT EXISTS idx_tx_date_conf
    ON fact_transaction(date_confirmation);
CREATE INDEX IF NOT EXISTS idx_tx_ajustements
    ON fact_transaction(site_id, date_confirmation)
    WHERE type_transaction IN ('im+','im-');

COMMENT ON TABLE fact_transaction IS
    'Grain : une transaction mSupply. Alimente P2 (complétude, promptitude) et P4 (ajustements).';


CREATE TABLE IF NOT EXISTS fact_ligne_transaction (
    ligne_id                TEXT PRIMARY KEY,
    transaction_id          TEXT        NOT NULL REFERENCES fact_transaction(transaction_id) ON DELETE CASCADE,
    site_id                 TEXT        NOT NULL REFERENCES dim_site(site_id),
    produit_id              TEXT        NOT NULL REFERENCES dim_produit(produit_id),
    lot_produit             TEXT,
    quantite                NUMERIC(18,3) NOT NULL DEFAULT 0,
    taille_conditionnement  NUMERIC(12,3) NOT NULL DEFAULT 1,
    quantite_unitaire       NUMERIC(18,3) GENERATED ALWAYS AS
                            (quantite * taille_conditionnement) STORED,
    date_peremption         DATE,
    lot_id_source           BIGINT REFERENCES import_lot(id),
    maj_le                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ligne_site_produit
    ON fact_ligne_transaction(site_id, produit_id);
CREATE INDEX IF NOT EXISTS idx_ligne_transaction
    ON fact_ligne_transaction(transaction_id);

COMMENT ON TABLE fact_ligne_transaction IS
    'Grain : une ligne produit d''une transaction. Restreint aux produits traceurs pour limiter le volume des exports. Alimente P3 (écart SDU).';
COMMENT ON COLUMN fact_ligne_transaction.quantite_unitaire IS
    'Quantité ramenée à l''unité de dispensation. Évite les erreurs de comparaison entre lignes exprimées en boîtes et en unités.';


-- Photographie du stock à chaque export. Le fait d'avoir une date de photo
-- transforme une simple donnée courante en série temporelle exploitable.
CREATE TABLE IF NOT EXISTS fact_stock_snapshot (
    id                  BIGSERIAL PRIMARY KEY,
    date_photo          DATE        NOT NULL,
    site_id             TEXT        NOT NULL REFERENCES dim_site(site_id),
    produit_id          TEXT        NOT NULL REFERENCES dim_produit(produit_id),
    lot_produit         TEXT,
    quantite_disponible NUMERIC(18,3) NOT NULL DEFAULT 0,
    date_peremption     DATE,
    lot_id_source       BIGINT REFERENCES import_lot(id),
    UNIQUE (date_photo, site_id, produit_id, lot_produit)
);

CREATE INDEX IF NOT EXISTS idx_stock_site_produit_date
    ON fact_stock_snapshot(site_id, produit_id, date_photo DESC);

COMMENT ON TABLE fact_stock_snapshot IS
    'Grain : stock d''un lot produit dans un site à une date d''export. Alimente P5 (stock théorique). L''historisation permet de tracer l''évolution du stock entre deux exports.';


CREATE TABLE IF NOT EXISTS fact_inventaire (
    id                  BIGSERIAL PRIMARY KEY,
    inventaire_id       TEXT        NOT NULL,
    site_id             TEXT        NOT NULL REFERENCES dim_site(site_id),
    produit_id          TEXT        NOT NULL REFERENCES dim_produit(produit_id),
    date_inventaire     DATE        NOT NULL,
    quantite_comptee    NUMERIC(18,3) NOT NULL DEFAULT 0,
    quantite_theorique  NUMERIC(18,3),
    ecart_absolu        NUMERIC(18,3) GENERATED ALWAYS AS
                        (quantite_comptee - COALESCE(quantite_theorique, 0)) STORED,
    statut              TEXT,
    lot_id_source       BIGINT REFERENCES import_lot(id),
    UNIQUE (inventaire_id, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_site_date
    ON fact_inventaire(site_id, date_inventaire DESC);

COMMENT ON TABLE fact_inventaire IS
    'Grain : comptage physique d''un produit lors d''un inventaire. Alimente P5 (concordance physique/théorique).';


CREATE TABLE IF NOT EXISTS fact_requisition (
    requisition_id      TEXT PRIMARY KEY,
    site_id             TEXT        NOT NULL REFERENCES dim_site(site_id),
    statut              TEXT,
    date_saisie         DATE,
    date_inventaire_ref DATE,                       -- inventaire de fin de mois de référence
    date_reception      DATE,
    type_requisition    TEXT,
    delai_soumission_j  INTEGER GENERATED ALWAYS AS
                        (date_saisie - date_inventaire_ref) STORED,
    lot_id_source       BIGINT REFERENCES import_lot(id),
    maj_le              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_site_date
    ON fact_requisition(site_id, date_saisie);

COMMENT ON COLUMN fact_requisition.delai_soumission_j IS
    'Délai entre l''inventaire de référence et la soumission. Seuils PAQD : 5, 7 ou 10 jours selon le type de structure.';


-- ── Paramétrage des seuils PAQD ────────────────────────────────────────────
-- Externalisé en table plutôt qu'en dur dans les vues : les seuils peuvent
-- évoluer entre deux cycles sans qu'il faille modifier le code SQL.

CREATE TABLE IF NOT EXISTS param_seuil (
    code_indicateur TEXT PRIMARY KEY,
    libelle         TEXT        NOT NULL,
    pilier          TEXT        NOT NULL,
    poids_pct       NUMERIC(5,2),                   -- poids dans le score composite
    seuil_conforme  NUMERIC(8,2),
    seuil_partiel   NUMERIC(8,2),
    sens            TEXT        NOT NULL DEFAULT 'sup'
                    CHECK (sens IN ('sup','inf')),  -- sup = plus haut est mieux
    unite           TEXT        NOT NULL DEFAULT 'pct'
);

INSERT INTO param_seuil (code_indicateur, libelle, pilier, poids_pct, seuil_conforme, seuil_partiel, sens, unite) VALUES
    ('P2_COMPLETUDE',    'Complétude des transactions',           'P2', 25.00, 100.00,  80.00, 'sup', 'pct'),
    ('P2_REGULARITE',    'Régularité de saisie des dispensations','P2', 15.00,  65.00,  50.00, 'sup', 'pct'),
    ('P2_DELAI_RECEP',   'Délai de saisie des réceptions',        'P2',  NULL,   1.00,   3.00, 'inf', 'jours'),
    ('P3_ECART_SDU',     'Écart SDU sur produits traceurs',       'P3', 25.00,   2.00,   5.00, 'inf', 'pct'),
    ('P4_RATIO_AJUST',   'Ratio des ajustements',                 'P4', 10.00,   5.00,  10.00, 'inf', 'pct'),
    ('P5_CONCORDANCE',   'Concordance physique / théorique',      'P5', 25.00,  90.00,  75.00, 'sup', 'pct'),
    ('SCORE_COMPOSITE',  'Score composite DQA',                   'GLOBAL', NULL, 90.00, 75.00, 'sup', 'pct')
ON CONFLICT (code_indicateur) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — INDICATEURS PAQD
--  Vues matérialisées interrogées directement par le tableau de bord.
--  Rafraîchies après chaque import validé.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── P2 — Régularité de saisie des dispensations ────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_p2_regularite CASCADE;
CREATE MATERIALIZED VIEW mv_p2_regularite AS
WITH bornes AS (
    SELECT MIN(jour) AS debut, MAX(jour) AS fin
    FROM dim_temps
    WHERE periode_dqa IS NOT NULL
),
jours_ouvrables AS (
    SELECT t.jour
    FROM dim_temps t, bornes b
    WHERE t.jour BETWEEN b.debut AND b.fin
      AND t.est_ouvrable
),
saisies AS (
    SELECT DISTINCT site_id, date_confirmation AS jour
    FROM fact_transaction
    WHERE type_transaction = 'si'
      AND statut = 'fn'
      AND date_confirmation IS NOT NULL
)
SELECT
    s.site_id,
    s.site_nom,
    s.district,
    COUNT(DISTINCT sa.jour)                                    AS jours_avec_saisie,
    (SELECT COUNT(*) FROM jours_ouvrables)                     AS jours_attendus,
    ROUND(
        COUNT(DISTINCT sa.jour)::numeric
        / NULLIF((SELECT COUNT(*) FROM jours_ouvrables), 0) * 100
    , 1)                                                       AS taux_regularite_pct,
    CASE
        WHEN COUNT(DISTINCT sa.jour)::numeric
             / NULLIF((SELECT COUNT(*) FROM jours_ouvrables), 0) * 100 >= 65 THEN 'CONFORME'
        WHEN COUNT(DISTINCT sa.jour)::numeric
             / NULLIF((SELECT COUNT(*) FROM jours_ouvrables), 0) * 100 >= 50 THEN 'PARTIEL'
        ELSE 'ALERTE'
    END                                                        AS statut
FROM dim_site s
LEFT JOIN saisies sa ON sa.site_id = s.site_id
WHERE s.actif AND s.dans_perimetre_dqa
GROUP BY s.site_id, s.site_nom, s.district;

CREATE UNIQUE INDEX ON mv_p2_regularite(site_id);


-- ── P2 — Présence des transactions obligatoires ────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_p2_completude CASCADE;
CREATE MATERIALIZED VIEW mv_p2_completude AS
SELECT
    t.site_id,
    s.site_nom,
    s.district,
    TO_CHAR(t.date_confirmation, 'YYYY-MM')                    AS mois,
    COUNT(DISTINCT t.type_transaction)                         AS nb_types_presents,
    ARRAY_AGG(DISTINCT t.type_transaction ORDER BY t.type_transaction) AS types_presents,
    ROUND(COUNT(DISTINCT t.type_transaction)::numeric / 5 * 100, 1)    AS taux_completude_pct,
    CASE WHEN COUNT(DISTINCT t.type_transaction) >= 5
         THEN 'CONFORME' ELSE 'ALERTE' END                     AS statut
FROM fact_transaction t
JOIN dim_site s ON s.site_id = t.site_id
WHERE t.type_transaction IN ('ci','si','sc','ri','im+')
  AND t.statut = 'fn'
  AND t.date_confirmation IS NOT NULL
  AND s.dans_perimetre_dqa
GROUP BY t.site_id, s.site_nom, s.district, TO_CHAR(t.date_confirmation, 'YYYY-MM');

CREATE UNIQUE INDEX ON mv_p2_completude(site_id, mois);


-- ── P2 — Délai de saisie des réceptions ────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_p2_delai_reception CASCADE;
CREATE MATERIALIZED VIEW mv_p2_delai_reception AS
SELECT
    t.transaction_id,
    t.site_id,
    s.site_nom,
    s.district,
    t.date_livraison,
    t.date_saisie,
    (t.date_saisie - t.date_livraison)                         AS delai_jours,
    CASE
        WHEN (t.date_saisie - t.date_livraison) <= 1 THEN 'CONFORME'
        WHEN (t.date_saisie - t.date_livraison) <= 3 THEN 'PARTIEL'
        ELSE 'ALERTE'
    END                                                        AS statut
FROM fact_transaction t
JOIN dim_site s ON s.site_id = t.site_id
WHERE t.type_transaction = 'ci'
  AND t.statut = 'fn'
  AND t.date_livraison IS NOT NULL
  AND t.date_saisie IS NOT NULL
  AND s.dans_perimetre_dqa;

CREATE UNIQUE INDEX ON mv_p2_delai_reception(transaction_id);


-- ── P3 — Écart SDU sur produits traceurs ───────────────────────────────────
-- Principe : on compare la consommation déclarée dans mSupply (somme des
-- dispensations) à la consommation reconstituée par le mouvement de stock
-- entre deux inventaires. Un écart supérieur à 2 % signale une saisie
-- incomplète ou erronée.
DROP MATERIALIZED VIEW IF EXISTS mv_p3_ecart_sdu CASCADE;
CREATE MATERIALIZED VIEW mv_p3_ecart_sdu AS
WITH conso_declaree AS (
    SELECT
        l.site_id,
        l.produit_id,
        SUM(l.quantite_unitaire) AS conso_msupply
    FROM fact_ligne_transaction l
    JOIN fact_transaction t ON t.transaction_id = l.transaction_id
    JOIN dim_produit p      ON p.produit_id = l.produit_id
    WHERE t.type_transaction = 'si'
      AND t.statut = 'fn'
      AND p.est_traceur
    GROUP BY l.site_id, l.produit_id
),
inventaires_bornes AS (
    SELECT
        site_id,
        produit_id,
        (ARRAY_AGG(quantite_comptee ORDER BY date_inventaire ASC ))[1] AS stock_debut,
        (ARRAY_AGG(quantite_comptee ORDER BY date_inventaire DESC))[1] AS stock_fin,
        MIN(date_inventaire) AS premier_inventaire,
        MAX(date_inventaire) AS dernier_inventaire,
        COUNT(*)             AS nb_inventaires
    FROM fact_inventaire
    GROUP BY site_id, produit_id
    HAVING COUNT(*) >= 2                            -- il faut deux bornes pour calculer
)
SELECT
    c.site_id,
    s.site_nom,
    s.district,
    c.produit_id,
    p.produit_nom,
    c.conso_msupply,
    (i.stock_debut - i.stock_fin)                              AS conso_reconstituee,
    i.premier_inventaire,
    i.dernier_inventaire,
    CASE
        WHEN (i.stock_debut - i.stock_fin) = 0 THEN NULL
        ELSE ROUND(
            ABS(c.conso_msupply - (i.stock_debut - i.stock_fin))
            / NULLIF(ABS(i.stock_debut - i.stock_fin), 0) * 100
        , 2)
    END                                                        AS ecart_pct,
    CASE
        WHEN (i.stock_debut - i.stock_fin) = 0 THEN 'NON_CALCULABLE'
        WHEN ABS(c.conso_msupply - (i.stock_debut - i.stock_fin))
             / NULLIF(ABS(i.stock_debut - i.stock_fin), 0) * 100 <= 2  THEN 'CONFORME'
        WHEN ABS(c.conso_msupply - (i.stock_debut - i.stock_fin))
             / NULLIF(ABS(i.stock_debut - i.stock_fin), 0) * 100 <= 5  THEN 'PARTIEL'
        ELSE 'ALERTE'
    END                                                        AS statut
FROM conso_declaree c
JOIN inventaires_bornes i ON i.site_id = c.site_id AND i.produit_id = c.produit_id
JOIN dim_site s           ON s.site_id = c.site_id
JOIN dim_produit p        ON p.produit_id = c.produit_id
WHERE s.dans_perimetre_dqa;

CREATE UNIQUE INDEX ON mv_p3_ecart_sdu(site_id, produit_id);


-- ── P4 — Ratio des ajustements ─────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_p4_ajustements CASCADE;
CREATE MATERIALIZED VIEW mv_p4_ajustements AS
SELECT
    t.site_id,
    s.site_nom,
    s.district,
    TO_CHAR(t.date_confirmation, 'YYYY-MM')                    AS mois,
    COUNT(*) FILTER (WHERE t.type_transaction IN ('im+','im-')) AS nb_ajustements,
    COUNT(*)                                                    AS nb_mouvements_total,
    COUNT(*) FILTER (
        WHERE t.type_transaction IN ('im+','im-')
          AND (t.commentaire IS NULL OR TRIM(t.commentaire) = '')
    )                                                           AS nb_non_justifies,
    ROUND(
        COUNT(*) FILTER (WHERE t.type_transaction IN ('im+','im-'))::numeric
        / NULLIF(COUNT(*), 0) * 100
    , 1)                                                        AS ratio_ajustements_pct,
    CASE
        WHEN COUNT(*) FILTER (WHERE t.type_transaction IN ('im+','im-'))::numeric
             / NULLIF(COUNT(*), 0) * 100 <= 5  THEN 'CONFORME'
        WHEN COUNT(*) FILTER (WHERE t.type_transaction IN ('im+','im-'))::numeric
             / NULLIF(COUNT(*), 0) * 100 <= 10 THEN 'PARTIEL'
        ELSE 'ALERTE'
    END                                                         AS statut
FROM fact_transaction t
JOIN dim_site s ON s.site_id = t.site_id
WHERE t.statut = 'fn'
  AND t.date_confirmation IS NOT NULL
  AND s.dans_perimetre_dqa
GROUP BY t.site_id, s.site_nom, s.district, TO_CHAR(t.date_confirmation, 'YYYY-MM');

CREATE UNIQUE INDEX ON mv_p4_ajustements(site_id, mois);


-- ── P5 — Concordance stock physique / théorique ────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_p5_concordance CASCADE;
CREATE MATERIALIZED VIEW mv_p5_concordance AS
WITH dernier_comptage AS (
    SELECT DISTINCT ON (site_id, produit_id)
        site_id, produit_id, date_inventaire,
        quantite_comptee, quantite_theorique
    FROM fact_inventaire
    ORDER BY site_id, produit_id, date_inventaire DESC
),
stock_theorique AS (
    SELECT DISTINCT ON (site_id, produit_id)
        site_id, produit_id, date_photo,
        SUM(quantite_disponible) OVER (PARTITION BY site_id, produit_id, date_photo) AS soh
    FROM fact_stock_snapshot
    ORDER BY site_id, produit_id, date_photo DESC
)
SELECT
    d.site_id,
    s.site_nom,
    s.district,
    d.produit_id,
    p.produit_nom,
    d.date_inventaire,
    d.quantite_comptee                                         AS stock_physique,
    COALESCE(d.quantite_theorique, st.soh)                     AS stock_theorique,
    ROUND(
        d.quantite_comptee / NULLIF(COALESCE(d.quantite_theorique, st.soh), 0) * 100
    , 1)                                                       AS taux_concordance_pct,
    CASE
        WHEN d.quantite_comptee / NULLIF(COALESCE(d.quantite_theorique, st.soh), 0) * 100 >= 90 THEN 'CONFORME'
        WHEN d.quantite_comptee / NULLIF(COALESCE(d.quantite_theorique, st.soh), 0) * 100 >= 75 THEN 'PARTIEL'
        ELSE 'ALERTE'
    END                                                        AS statut
FROM dernier_comptage d
LEFT JOIN stock_theorique st ON st.site_id = d.site_id AND st.produit_id = d.produit_id
JOIN dim_site s              ON s.site_id = d.site_id
JOIN dim_produit p           ON p.produit_id = d.produit_id
WHERE s.dans_perimetre_dqa
  AND p.est_traceur;

CREATE UNIQUE INDEX ON mv_p5_concordance(site_id, produit_id);


-- ── Score composite pondéré ────────────────────────────────────────────────
-- Pondérations PAQD : Complétude 25 %, Promptitude 15 %, Précision SDU 25 %,
-- Concordance 25 %, Ratio ajustements 10 %.
DROP MATERIALIZED VIEW IF EXISTS mv_score_composite CASCADE;
CREATE MATERIALIZED VIEW mv_score_composite AS
WITH c_completude AS (
    SELECT site_id, ROUND(AVG(taux_completude_pct), 1) AS score
    FROM mv_p2_completude GROUP BY site_id
),
c_regularite AS (
    SELECT site_id, taux_regularite_pct AS score
    FROM mv_p2_regularite
),
c_precision AS (
    SELECT site_id,
           ROUND(AVG(CASE
               WHEN statut = 'CONFORME'       THEN 100.0
               WHEN statut = 'PARTIEL'        THEN  50.0
               WHEN statut = 'NON_CALCULABLE' THEN  NULL
               ELSE 0.0 END), 1) AS score
    FROM mv_p3_ecart_sdu GROUP BY site_id
),
c_ajustements AS (
    SELECT site_id,
           ROUND(AVG(CASE
               WHEN statut = 'CONFORME' THEN 100.0
               WHEN statut = 'PARTIEL'  THEN  50.0
               ELSE 0.0 END), 1) AS score
    FROM mv_p4_ajustements GROUP BY site_id
),
c_concordance AS (
    SELECT site_id,
           ROUND(AVG(CASE
               WHEN statut = 'CONFORME' THEN 100.0
               WHEN statut = 'PARTIEL'  THEN  50.0
               ELSE 0.0 END), 1) AS score
    FROM mv_p5_concordance GROUP BY site_id
),
assemble AS (
    SELECT
        s.site_id,
        s.site_nom,
        s.district,
        s.region,
        COALESCE(cp.score, 0) AS p_completude,
        COALESCE(cr.score, 0) AS p_regularite,
        COALESCE(pr.score, 0) AS p_precision,
        COALESCE(cc.score, 0) AS p_concordance,
        COALESCE(aj.score, 0) AS p_ajustements,
        ROUND(
              COALESCE(cp.score, 0) * 0.25
            + COALESCE(cr.score, 0) * 0.15
            + COALESCE(pr.score, 0) * 0.25
            + COALESCE(cc.score, 0) * 0.25
            + COALESCE(aj.score, 0) * 0.10
        , 1) AS score_composite
    FROM dim_site s
    LEFT JOIN c_completude   cp ON cp.site_id = s.site_id
    LEFT JOIN c_regularite   cr ON cr.site_id = s.site_id
    LEFT JOIN c_precision    pr ON pr.site_id = s.site_id
    LEFT JOIN c_concordance  cc ON cc.site_id = s.site_id
    LEFT JOIN c_ajustements  aj ON aj.site_id = s.site_id
    WHERE s.actif AND s.dans_perimetre_dqa
)
SELECT
    a.*,
    CASE
        WHEN a.score_composite >= 90 THEN 'CONFORME'
        WHEN a.score_composite >= 75 THEN 'PARTIELLEMENT CONFORME'
        ELSE 'NON CONFORME'
    END        AS classification,
    NOW()      AS calcule_le
FROM assemble a;

CREATE UNIQUE INDEX ON mv_score_composite(site_id);


-- ── Historisation des scores ───────────────────────────────────────────────
-- Le tableau de bord doit montrer la progression M+1 → M+4. On fige donc
-- le score composite à chaque import validé.
CREATE TABLE IF NOT EXISTS hist_score_site (
    id              BIGSERIAL PRIMARY KEY,
    site_id         TEXT        NOT NULL REFERENCES dim_site(site_id),
    date_mesure     DATE        NOT NULL,
    lot_id          BIGINT      REFERENCES import_lot(id),
    p_completude    NUMERIC(5,1),
    p_regularite    NUMERIC(5,1),
    p_precision     NUMERIC(5,1),
    p_concordance   NUMERIC(5,1),
    p_ajustements   NUMERIC(5,1),
    score_composite NUMERIC(5,1) NOT NULL,
    classification  TEXT         NOT NULL,
    UNIQUE (site_id, date_mesure)
);

CREATE INDEX IF NOT EXISTS idx_hist_site_date
    ON hist_score_site(site_id, date_mesure DESC);

COMMENT ON TABLE hist_score_site IS
    'Photographie du score de chaque site à chaque import. C''est la source des courbes de progression du tableau de bord.';


-- ── Vue de synthèse nationale ──────────────────────────────────────────────
DROP VIEW IF EXISTS v_synthese_nationale CASCADE;
CREATE VIEW v_synthese_nationale AS
SELECT
    COUNT(*)                                                        AS nb_sites,
    ROUND(AVG(score_composite), 1)                                  AS score_moyen,
    COUNT(*) FILTER (WHERE classification = 'CONFORME')             AS nb_conformes,
    COUNT(*) FILTER (WHERE classification = 'PARTIELLEMENT CONFORME') AS nb_partiels,
    COUNT(*) FILTER (WHERE classification = 'NON CONFORME')         AS nb_non_conformes,
    ROUND(
        COUNT(*) FILTER (WHERE classification = 'CONFORME')::numeric
        / NULLIF(COUNT(*), 0) * 100
    , 1)                                                            AS taux_conformite_pct
FROM mv_score_composite;


-- ── Rafraîchissement ───────────────────────────────────────────────────────
-- À exécuter après chaque import validé, dans cet ordre (le score composite
-- dépend de toutes les autres vues).
CREATE OR REPLACE PROCEDURE rafraichir_indicateurs()
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_p2_regularite;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_p2_completude;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_p2_delai_reception;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_p3_ecart_sdu;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_p4_ajustements;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_p5_concordance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_score_composite;

    -- Fige le score du jour dans l'historique
    INSERT INTO hist_score_site (
        site_id, date_mesure, p_completude, p_regularite,
        p_precision, p_concordance, p_ajustements,
        score_composite, classification
    )
    SELECT
        site_id, CURRENT_DATE, p_completude, p_regularite,
        p_precision, p_concordance, p_ajustements,
        score_composite, classification
    FROM mv_score_composite
    ON CONFLICT (site_id, date_mesure) DO UPDATE SET
        p_completude    = EXCLUDED.p_completude,
        p_regularite    = EXCLUDED.p_regularite,
        p_precision     = EXCLUDED.p_precision,
        p_concordance   = EXCLUDED.p_concordance,
        p_ajustements   = EXCLUDED.p_ajustements,
        score_composite = EXCLUDED.score_composite,
        classification  = EXCLUDED.classification;
END;
$$;