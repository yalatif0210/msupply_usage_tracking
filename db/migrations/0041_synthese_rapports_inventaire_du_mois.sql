-- ═══════════════════════════════════════════════════════════════════════════
--  Synthèse « Rapports & inventaires » : la colonne « Réalisés » des
--  inventaires compte tout inventaire finalisé du mois, quelle que soit sa
--  date.
--
--  L'ADR 0012 a restreint la sous-composante P1 « complétude des inventaires »
--  aux inventaires datés dans les trois derniers jours du mois (identique à la
--  promptitude P2). `mv_synthese_rapports` lisait `p1_inventaires.nb_realise`
--  pour sa colonne « Réalisés » : elle est devenue identique à « À l'heure »
--  et affiche 0 dès qu'un site a inventorié tôt dans le mois, ce qui se lit
--  comme « aucun inventaire » alors qu'il y en a eu.
--
--  Correctif : « Réalisés » (inventaires) est recalculé à partir de
--  `fact_inventaire` (un inventaire `fn` du mois, toute date confondue).
--  « À l'heure » reste la promptitude P2 (3 derniers jours). Les colonnes
--  « réquisitions » sont inchangées. C'est une vue opérationnelle rafraîchie
--  au gel, pas un score gelé : lire le fait brut « inventaire fait » en direct
--  est cohérent.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_synthese_rapports CASCADE;

CREATE MATERIALIZED VIEW mv_synthese_rapports AS
WITH brut AS (
    SELECT
        b.mois_paqd,
        dqa.strate_de(s.type_structure) AS strate,
        s.region,
        b.programme_id,
        b.mesure,
        b.nb_attendu,
        -- « Réalisés » des inventaires : un inventaire finalisé du mois, quelle
        -- que soit sa date (le fait brut, pas la fenêtre des 3 derniers jours).
        CASE WHEN b.mesure = 'p1_inventaires'
             THEN (EXISTS (
                     SELECT 1 FROM dqa.fact_inventaire fi
                     WHERE fi.site_id = b.site_id
                       AND fi.programme_id = b.programme_id
                       AND fi.statut = 'fn'
                       AND to_char(fi.date_inventaire, 'YYYY-MM') = b.mois_paqd
                   ))::int
             ELSE b.nb_realise
        END AS nb_realise,
        b.nb_a_lheure
    FROM dqa.hist_pilier_brut b
    JOIN dqa.dim_site s ON s.site_id = b.site_id AND s.dans_perimetre_dqa
    WHERE b.programme_id IS NOT NULL
      AND b.mesure IN ('p1_requisitions', 'p1_inventaires', 'p2_requisitions', 'p2_inventaires')
)
SELECT
    mois_paqd,
    strate,
    CASE WHEN grouping(region)       = 1 THEN NULL ELSE region       END AS region,
    CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
    coalesce(sum(nb_attendu)  FILTER (WHERE mesure = 'p1_requisitions'), 0)::int AS req_attendu,
    coalesce(sum(nb_realise)  FILTER (WHERE mesure = 'p1_requisitions'), 0)::int AS req_realise,
    coalesce(sum(nb_a_lheure) FILTER (WHERE mesure = 'p2_requisitions'), 0)::int AS req_a_lheure,
    coalesce(sum(nb_attendu)  FILTER (WHERE mesure = 'p1_inventaires'), 0)::int  AS inv_attendu,
    coalesce(sum(nb_realise)  FILTER (WHERE mesure = 'p1_inventaires'), 0)::int  AS inv_realise,
    coalesce(sum(nb_a_lheure) FILTER (WHERE mesure = 'p2_inventaires'), 0)::int  AS inv_a_lheure
FROM brut
GROUP BY GROUPING SETS (
    (mois_paqd, strate),
    (mois_paqd, strate, region),
    (mois_paqd, strate, programme_id),
    (mois_paqd, strate, region, programme_id)
)
HAVING (grouping(region)       = 1 OR region       IS NOT NULL)
   AND (grouping(programme_id) = 1 OR programme_id IS NOT NULL);

CREATE UNIQUE INDEX mv_synthese_rapports_uq
    ON mv_synthese_rapports
       (mois_paqd, strate, coalesce(region, ''), coalesce(programme_id, ''));

-- Rattrapage : le gel reconstruit les vues de synthèse.
CALL dqa.rafraichir_et_geler(NULL);
