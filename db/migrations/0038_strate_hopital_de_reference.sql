-- ═══════════════════════════════════════════════════════════════════════════
--  Le référentiel mSupply réel n'a que trois `type_structure`
--
--  La feuille SITES du canevas d'extraction ne porte que trois valeurs de
--  `name_category3.description` : `District sanitaire`, `Hôpital de référence`,
--  `ESPC`. mSupply ne distingue pas CHU / CHR / HG ici.
--
--  1. `strate_structure` gagne `Hôpital de référence` (sinon tous les hôpitaux
--     tombaient dans « Non classé »). Les correspondances CHU/CHR/HG/CSU/CSR
--     de la migration 0031 restent — inertes si non utilisées, utiles si un
--     référentiel plus fin arrive.
--
--  2. `jour_limite_requisition` : un « Hôpital de référence » a la même échéance
--     qu'un HG / CHR (le 7 du mois suivant). Sans ça, le CASE retombait sur
--     « autres » (le 10). `dim_site.jour_limite_requisition` reste prioritaire.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

INSERT INTO dqa.strate_structure (type_structure, strate) VALUES
    ('Hôpital de référence', 'Hôpital de référence')
ON CONFLICT (type_structure) DO NOTHING;

CREATE OR REPLACE FUNCTION jour_limite_requisition(
    p_type_structure text,
    p_jour_limite_override integer
) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(
        p_jour_limite_override,
        CASE
            WHEN p_type_structure IN ('CSU', 'CSR', 'ESPC')          THEN 5
            WHEN p_type_structure IN ('HG', 'CHR', 'Hôpital de référence') THEN 7
            ELSE 10
        END
    );
$$;

COMMENT ON FUNCTION jour_limite_requisition(text, integer) IS
    'Jour du mois M+1 (inclus) où la réquisition couvrant M doit être soumise : dim_site.jour_limite_requisition, sinon 5 (CSU/CSR/ESPC), 7 (HG/CHR/Hôpital de référence), 10 (autres).';
