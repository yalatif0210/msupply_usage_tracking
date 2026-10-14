-- ═══════════════════════════════════════════════════════════════════════════
--  Calendrier (`dim_temps`) complété à chaque import, sans date butoir.
--
--  0008 posait un calendrier figé 2025-2027 alors que le programme court
--  jusqu'en 2030 : passé le 31/12/2027, aucun indicateur ne se serait plus
--  calculé (les vues joignent `dim_temps` sur le jour et le mois PAQD). Le
--  calendrier ne porte aucune donnée de terrain, seulement des attributs
--  dérivés de la date : il peut donc être produit à la demande.
--
--  `completer_calendrier(debut, fin)` ajoute les jours manquants de
--  l'intervalle, mêmes formules que 0008 (cycle C1 janvier-avril, C2 mai-août,
--  C3 septembre-décembre). La promotion l'appelle pour chaque lot.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE OR REPLACE FUNCTION dqa.completer_calendrier(p_debut date, p_fin date)
RETURNS integer
LANGUAGE sql
AS $$
  WITH ajout AS (
    INSERT INTO dqa.dim_temps (jour, annee, mois, iso_semaine, jour_semaine, mois_paqd, cycle_paqd)
    SELECT
        d::date,
        extract(year  FROM d)::int,
        extract(month FROM d)::int,
        extract(week  FROM d)::int,
        extract(isodow FROM d)::int,
        to_char(d, 'YYYY-MM'),
        extract(year FROM d)::text || '-C'
            || CASE
                 WHEN extract(month FROM d) BETWEEN 1 AND 4 THEN '1'
                 WHEN extract(month FROM d) BETWEEN 5 AND 8 THEN '2'
                 ELSE '3'
               END
    FROM generate_series(p_debut, p_fin, INTERVAL '1 day') AS d
    ON CONFLICT (jour) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int FROM ajout;
$$;
