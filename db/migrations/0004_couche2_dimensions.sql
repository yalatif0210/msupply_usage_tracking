-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 2 — Dimensions
--  Données typées et dédoublonnées. Les identifiants mSupply sont les clés
--  primaires : un enregistrement présent dans deux fenêtres successives
--  s'écrase proprement en upsert.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE dim_site (
    site_id                 text PRIMARY KEY,
    site_code               text,
    site_nom                text        NOT NULL DEFAULT '',
    district                text,
    region                  text,
    type_structure          text,
    actif                   boolean     NOT NULL DEFAULT true,
    dans_perimetre_dqa      boolean     NOT NULL DEFAULT false,
    jour_limite_requisition integer,
    lot_id_source           bigint REFERENCES import_lot (id),
    maj_le                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_perimetre ON dim_site (dans_perimetre_dqa) WHERE dans_perimetre_dqa;
CREATE INDEX idx_site_district  ON dim_site (district);

COMMENT ON COLUMN dim_site.dans_perimetre_dqa IS
    'Déclaré par la DAP dans l''extraction. Seuls ces sites entrent dans les scores nationaux.';

CREATE TABLE dim_produit (
    produit_id    text PRIMARY KEY,
    produit_code  text,
    produit_nom   text        NOT NULL DEFAULT '',
    unite         text,
    programmes    text[]      NOT NULL DEFAULT '{}',
    lot_id_source bigint REFERENCES import_lot (id),
    maj_le        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_produit_code ON dim_produit (produit_code);

CREATE TABLE dim_programme (
    programme_id   text PRIMARY KEY,
    programme_code text,
    programme_nom  text        NOT NULL DEFAULT '',
    lot_id_source  bigint REFERENCES import_lot (id),
    maj_le         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dim_site_programme (
    site_id       text        NOT NULL REFERENCES dim_site (site_id) ON DELETE CASCADE,
    programme_id  text        NOT NULL REFERENCES dim_programme (programme_id) ON DELETE CASCADE,
    actif         boolean     NOT NULL DEFAULT true,
    lot_id_source bigint REFERENCES import_lot (id),
    maj_le        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (site_id, programme_id)
);

COMMENT ON TABLE dim_site_programme IS
    'Programmes gérés par chaque site. Pilote le pilier P1 (nombre d''inventaires et de réquisitions attendus).';

-- Calendrier : indispensable à la régularité de saisie (P3), qui compte les
-- jours ouvrables SANS sortie de stock autant que ceux avec.
CREATE TABLE jour_ferie (
    jour    date PRIMARY KEY,
    libelle text NOT NULL
);

CREATE TABLE dim_temps (
    jour         date PRIMARY KEY,
    annee        integer NOT NULL,
    mois         integer NOT NULL,
    iso_semaine  integer NOT NULL,
    jour_semaine integer NOT NULL,            -- 1 = lundi … 7 = dimanche
    est_ouvrable boolean NOT NULL,
    mois_paqd    text    NOT NULL,            -- 'AAAA-MM'
    cycle_paqd   text    NOT NULL             -- 'AAAA-CN'
);

CREATE INDEX idx_temps_mois_paqd ON dim_temps (mois_paqd);
