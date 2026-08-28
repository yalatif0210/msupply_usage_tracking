-- ═══════════════════════════════════════════════════════════════════════════
--  Tables de configuration pour l'extraction DQA
--  À installer sur la base mSupply de la DAP. Lecture seule sur les tables
--  mSupply ; ces trois tables dqa_* sont les seules créées.
-- ═══════════════════════════════════════════════════════════════════════════


-- Paramètres de l'extraction de la semaine — une seule ligne.
-- Mise à jour avant chaque export (voir 00_README.md, étape 1).
CREATE TABLE IF NOT EXISTS dqa_parametre_extraction (
    singleton       boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    date_extraction date NOT NULL,
    cycle_paqd      text NOT NULL,          -- 'AAAA-CN'
    mois_paqd       text NOT NULL,          -- 'M+1' .. 'M+4'
    mois_debut      date NOT NULL,
    mois_fin        date NOT NULL,
    fenetre_debut   date NOT NULL,          -- date_extraction - 45 jours
    fenetre_fin     date NOT NULL,
    realisee_par    text NOT NULL,
    version_msupply text NOT NULL
);


-- Périmètre DQA : les codes des 40 sites de la mission.
-- Fournie par la mission, revue à chaque cycle.
CREATE TABLE IF NOT EXISTS dqa_perimetre (
    site_code text PRIMARY KEY
);


-- Produits traceurs : les codes item.code retenus par la mission.
-- Fournie par la mission, revue à chaque cycle.
CREATE TABLE IF NOT EXISTS dqa_traceur (
    item_code text PRIMARY KEY
);
