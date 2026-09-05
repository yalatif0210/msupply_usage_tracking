-- ═══════════════════════════════════════════════════════════════════════════
--  P3 mesuré différemment pour un district (ADR 0011)
--
--  Un district ne dispense pas : sa régularité, c'est répondre aux
--  réquisitions de sa zone. Pour un district D et un mois PAQD M :
--
--      count(DISTINCT réquisitions de la zone couvrant M-1, servies par une
--            distribution de D liée (requisition_id) et datée dans M)
--      ────────────────────────────────────────────────────────────────────
--      count(DISTINCT réquisitions de la zone couvrant M-1)
--
--  Zone = sites du périmètre dont dim_site.district = celui du district
--  (proxy géographique). Seuil ≥ 80 % (colonne grille `seuil_district`,
--  renseignée sur la seule ligne `regularite_saisie`).
--
--  Modèle inchangé : une sous-composante `regularite_saisie`, dix `sc_*`.
--  `mv_p3_regularite` porte une branche UNION ALL + une colonne `est_district`.
--  `mv_score_pilier` et `v_sous_composante_atteinte` choisissent le seuil selon
--  cette colonne ; `mv_synthese_sous_composante` en hérite (lit la vue).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

-- ── Grille : seuil spécifique aux districts ─────────────────────────────────
ALTER TABLE dqa.grille_seuil_sous_composante
    ADD COLUMN IF NOT EXISTS seuil_district numeric(8, 2);

UPDATE dqa.grille_seuil_sous_composante
   SET seuil_district = 80
 WHERE sous_composante = 'regularite_saisie' AND seuil_district IS NULL;

-- ── mv_p3_regularite : dispensation (non-districts) + distribution (districts) ─
DROP MATERIALIZED VIEW IF EXISTS mv_p3_regularite CASCADE;
CREATE MATERIALIZED VIEW mv_p3_regularite AS
WITH districts AS (
    SELECT s.site_id, s.district
    FROM dqa.dim_site s
    WHERE s.dans_perimetre_dqa AND dqa.strate_de(s.type_structure) = 'District'
),
jours_du_mois AS (
    SELECT mois_paqd, count(*) AS nb_jours
    FROM dqa.dim_temps
    GROUP BY mois_paqd
),
-- Branche « dispensation » : jours du mois avec ≥ 1 sortie de stock. Exclut
-- les districts (mesurés par la branche « distribution » ci-dessous).
sorties AS (
    SELECT ft.site_id, ft.programme_id, t.mois_paqd, t.jour
    FROM dqa.fact_transaction ft
    JOIN dqa.dim_site s ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
    JOIN dqa.dim_temps t ON t.jour = coalesce(ft.date_confirmation, ft.date_saisie)
    WHERE ft.nature IN ('dispensation', 'distribution')
      AND coalesce(ft.annulation, false) = false
      AND NOT EXISTS (SELECT 1 FROM districts d WHERE d.site_id = ft.site_id)
),
agg_dispensation AS (
    SELECT site_id,
        CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
        mois_paqd,
        count(DISTINCT jour) AS nb_jours_avec_sortie
    FROM sorties
    GROUP BY GROUPING SETS ((site_id, programme_id, mois_paqd), (site_id, mois_paqd))
    HAVING grouping(programme_id) = 1 OR programme_id IS NOT NULL
),
p3_dispensation AS (
    SELECT
        a.site_id, a.programme_id, a.mois_paqd,
        a.nb_jours_avec_sortie                        AS nb_realise,
        j.nb_jours                                    AS nb_attendu,
        round(a.nb_jours_avec_sortie::numeric / nullif(j.nb_jours, 0) * 100, 1) AS taux_regularite_pct,
        false                                         AS est_district
    FROM agg_dispensation a
    JOIN jours_du_mois j ON j.mois_paqd = a.mois_paqd
),
-- Branche « distribution » : réponse aux réquisitions de la zone du district.
-- Mois PAQD M = mois_couvert des réquisitions + 1 ; réponse = distribution du
-- district liée par requisition_id, datée entre le 1er et le dernier jour de M.
zone_req AS (
    SELECT
        d.site_id                                    AS district_id,
        fr.programme_id,
        to_char((fr.mois_couvert || '-01')::date + interval '1 month', 'YYYY-MM') AS mois_paqd,
        fr.requisition_id,
        EXISTS (
            SELECT 1 FROM dqa.fact_transaction ft
            WHERE ft.site_id = d.site_id
              AND ft.nature = 'distribution'
              AND ft.requisition_id = fr.requisition_id
              AND coalesce(ft.annulation, false) = false
              AND coalesce(ft.date_confirmation, ft.date_saisie) BETWEEN
                  ((fr.mois_couvert || '-01')::date + interval '1 month')::date
              AND ((fr.mois_couvert || '-01')::date + interval '2 months' - interval '1 day')::date
        )                                            AS repondue
    FROM districts d
    JOIN dqa.dim_site sreq
      ON sreq.district = d.district AND sreq.dans_perimetre_dqa
     AND sreq.site_id <> d.site_id
     AND NOT EXISTS (SELECT 1 FROM districts d2 WHERE d2.site_id = sreq.site_id)
    JOIN dqa.fact_requisition fr ON fr.site_id = sreq.site_id
),
p3_distribution AS (
    SELECT
        district_id                                  AS site_id,
        CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
        mois_paqd,
        count(DISTINCT requisition_id) FILTER (WHERE repondue) AS nb_realise,
        count(DISTINCT requisition_id)               AS nb_attendu,
        round(
            count(DISTINCT requisition_id) FILTER (WHERE repondue)::numeric
            / nullif(count(DISTINCT requisition_id), 0) * 100, 1
        )                                            AS taux_regularite_pct,
        true                                         AS est_district
    FROM zone_req
    GROUP BY GROUPING SETS ((district_id, programme_id, mois_paqd), (district_id, mois_paqd))
    HAVING grouping(programme_id) = 1 OR programme_id IS NOT NULL
)
SELECT site_id, programme_id, mois_paqd,
       nb_realise AS nb_jours_avec_sortie, nb_attendu AS nb_jours,
       taux_regularite_pct, est_district
FROM p3_dispensation
UNION ALL
SELECT site_id, programme_id, mois_paqd,
       nb_realise AS nb_jours_avec_sortie, nb_attendu AS nb_jours,
       taux_regularite_pct, est_district
FROM p3_distribution;

CREATE UNIQUE INDEX mv_p3_uq
    ON mv_p3_regularite (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── mv_score_pilier — reconstruite (seuil P3 selon est_district) ────────────
DROP MATERIALIZED VIEW IF EXISTS mv_score_pilier CASCADE;
CREATE MATERIALIZED VIEW mv_score_pilier AS
WITH sites_mois AS (
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p1_completude
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p2_promptitude
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p3_regularite
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p4_ecart
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p5_concordance
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p6_ajustements
),
seuils AS (
    SELECT sc.sous_composante, sc.seuil, sc.seuil_district, sc.sens, m.mois_paqd
    FROM (SELECT DISTINCT mois_paqd FROM sites_mois) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
),
base AS (
    SELECT
        sm.site_id, sm.mois_paqd, sm.programme_id,
        dqa.grille_pour_mois(sm.mois_paqd)                            AS grille_id,
        p1.p_completude, p2.p_promptitude,
        CASE WHEN p3.taux_regularite_pct IS NULL THEN NULL
             WHEN p3.taux_regularite_pct >=
                  (CASE WHEN p3.est_district AND sc3.seuil_district IS NOT NULL
                        THEN sc3.seuil_district ELSE sc3.seuil END) THEN 100.0 ELSE 0.0 END AS p_regularite,
        p4.p_ecart_sdu,
        CASE WHEN p5.taux_concordance_pct IS NULL THEN NULL
             WHEN p5.taux_concordance_pct >= sc5.seuil THEN 100.0 ELSE 0.0 END AS p_concordance,
        CASE WHEN p6.ratio_ajustements_pct IS NULL THEN NULL
             WHEN p6.ratio_ajustements_pct <= sc6.seuil THEN 100.0 ELSE 0.0 END AS p_ajustements,
        p1.completude_inventaires_pct   AS sc_completude_inventaires,
        p1.completude_requisitions_pct  AS sc_completude_requisitions,
        p1.completude_receptions_pct    AS sc_completude_receptions,
        p2.promptitude_inventaires_pct  AS sc_promptitude_inventaires,
        p2.promptitude_requisitions_pct AS sc_promptitude_requisitions,
        p3.taux_regularite_pct          AS sc_regularite_saisie,
        p4.taux_sdu_pct                 AS sc_ecart_sdu,
        p4.taux_conso_pct               AS sc_ecart_consommation,
        p5.taux_concordance_pct         AS sc_concordance,
        p6.ratio_ajustements_pct        AS sc_ratio_ajustements
    FROM sites_mois sm
    LEFT JOIN mv_p1_completude p1 ON p1.site_id = sm.site_id AND p1.mois_paqd = sm.mois_paqd AND coalesce(p1.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p2_promptitude p2 ON p2.site_id = sm.site_id AND p2.mois_paqd = sm.mois_paqd AND coalesce(p2.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p3_regularite p3 ON p3.site_id = sm.site_id AND p3.mois_paqd = sm.mois_paqd AND coalesce(p3.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p4_ecart p4 ON p4.site_id = sm.site_id AND p4.mois_paqd = sm.mois_paqd AND coalesce(p4.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p5_concordance p5 ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd AND coalesce(p5.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p6_ajustements p6 ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd AND coalesce(p6.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN seuils sc3 ON sc3.sous_composante = 'regularite_saisie' AND sc3.mois_paqd = sm.mois_paqd
    LEFT JOIN seuils sc5 ON sc5.sous_composante = 'concordance'       AND sc5.mois_paqd = sm.mois_paqd
    LEFT JOIN seuils sc6 ON sc6.sous_composante = 'ratio_ajustements' AND sc6.mois_paqd = sm.mois_paqd
),
composite AS (
    SELECT b.site_id, b.mois_paqd, b.programme_id,
        round(sum(pil.score * gp.poids_pct) / nullif(sum(gp.poids_pct), 0), 1)::numeric(5, 1) AS score_composite
    FROM base b
    CROSS JOIN LATERAL (VALUES
        ('P1', b.p_completude), ('P2', b.p_promptitude), ('P3', b.p_regularite),
        ('P4', b.p_ecart_sdu),  ('P5', b.p_concordance), ('P6', b.p_ajustements)
    ) AS pil(pilier, score)
    JOIN dqa.grille_poids_pilier gp ON gp.grille_id = b.grille_id AND gp.pilier = pil.pilier
    WHERE pil.score IS NOT NULL
    GROUP BY b.site_id, b.mois_paqd, b.programme_id
)
SELECT
    b.site_id, b.mois_paqd, b.programme_id, b.grille_id,
    b.p_completude, b.p_promptitude, b.p_regularite, b.p_ecart_sdu, b.p_concordance, b.p_ajustements,
    b.sc_completude_inventaires, b.sc_completude_requisitions, b.sc_completude_receptions,
    b.sc_promptitude_inventaires, b.sc_promptitude_requisitions, b.sc_regularite_saisie,
    b.sc_ecart_sdu, b.sc_ecart_consommation, b.sc_concordance, b.sc_ratio_ajustements,
    c.score_composite,
    dqa.classer_composite(c.score_composite) AS classification
FROM base b
LEFT JOIN composite c ON c.site_id = b.site_id AND c.mois_paqd = b.mois_paqd
      AND coalesce(c.programme_id, '') = coalesce(b.programme_id, '');

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── v_sous_composante_atteinte — seuil regularite_saisie selon le type de site ─
CREATE OR REPLACE VIEW v_sous_composante_atteinte AS
WITH lignes AS (
    SELECT
        h.site_id, h.mois_paqd, h.programme_id,
        sc.sous_composante, sc.valeur, gs.sens,
        (CASE
            WHEN sc.sous_composante = 'regularite_saisie'
             AND gs.seuil_district IS NOT NULL
             AND dqa.strate_de(ds.type_structure) = 'District'
            THEN gs.seuil_district
            ELSE gs.seuil
        END)::numeric(8, 2)                                             AS seuil
    FROM dqa.hist_score_site h
    JOIN dqa.dim_site ds ON ds.site_id = h.site_id
    CROSS JOIN LATERAL (VALUES
        ('completude_inventaires',   h.sc_completude_inventaires),
        ('completude_requisitions',  h.sc_completude_requisitions),
        ('completude_receptions',    h.sc_completude_receptions),
        ('promptitude_inventaires',  h.sc_promptitude_inventaires),
        ('promptitude_requisitions', h.sc_promptitude_requisitions),
        ('regularite_saisie',        h.sc_regularite_saisie),
        ('ecart_sdu',                h.sc_ecart_sdu),
        ('ecart_consommation',       h.sc_ecart_consommation),
        ('concordance',              h.sc_concordance),
        ('ratio_ajustements',        h.sc_ratio_ajustements)
    ) AS sc(sous_composante, valeur)
    LEFT JOIN dqa.grille_seuil_sous_composante gs
           ON gs.grille_id = h.grille_id AND gs.sous_composante = sc.sous_composante
)
SELECT
    site_id, mois_paqd, programme_id, sous_composante, valeur, seuil, sens,
    CASE
        WHEN valeur IS NULL THEN NULL
        WHEN sous_composante IN ('ecart_sdu', 'ecart_consommation') THEN least(valeur, 100)
        WHEN sens = 'inf' THEN least(seuil / nullif(valeur, 0), 1) * 100
        ELSE least(valeur / nullif(seuil, 0), 1) * 100
    END                                                                 AS taux_atteinte,
    CASE
        WHEN valeur IS NULL OR seuil IS NULL THEN 'NON_CALCULABLE'
        WHEN sens = 'inf' THEN CASE WHEN valeur <= seuil THEN 'CONFORME' ELSE 'ALERTE' END
        ELSE CASE WHEN valeur >= seuil THEN 'CONFORME' ELSE 'ALERTE' END
    END                                                                 AS statut
FROM lignes;

-- ── Rattrapage des mois déjà gelés (P3 district recalculé) ──────────────────
--  UPDATE seul, comme 0025 / 0033 : on recalcule les lignes `hist_score_site`
--  existantes, sans en insérer. Un district qui n'avait aucune ligne gelée
--  (aucune transaction) mais a maintenant un P3 (réquisitions de zone) sera
--  pris au prochain import (la procédure fait un INSERT, ADR 0010).
REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;

UPDATE dqa.hist_score_site h SET
    p_regularite         = sp.p_regularite,
    sc_regularite_saisie = sp.sc_regularite_saisie,
    score_composite      = sp.score_composite,
    classification       = sp.classification,
    calcule_le           = now()
FROM dqa.mv_score_pilier sp
WHERE sp.site_id = h.site_id AND sp.mois_paqd = h.mois_paqd
  AND coalesce(sp.programme_id, '') = coalesce(h.programme_id, '');

UPDATE dqa.hist_pilier_brut b SET
    nb_attendu = p3.nb_jours,
    nb_realise = p3.nb_jours_avec_sortie,
    calcule_le = now()
FROM dqa.mv_p3_regularite p3
WHERE b.mesure = 'p3_regularite'
  AND p3.site_id = b.site_id AND p3.mois_paqd = b.mois_paqd
  AND coalesce(p3.programme_id, '') = coalesce(b.programme_id, '');

REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
