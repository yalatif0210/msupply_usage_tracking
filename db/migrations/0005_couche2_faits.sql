-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 2 — Faits
--  Grain mSupply. Upsert sur les identifiants naturels. Chaque ligne porte le
--  lot qui l'a produite (traçabilité).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE fact_transaction (
    transaction_id    text PRIMARY KEY,
    site_id           text        NOT NULL REFERENCES dim_site (site_id),
    nature            text        NOT NULL,     -- dérivée à la promotion (canevas §4.5)
    programme_id      text REFERENCES dim_programme (programme_id),
    type_transaction  text,
    mode              text,
    statut            text,
    annulation        boolean     NOT NULL DEFAULT false,
    date_saisie       date,
    date_confirmation date,
    date_livraison    date,
    requisition_id    text,
    goods_received_id text,
    commentaire       text,
    lot_id_source     bigint REFERENCES import_lot (id),
    maj_le            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tx_site_nature_date ON fact_transaction (site_id, nature, date_confirmation);
CREATE INDEX idx_tx_site_programme   ON fact_transaction (site_id, programme_id);

CREATE TABLE fact_ligne_transaction (
    ligne_id               text PRIMARY KEY,
    transaction_id         text        NOT NULL REFERENCES fact_transaction (transaction_id) ON DELETE CASCADE,
    produit_id             text        NOT NULL REFERENCES dim_produit (produit_id),
    programme_id           text REFERENCES dim_programme (programme_id),
    lot                    text        NOT NULL DEFAULT '',
    quantite               numeric(18, 3) NOT NULL DEFAULT 0,
    taille_conditionnement numeric(12, 3) NOT NULL DEFAULT 1,
    quantite_unitaire      numeric(18, 3) GENERATED ALWAYS AS (quantite * taille_conditionnement) STORED,
    type_ligne             text,
    issu_ajustement        boolean     NOT NULL DEFAULT false,
    date_peremption        date,
    lot_id_source          bigint REFERENCES import_lot (id),
    maj_le                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ligne_produit    ON fact_ligne_transaction (produit_id);
CREATE INDEX idx_ligne_ajustement ON fact_ligne_transaction (transaction_id) WHERE issu_ajustement;

CREATE TABLE fact_inventaire (
    inventaire_id       text PRIMARY KEY,
    site_id             text        NOT NULL REFERENCES dim_site (site_id),
    programme_id        text REFERENCES dim_programme (programme_id),
    date_inventaire     date        NOT NULL,
    statut              text,
    invad_additions_id  text,
    invad_reductions_id text,
    lot_id_source       bigint REFERENCES import_lot (id),
    maj_le              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_site_date ON fact_inventaire (site_id, date_inventaire DESC);

CREATE TABLE fact_inventaire_ligne (
    inventaire_id      text        NOT NULL REFERENCES fact_inventaire (inventaire_id) ON DELETE CASCADE,
    produit_id         text        NOT NULL REFERENCES dim_produit (produit_id),
    lot                text        NOT NULL DEFAULT '',
    quantite_theorique numeric(18, 3),
    quantite_comptee   numeric(18, 3),
    ecart_absolu       numeric(18, 3) GENERATED ALWAYS AS
                       (coalesce(quantite_comptee, 0) - coalesce(quantite_theorique, 0)) STORED,
    lot_id_source      bigint REFERENCES import_lot (id),
    maj_le             timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (inventaire_id, produit_id, lot)
);

CREATE TABLE fact_stock_snapshot (
    date_photo          date        NOT NULL,
    site_id             text        NOT NULL REFERENCES dim_site (site_id),
    produit_id          text        NOT NULL REFERENCES dim_produit (produit_id),
    lot                 text        NOT NULL DEFAULT '',
    quantite_disponible numeric(18, 3) NOT NULL DEFAULT 0,
    date_peremption     date,
    lot_id_source       bigint REFERENCES import_lot (id),
    maj_le              timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (date_photo, site_id, produit_id, lot)
);

CREATE INDEX idx_stock_site_produit ON fact_stock_snapshot (site_id, produit_id, date_photo DESC);
