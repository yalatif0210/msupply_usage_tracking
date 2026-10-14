-- ═══════════════════════════════════════════════════════════════════════════
--  MODÈLE des listes de la mission DQA (annexe A de la spécification).
--  Copier ce fichier en `listes_mission.sql`, dans le même dossier que
--  extraction_msupply.sql, puis remplacer les valeurs fictives par les listes
--  transmises par la mission. `listes_mission.sql` n'est jamais versionné : il
--  contient des identifiants réels.
--
--  tmp_perimetre_dqa : `site_id` (= store.id mSupply) des sites suivis.
--  tmp_traceurs      : `produit_code` (= item.code) des produits traceurs.
--                      Cette liste FAIT FOI (ADR 0015).
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS tmp_perimetre_dqa;
CREATE TEMP TABLE tmp_perimetre_dqa (site_id text PRIMARY KEY);
INSERT INTO tmp_perimetre_dqa (site_id) VALUES
    ('00000000000000000000000000000001'),   -- code et nom du site, pour mémoire
    ('00000000000000000000000000000002');

DROP TABLE IF EXISTS tmp_traceurs;
CREATE TEMP TABLE tmp_traceurs (produit_code text PRIMARY KEY);
INSERT INTO tmp_traceurs (produit_code) VALUES
    ('CODE-TRACEUR-1'),
    ('CODE-TRACEUR-2');
