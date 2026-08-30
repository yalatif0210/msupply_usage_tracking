-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 0 — Contrôle des imports
--  Traçabilité de chaque classeur reçu de la DAP. Pas d'empreinte SHA-256
--  (abandonnée) : l'idempotence est garantie par la promotion en upsert cadrée
--  sur le mois PAQD.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE import_lot (
    id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nom_fichier           text        NOT NULL,
    cycle_paqd            text        NOT NULL,          -- 'AAAA-CN'
    mois_paqd             text        NOT NULL,          -- 'AAAA-MM'
    mois_debut            date        NOT NULL,
    mois_fin              date        NOT NULL,
    fenetre_debut         date,
    fenetre_fin           date,
    date_extraction       date,
    realisee_par          text,
    version_msupply       text,
    recu_le               timestamptz NOT NULL DEFAULT now(),
    importe_le            timestamptz,
    statut                text        NOT NULL DEFAULT 'recu'
                          CHECK (statut IN ('recu', 'en_cours', 'valide', 'rejete')),
    motif_rejet           text,
    nb_lignes_declarees   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    nb_lignes_reelles     jsonb       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE import_lot IS
    'Un enregistrement par classeur Excel reçu de la DAP.';
COMMENT ON COLUMN import_lot.mois_paqd IS
    'Mois calendaire mesuré, format AAAA-MM. Le gel de l''historique porte sur ce mois.';

CREATE INDEX idx_import_lot_mois ON import_lot (mois_paqd);

CREATE TABLE import_anomalie (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lot_id        bigint      NOT NULL REFERENCES import_lot (id) ON DELETE CASCADE,
    onglet        text,
    ligne_source  integer,
    gravite       text        NOT NULL DEFAULT 'avertissement'
                  CHECK (gravite IN ('info', 'avertissement', 'erreur')),
    code          text        NOT NULL,
    message       text        NOT NULL,
    valeur_brute  text,
    detecte_le    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_anomalie_lot ON import_anomalie (lot_id, gravite);

COMMENT ON TABLE import_anomalie IS
    'Journal des problèmes rencontrés à l''import — pour un retour précis à la DAP.';
