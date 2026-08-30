-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 2 — Fait : réquisitions
--  Miroir typé de stg_requisitions. Grain mSupply (requisition_id), upsert sur
--  cet identifiant : ré-importer le même classeur laisse la table inchangée.
--  Une réquisition compte pour son mois couvert — celui de son inventaire de
--  référence de fin de mois — jamais pour le mois où elle est soumise :
--  `mois_couvert` est dérivé de `mois_couvert_debut` à la promotion.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE fact_requisition (
    requisition_id      text PRIMARY KEY,
    site_id             text        NOT NULL REFERENCES dim_site (site_id),
    programme_id        text REFERENCES dim_programme (programme_id),
    periode_id          text,
    mois_couvert        text        NOT NULL,   -- 'AAAA-MM', dérivé de mois_couvert_debut
    date_soumission     date,
    date_inventaire_ref date,
    date_reception      date,
    statut              text,
    statut_autorisation text,
    type_requisition    text,
    lot_id_source       bigint REFERENCES import_lot (id),
    maj_le              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fact_requisition_mois_couvert_format CHECK (mois_couvert ~ '^\d{4}-\d{2}$')
);

CREATE INDEX idx_requisition_site_mois ON fact_requisition (site_id, mois_couvert);
