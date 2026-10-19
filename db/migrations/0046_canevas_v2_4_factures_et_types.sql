-- ═══════════════════════════════════════════════════════════════════════════
--  Canevas d'extraction v2.4 : factures fournisseur, encaissements, type de
--  structure arbitré (ADR 0018, 0019, 0021).
--
--  TRANSACTIONS gagne trois colonnes :
--    - date_finalisation : date de réception d'une facture `si` (statut fn) ;
--    - transaction_liee_id, date_finalisation_liee : la livraison du district
--      qui a produit la facture et sa date de finalisation, qui fixe le mois
--      où la facture doit être acceptée.
--  SITES gagne type_structure_msupply : le type déduit de la seule catégorie
--  mSupply, conservé pour signaler les catégories à corriger à la source.
--
--  Les colonnes sont facultatives à l'import : un classeur antérieur au
--  canevas v2.4 reste accepté, elles restent alors vides.
--
--  `rc` est un reçu de paiement, pas une réception de marchandises : les
--  transactions déjà en base passent en nature `encaissement`.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

ALTER TABLE stg_transactions
    ADD COLUMN date_finalisation      text,
    ADD COLUMN transaction_liee_id    text,
    ADD COLUMN date_finalisation_liee text;

ALTER TABLE stg_sites
    ADD COLUMN type_structure_msupply text;

ALTER TABLE fact_transaction
    ADD COLUMN date_finalisation      date,
    ADD COLUMN transaction_liee_id    text,
    ADD COLUMN date_finalisation_liee date;

ALTER TABLE dim_site
    ADD COLUMN type_structure_msupply text;

COMMENT ON COLUMN fact_transaction.date_finalisation IS
    'Date de finalisation mSupply. Pour une facture si : date de réception (ADR 0018).';
COMMENT ON COLUMN fact_transaction.date_finalisation_liee IS
    'Facture si : finalisation de la livraison liée, mois où la facture doit être acceptée (ADR 0019).';
COMMENT ON COLUMN dim_site.type_structure_msupply IS
    'Type déduit de la seule catégorie mSupply. Différent de type_structure : catégorie à corriger dans mSupply (ADR 0021).';

UPDATE fact_transaction SET nature = 'encaissement'
WHERE lower(type_transaction) = 'rc' AND nature <> 'encaissement';
