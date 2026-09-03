-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 2 — Strate de structure (regroupement d'affichage administré)
--
--  Les lectures nationales « rapports & inventaires » agrègent les sites par
--  STRATE, pas par `type_structure` brut du référentiel DAP
--  (`name_category3.description`). La correspondance `type_structure → strate`
--  est éditée dans la console (comme les traceurs ou la grille) : une valeur
--  nouvelle du référentiel se rattache sans migration.
--
--  Ce n'est PAS un chiffre gelé : la strate est un regroupement d'affichage,
--  un changement prend effet à la consultation suivante, rien n'est historisé.
--
--  Un `type_structure` sans correspondance tombe dans « Non classé » — jamais
--  ignoré, pour que rien ne disparaisse silencieusement des totaux nationaux.
--  `strate_de(p_type)` porte cette règle ; le NULL (site sans type) y tombe
--  aussi. Marquée STABLE : le résultat ne varie pas dans un même énoncé.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE strate_structure (
    type_structure text PRIMARY KEY,
    strate         text        NOT NULL CHECK (strate <> ''),
    maj_le         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE strate_structure IS
    'Correspondance type_structure (name_category3.description) → strate d''affichage des lectures nationales. Éditée via la console. Non historisée : un changement prend effet immédiatement. type_structure non référencé → « Non classé » (voir strate_de).';

INSERT INTO strate_structure (type_structure, strate) VALUES
    ('CSU',                'CS'),
    ('CSR',                'CS'),
    ('ESPC',               'ESPC'),
    ('HG',                 'HG'),
    ('CHR',                'CHR'),
    ('CHU',                'CHU'),
    ('District sanitaire', 'District')
ON CONFLICT (type_structure) DO NOTHING;

CREATE OR REPLACE FUNCTION strate_de(p_type text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT coalesce(
        (SELECT strate FROM dqa.strate_structure WHERE type_structure = p_type),
        'Non classé'
    );
$$;

COMMENT ON FUNCTION strate_de(text) IS
    'Strate d''affichage d''un type_structure : la correspondance administrée, sinon « Non classé ». NULL → « Non classé ».';
