-- ═══════════════════════════════════════════════════════════════════════════
--  EXTRACTION DU SCHÉMA DE LA BASE mSupply
--
--  Objectif : transmettre à l'équipe tableau de bord la liste complète des
--  tables et colonnes, au format déjà utilisé :
--
--      table_name, column_name, data_type,
--      constraint_type, foreign_table, foreign_column
--
--  Six cas sont proposés ci-dessous. La DAP choisit celui qui correspond à
--  son outillage et à ce qui est demandé. Tous sont en LECTURE SEULE.
--
--  Recommandation : CAS 2 (export CSV via \copy). Les envois par
--  copier-coller ont déjà été tronqués deux fois à la table « store… ».
-- ═══════════════════════════════════════════════════════════════════════════



-- ═══════════════════════════════════════════════════════════════════════════
--  CAS 1 — Schéma complet, résultat à copier depuis l'écran
--  ───────────────────────────────────────────────────────
--  Quand : petite copie ponctuelle, ou l'interface ne permet pas d'écrire
--  un fichier. Attention : ~1 000+ lignes, risque de troncature à la copie.
-- ═══════════════════════════════════════════════════════════════════════════

WITH keycol AS (
    SELECT kcu.table_schema,
           kcu.table_name,
           kcu.column_name,
           bool_or(tc.constraint_type = 'PRIMARY KEY') AS is_pk,
           bool_or(tc.constraint_type = 'UNIQUE')      AS is_unique
    FROM information_schema.key_column_usage kcu
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name   = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
    GROUP BY kcu.table_schema, kcu.table_name, kcu.column_name
)
SELECT
    c.table_name,
    c.column_name,
    c.data_type,
    CASE WHEN k.is_pk     THEN 'PRIMARY KEY'
         WHEN k.is_unique THEN 'UNIQUE'
    END AS constraint_type,
    CASE WHEN k.is_pk OR k.is_unique THEN c.table_name  END AS foreign_table,
    CASE WHEN k.is_pk OR k.is_unique THEN c.column_name END AS foreign_column
FROM information_schema.columns c
LEFT JOIN keycol k
       ON k.table_schema = c.table_schema
      AND k.table_name   = c.table_name
      AND k.column_name  = c.column_name
WHERE c.table_schema = 'public'
  AND c.table_name IN (
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  )
ORDER BY c.table_name, c.ordinal_position;



-- ═══════════════════════════════════════════════════════════════════════════
--  CAS 2 — Schéma complet, export CSV avec \copy  (RECOMMANDÉ)
--  ────────────────────────────────────────────────────────
--  Quand : accès à psql. Écrit un fichier propre, aucune troncature.
--  Exécuter la commande ci-dessous depuis psql (elle tient sur plusieurs
--  lignes, psql lit jusqu'à la parenthèse fermante).
-- ═══════════════════════════════════════════════════════════════════════════

\copy (WITH keycol AS (SELECT kcu.table_schema, kcu.table_name, kcu.column_name, bool_or(tc.constraint_type = 'PRIMARY KEY') AS is_pk, bool_or(tc.constraint_type = 'UNIQUE') AS is_unique FROM information_schema.key_column_usage kcu JOIN information_schema.table_constraints tc ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema WHERE tc.constraint_type IN ('PRIMARY KEY','UNIQUE') GROUP BY kcu.table_schema, kcu.table_name, kcu.column_name) SELECT c.table_name, c.column_name, c.data_type, CASE WHEN k.is_pk THEN 'PRIMARY KEY' WHEN k.is_unique THEN 'UNIQUE' END AS constraint_type, CASE WHEN k.is_pk OR k.is_unique THEN c.table_name END AS foreign_table, CASE WHEN k.is_pk OR k.is_unique THEN c.column_name END AS foreign_column FROM information_schema.columns c LEFT JOIN keycol k ON k.table_schema = c.table_schema AND k.table_name = c.table_name AND k.column_name = c.column_name WHERE c.table_schema = 'public' AND c.table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') ORDER BY c.table_name, c.ordinal_position) TO 'schema_msupply.csv' WITH (FORMAT csv, HEADER true)



-- ═══════════════════════════════════════════════════════════════════════════
--  CAS 3 — Schéma complet, export CSV en ligne de commande
--  ──────────────────────────────────────────────────────
--  Quand : pas de session psql interactive, mais l'exécutable psql est
--  disponible. Enregistrer la requête du CAS 1 dans un fichier requete.sql
--  puis lancer :
--
--    psql -h HÔTE -U UTILISATEUR -d BASE -X -A -F',' \
--         --pset footer=off -f requete.sql -o schema_msupply.csv
--
--  ( -A sans alignement, -F',' séparateur virgule, footer off )
-- ═══════════════════════════════════════════════════════════════════════════



-- ═══════════════════════════════════════════════════════════════════════════
--  CAS 4 — Complément ciblé : uniquement les tables utiles au DQA
--  ────────────────────────────────────────────────────────────
--  Quand : le schéma complet a déjà été transmis, seul le complément
--  manquant (transact / trans_line, etc.) est nécessaire. Résultat court,
--  copiable sans risque.
-- ═══════════════════════════════════════════════════════════════════════════

WITH keycol AS (
    SELECT kcu.table_schema,
           kcu.table_name,
           kcu.column_name,
           bool_or(tc.constraint_type = 'PRIMARY KEY') AS is_pk,
           bool_or(tc.constraint_type = 'UNIQUE')      AS is_unique
    FROM information_schema.key_column_usage kcu
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name   = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
    GROUP BY kcu.table_schema, kcu.table_name, kcu.column_name
)
SELECT
    c.table_name,
    c.column_name,
    c.data_type,
    CASE WHEN k.is_pk     THEN 'PRIMARY KEY'
         WHEN k.is_unique THEN 'UNIQUE'
    END AS constraint_type,
    CASE WHEN k.is_pk OR k.is_unique THEN c.table_name  END AS foreign_table,
    CASE WHEN k.is_pk OR k.is_unique THEN c.column_name END AS foreign_column
FROM information_schema.columns c
LEFT JOIN keycol k
       ON k.table_schema = c.table_schema
      AND k.table_name   = c.table_name
      AND k.column_name  = c.column_name
WHERE c.table_schema = 'public'
  AND c.table_name IN (
      'transact', 'trans_line',
      'requisition', 'requisition_line',
      'stock_take', 'stock_take_lines',
      'item', 'item_line', 'item_store_join',
      'item_category', 'item_category_level1', 'item_category_level2',
      'list_master', 'list_master_line', 'list_master_name_join',
      'name', 'name_category1', 'name_category2', 'name_category3',
      'name_category1_level1', 'name_category1_level2',
      'name_store_join', 'store',
      'period', 'periodschedule',
      'goods_received', 'goods_received_line',
      'purchase_order', 'purchase_order_line'
  )
ORDER BY c.table_name, c.ordinal_position;



-- ═══════════════════════════════════════════════════════════════════════════
--  CAS 5 — Clés étrangères réellement déclarées
--  ───────────────────────────────────────────
--  Quand : compléter le schéma avec les liens FK explicites (mSupply en
--  déclare peu, mais ceux qui existent lèvent des ambiguïtés de jointure).
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
    tc.table_name        AS table_name,
    kcu.column_name      AS column_name,
    'FOREIGN KEY'        AS constraint_type,
    ccu.table_name       AS foreign_table,
    ccu.column_name      AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name   = tc.constraint_name
 AND kcu.constraint_schema = tc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name   = tc.constraint_name
 AND ccu.constraint_schema = tc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;



-- ═══════════════════════════════════════════════════════════════════════════
--  CAS 6 — Schéma DDL complet via pg_dump  (le plus fidèle, hors SQL)
--  ────────────────────────────────────────────────────────────────
--  Quand : l'outil pg_dump est disponible. Produit le DDL exact (types,
--  contraintes, index, valeurs par défaut) — plus riche que les cas 1 à 5.
--
--    pg_dump -h HÔTE -U UTILISATEUR -d BASE \
--            --schema-only --no-owner --no-privileges \
--            -f schema_msupply.sql
--
--  Pour se limiter aux tables DQA, ajouter des options -t :
--    -t transact -t trans_line -t requisition -t stock_take  (etc.)
-- ═══════════════════════════════════════════════════════════════════════════
