-- Un lot rejeté n'a pas forcément de mois PAQD exploitable (METADATA illisible).
-- Ces champs ne sont garantis que pour un lot « validé ».

SET search_path TO dqa, public;

ALTER TABLE import_lot ALTER COLUMN cycle_paqd DROP NOT NULL;
ALTER TABLE import_lot ALTER COLUMN mois_paqd  DROP NOT NULL;
ALTER TABLE import_lot ALTER COLUMN mois_debut DROP NOT NULL;
ALTER TABLE import_lot ALTER COLUMN mois_fin   DROP NOT NULL;
