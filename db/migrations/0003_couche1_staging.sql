-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 1 — Staging
--  Miroir brut d'un onglet du classeur. Toutes les colonnes en TEXT ; aucune
--  contrainte : on capture tout, on valide ensuite. `ligne_source` = numéro de
--  ligne dans l'onglet Excel, pour le rapport d'anomalies.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE stg_sites (
    lot_id                  bigint REFERENCES import_lot (id) ON DELETE CASCADE,
    ligne_source            integer,
    site_id                 text,
    site_code               text,
    site_nom                text,
    district                text,
    region                  text,
    type_structure          text,
    actif                   text,
    dans_perimetre_dqa      text,
    jour_limite_requisition text
);

CREATE TABLE stg_site_programme (
    lot_id          bigint REFERENCES import_lot (id) ON DELETE CASCADE,
    ligne_source    integer,
    site_id         text,
    programme_id     text,
    programme_code   text,
    programme_nom    text,
    actif            text
);

CREATE TABLE stg_produits (
    lot_id        bigint REFERENCES import_lot (id) ON DELETE CASCADE,
    ligne_source  integer,
    produit_id    text,
    produit_code  text,
    produit_nom   text,
    unite         text,
    programmes    text
);

CREATE TABLE stg_transactions (
    lot_id            bigint REFERENCES import_lot (id) ON DELETE CASCADE,
    ligne_source      integer,
    transaction_id    text,
    site_id           text,
    nature            text,
    programme_id       text,
    type_transaction  text,
    mode              text,
    statut            text,
    annulation        text,
    date_saisie       text,
    date_confirmation text,
    date_livraison    text,
    requisition_id    text,
    goods_received_id text,
    commentaire       text
);

CREATE TABLE stg_lignes_transactions (
    lot_id                 bigint REFERENCES import_lot (id) ON DELETE CASCADE,
    ligne_source           integer,
    ligne_id               text,
    transaction_id         text,
    produit_id             text,
    programme_id            text,
    lot                    text,
    quantite               text,
    taille_conditionnement text,
    type_ligne             text,
    issu_ajustement        text,
    date_peremption        text
);

CREATE TABLE stg_stock_actuel (
    lot_id              bigint REFERENCES import_lot (id) ON DELETE CASCADE,
    ligne_source        integer,
    site_id             text,
    produit_id          text,
    lot                 text,
    quantite_disponible text,
    date_peremption     text,
    date_photo          text
);

CREATE TABLE stg_inventaires (
    lot_id              bigint REFERENCES import_lot (id) ON DELETE CASCADE,
    ligne_source        integer,
    inventaire_id       text,
    site_id             text,
    programme_id         text,
    date_inventaire     text,
    statut              text,
    invad_additions_id  text,
    invad_reductions_id text
);

CREATE TABLE stg_inventaire_lignes (
    lot_id             bigint REFERENCES import_lot (id) ON DELETE CASCADE,
    ligne_source       integer,
    inventaire_id      text,
    produit_id         text,
    lot                text,
    quantite_theorique text,
    quantite_comptee   text
);

CREATE TABLE stg_requisitions (
    lot_id              bigint REFERENCES import_lot (id) ON DELETE CASCADE,
    ligne_source        integer,
    requisition_id      text,
    site_id             text,
    programme_id         text,
    periode_id          text,
    mois_couvert_debut  text,
    mois_couvert_fin    text,
    date_soumission     text,
    date_inventaire_ref text,
    date_reception      text,
    statut              text,
    statut_autorisation text,
    type_requisition    text
);
