-- ═══════════════════════════════════════════════════════════════════════════
--  Seed du calendrier (dim_temps + jour_ferie)
--  Couvre 2025-2027. Jours fériés fixes de Côte d'Ivoire uniquement ; les
--  fêtes mobiles (Pâques, Ascension, Aïd, Maouloud) sont à compléter dans
--  `jour_ferie` cycle par cycle.
--
--  Un cycle PAQD = 4 mois : C1 janvier–avril, C2 mai–août, C3 septembre–décembre.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

INSERT INTO jour_ferie (jour, libelle)
SELECT make_date(a, m, d), lib
FROM generate_series(2025, 2027) AS a,
     (VALUES
        (1, 1,  'Jour de l''An'),
        (5, 1,  'Fête du Travail'),
        (8, 7,  'Fête Nationale'),
        (8, 15, 'Assomption'),
        (11, 1, 'Toussaint'),
        (11, 15, 'Journée nationale de la Paix'),
        (12, 25, 'Noël')
     ) AS f (m, d, lib)
ON CONFLICT (jour) DO NOTHING;

INSERT INTO dim_temps (jour, annee, mois, iso_semaine, jour_semaine, est_ouvrable, mois_paqd, cycle_paqd)
SELECT
    d::date                                        AS jour,
    extract(year  FROM d)::int                     AS annee,
    extract(month FROM d)::int                     AS mois,
    extract(week  FROM d)::int                     AS iso_semaine,
    extract(isodow FROM d)::int                    AS jour_semaine,
    extract(isodow FROM d) < 6
        AND NOT EXISTS (SELECT 1 FROM jour_ferie jf WHERE jf.jour = d::date) AS est_ouvrable,
    to_char(d, 'YYYY-MM')                          AS mois_paqd,
    extract(year FROM d)::text || '-C'
        || CASE
             WHEN extract(month FROM d) BETWEEN 1 AND 4 THEN '1'
             WHEN extract(month FROM d) BETWEEN 5 AND 8 THEN '2'
             ELSE '3'
           END                                     AS cycle_paqd
FROM generate_series(DATE '2025-01-01', DATE '2027-12-31', INTERVAL '1 day') AS d
ON CONFLICT (jour) DO NOTHING;
