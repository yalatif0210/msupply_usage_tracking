-- ═══════════════════════════════════════════════════════════════════════════
--  Clôture de mois, sanctions, composition des scores et historique figé
--  (ADR 0022, revue de code du 2026-11-05).
--
--  Règles (ADR 0022, décisions de l'utilisateur) :
--    - inventaire de clôture du mois n : inventaire finalisé de la fenêtre de
--      clôture (grille) qui porte au moins un produit traceur ; une clôture
--      sans traceur ne vaut pas clôture ;
--    - ouverture de n : la clôture retenue de n-1 ;
--    - mois jugé : chaque jour de la fenêtre de clôture, prolongée de la marge
--      de jugement de la grille (3 jours), est couvert par la fenêtre d'un
--      import validé ; sans aucun import fenêtré, la date du jour en tient
--      lieu ;
--    - sanction, une fois le mois jugé : sans clôture, 0 sur P4 et P5 ; avec
--      clôture mais sans ouverture (mois précédent jugé), ou sans aucun
--      produit commun aux deux, 0 sur la conformité consommation. La note
--      d'une sous-composante sanctionnée est la note de sanction de la grille ;
--    - même règle pour chaque programme géré par le site (dim_site_programme
--      actif), sur ses propres inventaires, sans condition de traceur ;
--    - P4 : conformité consommation seule (composition de la grille) ;
--      dénominateur = produits présents aux deux inventaires ; reconstituée
--      ≤ 0 non conforme.
--
--  Structure :
--    - mv_inventaire_mois : chaque inventaire du périmètre, son mois de
--      clôture (une fois par inventaire) et s'il porte un traceur ;
--    - mv_cloture_mois : par site, programme (NULL = tous) et mois mesurable,
--      clôture, ouverture, jugement, fenêtre, inventaire hors fenêtre et les
--      causes ; seule source des sanctions de P4 et P5 et des raisons
--      affichées par la fiche site ;
--    - mv_p4_ecart_produit, mv_p4_ecart, mv_p5_concordance : notes et
--      sanctions calculées une fois, en base ;
--    - mv_score_pilier : scores de pilier et dénominateurs agrégés sur la
--      grille (aucune fonction appelée par ligne), classification lue dans
--      ses bornes ; un site sans aucune activité du mois (ni mesure P1, P2,
--      P3, P6, ni inventaire avec traceur) reste sans mesure ;
--    - hist_score_site fige aussi les notes, les sanctions et les
--      dénominateurs : la fiche site déplie un calcul qui redonne exactement
--      le score gelé ; une ligne qui n'est plus calculée est retirée ;
--    - hist_pilier_brut : un compte devenu non calculable est retiré, quelle
--      que soit la sous-composante ;
--    - v_sous_composante_atteinte, mv_synthese_sous_composante : statut tiré
--      de la note figée, sous-composantes retenues seulement ;
--    - mv_produit_ecarte : toutes les entrées et sorties enregistrées ;
--      historique au nom de colonnes `entrees` / `sorties`.
--
--  Remplace les définitions de 0056 à 0060 pour ces objets ; le gel est
--  relancé en fin de migration pour que l'historique suive.
--
--  Le gel garde des REFRESH ordinaires : les index uniques portent sur
--  coalesce(programme_id, ''), ce qu'un REFRESH CONCURRENTLY n'accepte pas,
--  et le gel ne tourne qu'à l'import (quelques secondes, une fois par
--  semaine).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

-- ══ 1. Grille : marge de jugement, note de sanction sous 100 ═════════════
ALTER TABLE grille_parametre
    ADD COLUMN jours_marge_jugement integer NOT NULL DEFAULT 3
        CHECK (jours_marge_jugement BETWEEN 0 AND 15),
    ADD CONSTRAINT grille_note_sanction_sous_100_ck CHECK (note_sanction < 100);

COMMENT ON COLUMN grille_parametre.jours_marge_jugement IS
    'Jours ajoutés à la fin de la fenêtre de clôture avant de juger un mois : un inventaire du dernier jour synchronisé après l''extraction ne doit pas faire sanctionner le site.';

CREATE FUNCTION dqa.jours_marge_jugement(p_mois text)
RETURNS integer LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT jours_marge_jugement FROM dqa.grille_parametre
                      WHERE id = dqa.grille_pour_mois(p_mois)), 3)
$$;

-- ══ 2. Mois jugé ══════════════════════════════════════════════════════════
-- Les imports validés seulement : un lot en cours ou rejeté ne prouve pas que
-- ses données sont en base (mois_mesurable, qui borne l'affichage, lit
-- aussi les lots en cours).
CREATE OR REPLACE FUNCTION dqa.mois_juge_p4_p5(p_mois text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    WITH f AS (
        SELECT debut, fin + dqa.jours_marge_jugement(p_mois) AS fin_jugee
        FROM dqa.fenetre_cloture(p_mois)
    )
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM dqa.import_lot
                          WHERE statut = 'valide' AND fenetre_debut IS NOT NULL AND fenetre_fin IS NOT NULL)
            THEN CURRENT_DATE > f.fin_jugee
        ELSE NOT EXISTS (
            SELECT 1 FROM generate_series(f.debut, f.fin_jugee, interval '1 day') AS j(jour)
            WHERE NOT EXISTS (SELECT 1 FROM dqa.import_lot l
                               WHERE l.statut = 'valide'
                                 AND j.jour::date BETWEEN l.fenetre_debut AND l.fenetre_fin))
    END
    FROM f
$$;

COMMENT ON FUNCTION dqa.mois_juge_p4_p5(text) IS
    'Vrai quand chaque jour de la fenêtre de clôture du mois, prolongée de la marge de jugement, est couvert par la fenêtre d''un import validé (sans aucun import fenêtré : la date du jour a dépassé cette fin). Avant, P4 et P5 ne sont jamais sanctionnés (ADR 0022).';

DROP FUNCTION dqa.date_debut_donnees();

-- ══ 3. Objets recréés ═════════════════════════════════════════════════════
DROP MATERIALIZED VIEW mv_p4_ecart_produit CASCADE;   -- mv_p4_ecart, mv_p5_concordance, mv_score_pilier
DROP VIEW dqa.v_cloture_inventaire;
DROP VIEW v_sous_composante_atteinte CASCADE;          -- mv_synthese_sous_composante
-- Classification : mv_score_pilier lit les bornes de la grille par jointure.
-- Les deux fonctions (bornes 90 / 75 en dur, migration 0015 ; bornes de la
-- grille, migration 0058) n'ont plus d'appelant.
DROP FUNCTION dqa.classer_composite(numeric);
DROP FUNCTION dqa.classer_composite(numeric, bigint);

-- ══ 4. Inventaires et mois de clôture ═════════════════════════════════════
CREATE MATERIALIZED VIEW mv_inventaire_mois AS
SELECT fi.inventaire_id, fi.site_id, fi.programme_id, fi.date_inventaire,
       fi.heure_inventaire, fi.numero_inventaire,
       dqa.mois_cloture_inventaire(fi.date_inventaire) AS mois_cloture,
       EXISTS (SELECT 1
               FROM dqa.fact_inventaire_ligne fil
               JOIN dqa.dim_produit p ON p.produit_id = fil.produit_id
               JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
               WHERE fil.inventaire_id = fi.inventaire_id)  AS a_traceur
FROM dqa.fact_inventaire fi
JOIN dqa.dim_site s ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
WHERE fi.statut = 'fn';

CREATE UNIQUE INDEX mv_inventaire_mois_uq ON mv_inventaire_mois (inventaire_id);

COMMENT ON MATERIALIZED VIEW mv_inventaire_mois IS
    'Inventaires finalisés du périmètre : mois clôturé (NULL hors fenêtre de clôture) et présence d''un produit traceur. Le mois de clôture lit la grille : il est calculé une fois par inventaire.';

-- Clôtures : un inventaire de la fenêtre qui porte un traceur (ADR 0022).
CREATE VIEW dqa.v_cloture_inventaire AS
SELECT DISTINCT site_id, programme_id, mois_cloture AS mois_paqd
FROM dqa.mv_inventaire_mois
WHERE mois_cloture IS NOT NULL AND a_traceur AND programme_id IS NOT NULL
UNION
SELECT DISTINCT site_id, NULL, mois_cloture
FROM dqa.mv_inventaire_mois
WHERE mois_cloture IS NOT NULL AND a_traceur;

-- ══ 5. P4 par produit ═════════════════════════════════════════════════════
-- Jointures sur des clés égales (`cle` = programme ou '', mois précédent
-- précalculé) : PostgreSQL les hache au lieu de boucler.
CREATE MATERIALIZED VIEW mv_p4_ecart_produit AS
WITH lignes_traceur AS MATERIALIZED (
    SELECT im.site_id, im.programme_id, im.inventaire_id, im.heure_inventaire,
           im.numero_inventaire, im.date_inventaire, im.mois_cloture AS mois_paqd,
           p.produit_id, p.produit_code, tr.libelle,
           sum(fil.quantite_theorique) AS theorique,
           sum(fil.quantite_comptee)   AS comptee
    FROM dqa.mv_inventaire_mois im
    JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = im.inventaire_id
    JOIN dqa.dim_produit p ON p.produit_id = fil.produit_id
    JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
    WHERE im.mois_cloture IS NOT NULL
    GROUP BY im.site_id, im.programme_id, im.inventaire_id, im.heure_inventaire,
             im.numero_inventaire, im.date_inventaire, im.mois_cloture,
             p.produit_id, p.produit_code, tr.libelle
),
-- Un seul inventaire par (site, jour, article) : le dernier finalisé (heure,
-- puis numéro). Par programme, le dernier de ce programme ; tous programmes,
-- le dernier tous programmes confondus. Sans programme : « tous » seulement.
lignes_dim AS MATERIALIZED (
    SELECT site_id, prog, coalesce(prog, '') AS cle, mois_paqd, dqa.mois_precedent(mois_paqd) AS mois_prec,
           date_inventaire, inventaire_id, produit_id, produit_code, libelle, theorique, comptee
    FROM (
        SELECT site_id, programme_id AS prog, mois_paqd, date_inventaire, inventaire_id,
               produit_id, produit_code, libelle, theorique, comptee,
               row_number() OVER (
                   PARTITION BY site_id, programme_id, date_inventaire, produit_id
                   ORDER BY heure_inventaire DESC NULLS LAST,
                            numero_inventaire DESC NULLS LAST, inventaire_id DESC) AS rang
        FROM lignes_traceur
        WHERE programme_id IS NOT NULL
        UNION ALL
        SELECT site_id, NULL, mois_paqd, date_inventaire, inventaire_id,
               produit_id, produit_code, libelle, theorique, comptee,
               row_number() OVER (
                   PARTITION BY site_id, date_inventaire, produit_id
                   ORDER BY heure_inventaire DESC NULLS LAST,
                            numero_inventaire DESC NULLS LAST, inventaire_id DESC)
        FROM lignes_traceur
    ) classes
    WHERE rang = 1
),
regles_mois AS (
    SELECT m.mois_paqd,
           max(sc.tolerance) FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS tol_sdu,
           max(sc.tolerance) FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS tol_conso,
           max(sc.seuil)     FILTER (WHERE sc.sous_composante = 'concordance')        AS seuil_concordance,
           max(sc.sens)      FILTER (WHERE sc.sous_composante = 'concordance')        AS sens_concordance
    FROM (SELECT DISTINCT mois_paqd FROM lignes_dim) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
     AND sc.sous_composante IN ('ecart_sdu', 'ecart_consommation', 'concordance')
    GROUP BY m.mois_paqd
),
-- Clôture retenue d'un article : le dernier inventaire de la fenêtre.
cloture_article AS (
    SELECT DISTINCT ON (site_id, cle, mois_paqd, produit_id)
           site_id, prog, cle, mois_paqd, mois_prec, produit_id, produit_code, libelle,
           date_inventaire, inventaire_id,
           theorique AS theorique_brut, comptee AS comptee_brut,
           coalesce(theorique, 0) AS theorique, coalesce(comptee, 0) AS comptee
    FROM lignes_dim
    ORDER BY site_id, cle, mois_paqd, produit_id, date_inventaire DESC
),
-- Ouverture d'un article : sa clôture retenue du mois précédent.
bornes AS (
    SELECT c.site_id, c.cle, c.mois_paqd, c.produit_id,
           o.date_inventaire AS d_debut, coalesce(o.comptee, 0) AS stock_debut,
           c.date_inventaire AS d_fin,   c.comptee AS stock_fin
    FROM cloture_article c
    JOIN cloture_article o
      ON o.site_id = c.site_id AND o.cle = c.cle AND o.produit_id = c.produit_id
     AND o.mois_paqd = c.mois_prec
    WHERE o.date_inventaire < c.date_inventaire
),
-- Entrées de stock = factures `si` réceptionnées (`fn`), datées de leur
-- finalisation, hors lignes d'ajustement ; sorties = dispensations ou
-- distributions finalisées (ADR 0018). Un mouvement sans programme ne compte
-- que dans « tous programmes ».
mouvements AS MATERIALIZED (
    SELECT ft.site_id, ft.programme_id AS prog, l.produit_id,
           CASE WHEN ft.nature = 'facture_fournisseur'
                THEN dqa.date_reception_facture(ft.date_finalisation, ft.date_confirmation, ft.date_saisie)
                ELSE coalesce(ft.date_confirmation, ft.date_saisie)
           END AS jour,
           ft.nature,
           sum(l.quantite_unitaire) AS q
    FROM dqa.fact_transaction ft
    JOIN dqa.fact_ligne_transaction l ON l.transaction_id = ft.transaction_id
    JOIN dqa.dim_produit p            ON p.produit_id = l.produit_id
    JOIN dqa.dim_produit_traceur tr   ON tr.produit_code = p.produit_code AND tr.actif
    JOIN dqa.dim_site s               ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
    WHERE ft.nature IN ('facture_fournisseur', 'dispensation', 'distribution')
      AND ft.statut = 'fn'
      AND coalesce(ft.annulation, false) = false
      AND NOT (ft.nature = 'facture_fournisseur' AND coalesce(l.issu_ajustement, false))
      AND coalesce(ft.date_finalisation, ft.date_confirmation, ft.date_saisie) IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5
),
mouvements_dim AS (
    SELECT site_id, prog AS cle, produit_id, jour, nature, q FROM mouvements WHERE prog IS NOT NULL
    UNION ALL
    SELECT site_id, '', produit_id, jour, nature, q FROM mouvements
),
sites_district AS (
    SELECT site_id FROM dqa.dim_site
    WHERE dans_perimetre_dqa AND dqa.est_district(type_structure)
),
conso_produit AS (
    SELECT b.site_id, b.cle, b.mois_paqd, b.produit_id, b.d_debut, b.d_fin,
           b.stock_debut, b.stock_fin,
           coalesce(sum(m.q) FILTER (WHERE m.nature = 'facture_fournisseur'), 0) AS receptions,
           coalesce(sum(m.q) FILTER (
               WHERE m.nature = CASE WHEN sd.site_id IS NOT NULL THEN 'distribution' ELSE 'dispensation' END
           ), 0) AS declaree
    FROM bornes b
    LEFT JOIN sites_district sd ON sd.site_id = b.site_id
    LEFT JOIN mouvements_dim m
           ON m.site_id = b.site_id AND m.cle = b.cle AND m.produit_id = b.produit_id
          AND m.jour > b.d_debut AND m.jour <= b.d_fin
    GROUP BY b.site_id, b.cle, b.mois_paqd, b.produit_id, b.d_debut, b.d_fin,
             b.stock_debut, b.stock_fin, sd.site_id
),
-- Raisons d'une absence de bornes : le code présent à l'ouverture sous un
-- autre article ; une ouverture pour le site ; sinon aucune ouverture.
codes_ouverture AS (
    SELECT DISTINCT site_id, cle, mois_paqd, produit_code FROM cloture_article
),
ouvertures AS (
    SELECT site_id, coalesce(programme_id, '') AS cle, mois_paqd FROM dqa.v_cloture_inventaire
),
detail AS (
    SELECT c.site_id, c.prog, c.cle, c.mois_paqd, c.produit_id, c.produit_code, c.libelle,
           (sd.site_id IS NOT NULL) AS est_district,
           c.theorique, c.comptee, c.theorique_brut, c.comptee_brut,
           c.date_inventaire, c.inventaire_id,
           r.tol_sdu, r.tol_conso, r.seuil_concordance, r.sens_concordance,
           cp.d_debut, cp.d_fin, cp.stock_debut, cp.stock_fin, cp.receptions, cp.declaree,
           (cp.produit_id IS NOT NULL) AS conso_borne_ok,
           CASE WHEN cp.produit_id IS NOT NULL THEN cp.stock_debut + cp.receptions - cp.stock_fin END AS reconstituee,
           CASE
               WHEN cp.produit_id IS NOT NULL AND cp.stock_debut + cp.receptions - cp.stock_fin <= 0
                   THEN 'reconstituee_non_positive'
               WHEN cp.produit_id IS NOT NULL THEN NULL
               WHEN co.produit_code IS NOT NULL THEN 'autre_article_ouverture'
               WHEN ov.site_id IS NOT NULL THEN 'absent_ouverture'
               ELSE 'sans_ouverture'
           END AS conso_raison_exclusion
    FROM cloture_article c
    JOIN regles_mois r ON r.mois_paqd = c.mois_paqd
    LEFT JOIN sites_district sd ON sd.site_id = c.site_id
    LEFT JOIN conso_produit cp
           ON cp.site_id = c.site_id AND cp.cle = c.cle AND cp.mois_paqd = c.mois_paqd AND cp.produit_id = c.produit_id
    LEFT JOIN codes_ouverture co
           ON co.site_id = c.site_id AND co.cle = c.cle AND co.mois_paqd = c.mois_prec AND co.produit_code = c.produit_code
    LEFT JOIN ouvertures ov
           ON ov.site_id = c.site_id AND ov.cle = c.cle AND ov.mois_paqd = c.mois_prec
)
SELECT
    site_id,
    prog                                                       AS programme_id,
    mois_paqd,
    produit_id,
    produit_code,
    libelle,
    est_district,
    theorique,
    comptee,
    CASE
        WHEN comptee = 0 AND theorique = 0 THEN 0.0
        WHEN comptee = 0                   THEN NULL
        ELSE round(abs(theorique - comptee) / comptee * 100, 1)
    END::numeric(8, 1)                                         AS ecart_sdu_pct,
    CASE
        WHEN comptee = 0 AND theorique = 0 THEN true
        WHEN comptee = 0                   THEN false
        ELSE abs(theorique - comptee) / comptee * 100 <= tol_sdu
    END                                                        AS sdu_conforme,
    CASE
        WHEN theorique_brut IS NULL OR comptee_brut IS NULL THEN NULL
        WHEN greatest(abs(theorique_brut), abs(comptee_brut)) = 0 THEN 100.0
        ELSE round(least(abs(theorique_brut), abs(comptee_brut))
                   / greatest(abs(theorique_brut), abs(comptee_brut)) * 100, 1)
    END::numeric(8, 1)                                         AS concordance_pct,
    coalesce(dqa.seuil_atteint(
        CASE
            WHEN theorique_brut IS NULL OR comptee_brut IS NULL THEN NULL
            WHEN greatest(abs(theorique_brut), abs(comptee_brut)) = 0 THEN 100.0
            ELSE round(least(abs(theorique_brut), abs(comptee_brut))
                       / greatest(abs(theorique_brut), abs(comptee_brut)) * 100, 1)
        END, seuil_concordance, sens_concordance), false)      AS concordance_conforme,
    stock_debut,
    stock_fin,
    receptions,
    declaree,
    reconstituee,
    -- présent aux deux inventaires : compte au dénominateur de la conformité
    -- consommation (une reconstituée ≤ 0 y compte non conforme)
    conso_borne_ok,
    -- écart chiffrable (reconstituée > 0)
    (conso_borne_ok AND reconstituee > 0)                      AS conso_evaluable,
    conso_raison_exclusion,
    CASE WHEN conso_borne_ok AND reconstituee > 0
         THEN round(abs(declaree - reconstituee) / reconstituee * 100, 1)::numeric(8, 1)
    END                                                        AS ecart_conso_pct,
    -- écart signé déclarée - reconstituée, lu par la fiche produit
    CASE WHEN conso_borne_ok THEN declaree - reconstituee END  AS ecart_conso,
    CASE WHEN conso_borne_ok AND reconstituee > 0
         THEN abs(declaree - reconstituee) / reconstituee * 100 <= tol_conso
         ELSE false
    END                                                        AS conso_conforme,
    date_inventaire,
    inventaire_id,
    (SELECT jsonb_agg(jsonb_build_object(
                'lot', fil.lot,
                'theorique', fil.quantite_theorique,
                'comptee', fil.quantite_comptee) ORDER BY fil.lot)
     FROM dqa.fact_inventaire_ligne fil
     WHERE fil.inventaire_id = detail.inventaire_id
       AND fil.produit_id = detail.produit_id)                 AS lots,
    d_debut                                                    AS date_debut,
    d_fin                                                      AS date_fin
FROM detail;

CREATE UNIQUE INDEX mv_p4_ecart_produit_uq
    ON mv_p4_ecart_produit (site_id, mois_paqd, coalesce(programme_id, ''), produit_id);

-- ══ 6. Clôture, ouverture et causes par site, programme et mois ═══════════
CREATE MATERIALIZED VIEW mv_cloture_mois AS
WITH mois AS MATERIALIZED (
    SELECT m.mois_paqd, f.debut, f.fin,
           dqa.mois_juge_p4_p5(m.mois_paqd)                       AS juge,
           dqa.mois_juge_p4_p5(dqa.mois_precedent(m.mois_paqd))   AS juge_precedent,
           dqa.mois_precedent(m.mois_paqd)                        AS mois_prec,
           (m.mois_paqd || '-01')::date                           AS premier_jour,
           s.debut                                                AS debut_fenetre_suivante
    FROM (SELECT DISTINCT mois_paqd FROM dqa.dim_temps) m
    CROSS JOIN LATERAL dqa.fenetre_cloture(m.mois_paqd) f
    CROSS JOIN LATERAL dqa.fenetre_cloture(
        to_char((m.mois_paqd || '-01')::date + interval '1 month', 'YYYY-MM')) s
    WHERE dqa.mois_mesurable(m.mois_paqd)
),
geres AS (
    SELECT sp.site_id, sp.programme_id
    FROM dqa.dim_site_programme sp
    JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
    WHERE sp.actif
),
-- Date de la clôture retenue : programme, puis tous programmes.
clotures AS (
    SELECT site_id, programme_id AS cle, mois_cloture AS mois_paqd, max(date_inventaire) AS date_cloture
    FROM dqa.mv_inventaire_mois
    WHERE mois_cloture IS NOT NULL AND a_traceur AND programme_id IS NOT NULL
    GROUP BY 1, 2, 3
    UNION ALL
    SELECT site_id, '', mois_cloture, max(date_inventaire)
    FROM dqa.mv_inventaire_mois
    WHERE mois_cloture IS NOT NULL AND a_traceur
    GROUP BY 1, 3
),
univers AS (
    SELECT s.site_id, NULL::text AS programme_id, '' AS cle, m.mois_paqd
    FROM dqa.dim_site s CROSS JOIN mois m
    WHERE s.dans_perimetre_dqa
    UNION
    SELECT g.site_id, g.programme_id, g.programme_id, m.mois_paqd
    FROM geres g CROSS JOIN mois m
    UNION
    -- programme inventorié sans être géré : une ligne le mois de sa clôture
    SELECT c.site_id, c.cle, c.cle, c.mois_paqd
    FROM clotures c JOIN mois m ON m.mois_paqd = c.mois_paqd
    WHERE c.cle <> ''
),
-- Dernier inventaire avec traceur fait après le début du mois et avant la
-- fenêtre de clôture suivante, hors fenêtre de clôture : un inventaire de fin
-- de mois saisi trop tôt ou trop tard (le 15, le 3 du mois suivant).
hors_fenetre AS (
    SELECT u.site_id, u.cle, u.mois_paqd, max(im.date_inventaire) AS date_hors_fenetre
    FROM univers u
    JOIN mois m ON m.mois_paqd = u.mois_paqd
    JOIN dqa.mv_inventaire_mois im
      ON im.site_id = u.site_id
     AND (u.cle = '' OR im.programme_id = u.cle)
     AND im.a_traceur
     AND im.mois_cloture IS NULL
     AND im.date_inventaire >= m.premier_jour
     AND im.date_inventaire < m.debut_fenetre_suivante
    GROUP BY u.site_id, u.cle, u.mois_paqd
)
SELECT
    u.site_id, u.programme_id, u.mois_paqd,
    dqa.est_district(s.type_structure)                         AS est_district,
    (u.programme_id IS NULL OR g.site_id IS NOT NULL)          AS programme_gere,
    c.date_cloture,
    o.date_cloture                                             AS date_ouverture,
    (c.date_cloture IS NOT NULL)                               AS a_cloture,
    (o.date_cloture IS NOT NULL)                               AS a_ouverture,
    m.juge, m.juge_precedent,
    m.debut                                                    AS fenetre_debut,
    m.fin                                                      AS fenetre_fin,
    h.date_hors_fenetre,
    CASE
        WHEN c.date_cloture IS NOT NULL THEN 'cloture'
        WHEN NOT m.juge THEN 'non_jugee'
        WHEN h.date_hors_fenetre IS NOT NULL THEN 'hors_fenetre'
        ELSE 'sans_cloture'
    END                                                        AS cause_cloture,
    CASE
        WHEN o.date_cloture IS NOT NULL THEN 'ouverture'
        WHEN NOT m.juge_precedent THEN 'ouverture_non_jugee'
        ELSE 'sans_ouverture'
    END                                                        AS cause_ouverture
FROM univers u
JOIN mois m ON m.mois_paqd = u.mois_paqd
JOIN dqa.dim_site s ON s.site_id = u.site_id
LEFT JOIN geres g ON g.site_id = u.site_id AND g.programme_id = u.programme_id
LEFT JOIN clotures c ON c.site_id = u.site_id AND c.cle = u.cle AND c.mois_paqd = u.mois_paqd
LEFT JOIN clotures o ON o.site_id = u.site_id AND o.cle = u.cle AND o.mois_paqd = m.mois_prec
LEFT JOIN hors_fenetre h ON h.site_id = u.site_id AND h.cle = u.cle AND h.mois_paqd = u.mois_paqd;

CREATE UNIQUE INDEX mv_cloture_mois_uq
    ON mv_cloture_mois (site_id, mois_paqd, coalesce(programme_id, ''));

COMMENT ON MATERIALIZED VIEW mv_cloture_mois IS
    'Par site, programme (NULL = tous) et mois mesurable : clôture, ouverture, jugement, fenêtre et causes (ADR 0022). Source unique des sanctions de P4 et P5 et des raisons affichées.';

-- ══ 7. P4 ═════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW mv_p4_ecart AS
WITH regles_mois AS (
    SELECT m.mois_paqd,
           max(sc.seuil) FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS seuil_sdu,
           max(sc.sens)  FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS sens_sdu,
           max(sc.seuil) FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS seuil_conso,
           max(sc.sens)  FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS sens_conso,
           max(g.note_sanction)                                                   AS note_sanction
    FROM (SELECT DISTINCT mois_paqd FROM dqa.mv_cloture_mois) m
    JOIN dqa.grille_parametre g ON g.id = dqa.grille_pour_mois(m.mois_paqd)
    JOIN dqa.grille_seuil_sous_composante sc ON sc.grille_id = g.id
    GROUP BY m.mois_paqd
),
-- Un code produit compte une fois, même porté par plusieurs articles : il
-- est conforme seulement si tous ses articles le sont (ADR 0016).
par_code AS (
    SELECT site_id, programme_id, mois_paqd, produit_code,
           bool_and(sdu_conforme)                                                  AS sdu_conforme,
           bool_or(conso_borne_ok)                                                 AS conso_borne_ok,
           coalesce(bool_and(conso_conforme) FILTER (WHERE conso_borne_ok), false) AS conso_conforme
    FROM dqa.mv_p4_ecart_produit
    GROUP BY site_id, programme_id, mois_paqd, produit_code
),
agg AS (
    SELECT site_id, programme_id, mois_paqd,
           count(*)::int                                                      AS nb_produits_sdu,
           (count(*) FILTER (WHERE sdu_conforme))::int                        AS nb_conformes_sdu,
           (count(*) FILTER (WHERE conso_borne_ok))::int                      AS nb_produits_conso,
           (count(*) FILTER (WHERE conso_borne_ok AND conso_conforme))::int   AS nb_conformes_conso
    FROM par_code
    GROUP BY site_id, programme_id, mois_paqd
),
taux AS (
    SELECT cm.site_id, cm.programme_id, cm.mois_paqd, cm.est_district,
           coalesce(a.nb_produits_sdu, 0)    AS nb_produits_sdu,
           coalesce(a.nb_conformes_sdu, 0)   AS nb_conformes_sdu,
           coalesce(a.nb_produits_conso, 0)  AS nb_produits_conso,
           coalesce(a.nb_conformes_conso, 0) AS nb_conformes_conso,
           CASE WHEN coalesce(a.nb_produits_sdu, 0) > 0
                THEN round(a.nb_conformes_sdu::numeric / a.nb_produits_sdu * 100, 1)
                WHEN cm.a_cloture OR NOT cm.juge THEN NULL
                ELSE 0.0
           END AS taux_sdu_pct,
           -- sans clôture ; sans ouverture (mois précédent jugé) ; sans
           -- produit commun aux deux inventaires : sanction une fois jugé
           CASE WHEN coalesce(a.nb_produits_conso, 0) > 0
                THEN round(a.nb_conformes_conso::numeric / a.nb_produits_conso * 100, 1)
                WHEN NOT cm.juge THEN NULL
                WHEN NOT cm.a_cloture THEN 0.0
                WHEN NOT cm.a_ouverture AND NOT cm.juge_precedent THEN NULL
                ELSE 0.0
           END AS taux_conso_pct,
           CASE
               WHEN coalesce(a.nb_produits_conso, 0) > 0 THEN 'calculee'
               WHEN NOT cm.juge THEN 'non_jugee'
               WHEN NOT cm.a_cloture THEN cm.cause_cloture
               WHEN NOT cm.a_ouverture THEN cm.cause_ouverture
               ELSE 'sans_produit_commun'
           END AS cause_consommation,
           CASE WHEN coalesce(a.nb_produits_sdu, 0) > 0 THEN 'calculee' ELSE cm.cause_cloture END AS cause_cloture
    FROM dqa.mv_cloture_mois cm
    LEFT JOIN agg a
           ON a.site_id = cm.site_id AND a.mois_paqd = cm.mois_paqd
          AND a.programme_id IS NOT DISTINCT FROM cm.programme_id
)
SELECT t.site_id, t.programme_id, t.mois_paqd, t.est_district,
       t.taux_sdu_pct, t.nb_produits_sdu, t.nb_conformes_sdu,
       t.taux_conso_pct, t.nb_produits_conso, t.nb_conformes_conso,
       coalesce(t.nb_produits_sdu = 0 AND t.taux_sdu_pct = 0, false)     AS sanction_sdu,
       coalesce(t.nb_produits_conso = 0 AND t.taux_conso_pct = 0, false) AS sanction_conso,
       -- note qui entre dans le score : 100 / 0 au seuil, note de sanction de la grille
       CASE WHEN t.nb_produits_sdu = 0 AND t.taux_sdu_pct = 0 THEN r.note_sanction
            WHEN dqa.seuil_atteint(t.taux_sdu_pct, r.seuil_sdu, r.sens_sdu) THEN 100.0
            WHEN t.taux_sdu_pct IS NOT NULL THEN 0.0
       END::numeric(5, 1)                                      AS score_sdu,
       CASE WHEN t.nb_produits_conso = 0 AND t.taux_conso_pct = 0 THEN r.note_sanction
            WHEN dqa.seuil_atteint(t.taux_conso_pct, r.seuil_conso, r.sens_conso) THEN 100.0
            WHEN t.taux_conso_pct IS NOT NULL THEN 0.0
       END::numeric(5, 1)                                      AS score_conso,
       t.cause_cloture,
       t.cause_consommation
FROM taux t
JOIN regles_mois r ON r.mois_paqd = t.mois_paqd;

CREATE UNIQUE INDEX mv_p4_uq
    ON mv_p4_ecart (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ 8. P5 ═════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW mv_p5_concordance AS
WITH regles_mois AS (
    SELECT m.mois_paqd, max(sc.seuil) AS seuil, max(sc.sens) AS sens, max(g.note_sanction) AS note_sanction
    FROM (SELECT DISTINCT mois_paqd FROM dqa.mv_cloture_mois) m
    JOIN dqa.grille_parametre g ON g.id = dqa.grille_pour_mois(m.mois_paqd)
    JOIN dqa.grille_seuil_sous_composante sc ON sc.grille_id = g.id AND sc.sous_composante = 'concordance'
    GROUP BY m.mois_paqd
),
-- Même inventaire retenu et mêmes lots sommés que P4 ; taux recalculé sans
-- arrondi pour ne pas déclarer concordant un 99,96 %. Un code compte une
-- fois : son article le moins concordant (ADR 0016).
par_code AS (
    SELECT ep.site_id, ep.programme_id, ep.mois_paqd, ep.produit_code,
           min(CASE
                   WHEN greatest(abs(ep.theorique), abs(ep.comptee)) = 0 THEN 100.0
                   ELSE least(abs(ep.theorique), abs(ep.comptee))
                        / greatest(abs(ep.theorique), abs(ep.comptee)) * 100.0
               END) AS taux_pct
    FROM dqa.mv_p4_ecart_produit ep
    WHERE ep.concordance_pct IS NOT NULL
    GROUP BY ep.site_id, ep.programme_id, ep.mois_paqd, ep.produit_code
),
agg AS (
    SELECT pc.site_id, pc.programme_id, pc.mois_paqd,
           round(avg(pc.taux_pct)::numeric, 1)                                                   AS taux_concordance_pct,
           count(*)::int                                                                         AS nb_produits,
           (count(*) FILTER (WHERE dqa.seuil_atteint(pc.taux_pct, r.seuil, r.sens)))::int        AS nb_produits_conformes
    FROM par_code pc
    JOIN regles_mois r ON r.mois_paqd = pc.mois_paqd
    GROUP BY pc.site_id, pc.programme_id, pc.mois_paqd
),
taux AS (
    SELECT cm.site_id, cm.programme_id, cm.mois_paqd,
           CASE WHEN a.site_id IS NOT NULL THEN a.taux_concordance_pct
                WHEN cm.a_cloture OR NOT cm.juge THEN NULL
                ELSE 0.0
           END                                    AS taux_concordance_pct,
           coalesce(a.nb_produits, 0)             AS nb_produits,
           coalesce(a.nb_produits_conformes, 0)   AS nb_produits_conformes,
           CASE WHEN a.site_id IS NOT NULL THEN 'calculee' ELSE cm.cause_cloture END AS cause_cloture
    FROM dqa.mv_cloture_mois cm
    LEFT JOIN agg a
           ON a.site_id = cm.site_id AND a.mois_paqd = cm.mois_paqd
          AND a.programme_id IS NOT DISTINCT FROM cm.programme_id
)
SELECT t.site_id, t.programme_id, t.mois_paqd, t.taux_concordance_pct, t.nb_produits, t.nb_produits_conformes,
       coalesce(t.nb_produits = 0 AND t.taux_concordance_pct = 0, false) AS sanction,
       CASE WHEN t.nb_produits = 0 AND t.taux_concordance_pct = 0 THEN r.note_sanction
            WHEN dqa.seuil_atteint(t.taux_concordance_pct, r.seuil, r.sens) THEN 100.0
            WHEN t.taux_concordance_pct IS NOT NULL THEN 0.0
       END::numeric(5, 1)                                AS score_concordance,
       t.cause_cloture
FROM taux t
JOIN regles_mois r ON r.mois_paqd = t.mois_paqd;

CREATE UNIQUE INDEX mv_p5_uq ON mv_p5_concordance (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ 9. Scores de pilier et composite ══════════════════════════════════════
-- Les poids de la grille sont joints et agrégés, sans fonction par ligne.
CREATE MATERIALIZED VIEW mv_score_pilier AS
-- Un site (ou programme) reçoit un score pour un mois où il a une activité :
-- une mesure P1, P2, P3 ou P6, ou un inventaire avec traceur, dans la
-- fenêtre de clôture ou hors d'elle. Ses sanctions P4 / P5 s'y joignent.
-- Sans aucune activité, il reste « sans mesure » : mv_cloture_mois couvre
-- tous les sites, mais une sanction seule ne fait pas un score.
WITH sites_mois_bruts AS (
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_p1_completude
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_p2_promptitude
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_p3_regularite
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_p6_ajustements
    UNION SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_cloture_mois
          WHERE a_cloture OR date_hors_fenetre IS NOT NULL
),
mois_mesurables AS (
    SELECT m.mois_paqd, dqa.grille_pour_mois(m.mois_paqd) AS grille_id
    FROM (SELECT DISTINCT mois_paqd FROM sites_mois_bruts) m
    WHERE dqa.mois_mesurable(m.mois_paqd)
),
jointes AS (
    SELECT
        sm.site_id, sm.mois_paqd, sm.programme_id, mm.grille_id,
        p1.score_requisitions        AS n_completude_requisitions,
        p1.score_receptions          AS n_completude_receptions,
        p2.score_inventaires         AS n_promptitude_inventaires,
        p2.score_requisitions        AS n_promptitude_requisitions,
        dqa.note_sous_composante(p3.taux_regularite_pct, 'regularite_saisie', sm.mois_paqd,
                                 coalesce(p3.est_district, false)) AS n_regularite_saisie,
        p4.score_sdu                 AS n_ecart_sdu,
        p4.score_conso               AS n_ecart_consommation,
        p5.score_concordance         AS n_concordance,
        dqa.note_sous_composante(p6.ratio_ajustements_pct, 'ratio_ajustements', sm.mois_paqd) AS n_ratio_ajustements,
        coalesce(p4.sanction_sdu, false)   AS sanction_ecart_sdu,
        coalesce(p4.sanction_conso, false) AS sanction_ecart_consommation,
        coalesce(p5.sanction, false)       AS sanction_concordance,
        p1.completude_requisitions_pct  AS sc_completude_requisitions,
        p1.completude_receptions_pct    AS sc_completude_receptions,
        p2.promptitude_inventaires_pct  AS sc_promptitude_inventaires,
        p2.promptitude_requisitions_pct AS sc_promptitude_requisitions,
        p3.taux_regularite_pct          AS sc_regularite_saisie,
        p4.taux_sdu_pct                 AS sc_ecart_sdu,
        p4.taux_conso_pct               AS sc_ecart_consommation,
        p5.taux_concordance_pct         AS sc_concordance,
        p6.ratio_ajustements_pct        AS sc_ratio_ajustements
    FROM sites_mois_bruts sm
    JOIN mois_mesurables mm ON mm.mois_paqd = sm.mois_paqd
    LEFT JOIN dqa.mv_p1_completude p1 ON p1.site_id = sm.site_id AND p1.mois_paqd = sm.mois_paqd AND coalesce(p1.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN dqa.mv_p2_promptitude p2 ON p2.site_id = sm.site_id AND p2.mois_paqd = sm.mois_paqd AND coalesce(p2.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN dqa.mv_p3_regularite p3 ON p3.site_id = sm.site_id AND p3.mois_paqd = sm.mois_paqd AND coalesce(p3.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN dqa.mv_p4_ecart p4 ON p4.site_id = sm.site_id AND p4.mois_paqd = sm.mois_paqd AND coalesce(p4.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN dqa.mv_p5_concordance p5 ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd AND coalesce(p5.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN dqa.mv_p6_ajustements p6 ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd AND coalesce(p6.programme_id, '') = coalesce(sm.programme_id, '')
),
-- Une ligne par sous-composante : sa note, son pilier.
notes AS (
    SELECT j.site_id, j.mois_paqd, j.programme_id, j.grille_id, n.pilier, n.sous_composante, n.note
    FROM jointes j
    CROSS JOIN LATERAL (VALUES
        ('P1', 'completude_requisitions',  j.n_completude_requisitions),
        ('P1', 'completude_receptions',    j.n_completude_receptions),
        ('P2', 'promptitude_inventaires',  j.n_promptitude_inventaires),
        ('P2', 'promptitude_requisitions', j.n_promptitude_requisitions),
        ('P3', 'regularite_saisie',        j.n_regularite_saisie),
        ('P4', 'ecart_sdu',                j.n_ecart_sdu),
        ('P4', 'ecart_consommation',       j.n_ecart_consommation),
        ('P5', 'concordance',              j.n_concordance),
        ('P6', 'ratio_ajustements',        j.n_ratio_ajustements)
    ) AS n(pilier, sous_composante, note)
),
-- Score d'un pilier : moyenne des notes retenues et calculables, pondérée
-- par la composition de la grille ; dénominateur exposé pour la transparence.
piliers AS (
    SELECT n.site_id, n.mois_paqd, n.programme_id, n.grille_id, n.pilier,
           round(sum(n.note * gs.poids_pct) FILTER (WHERE gs.retenue AND n.note IS NOT NULL)
                 / nullif(sum(gs.poids_pct) FILTER (WHERE gs.retenue AND n.note IS NOT NULL), 0), 1)::numeric(5, 1) AS score,
           coalesce(sum(gs.poids_pct) FILTER (WHERE gs.retenue AND n.note IS NOT NULL), 0)::numeric(6, 2)          AS poids_calc
    FROM notes n
    JOIN dqa.grille_seuil_sous_composante gs
      ON gs.grille_id = n.grille_id AND gs.sous_composante = n.sous_composante
    GROUP BY n.site_id, n.mois_paqd, n.programme_id, n.grille_id, n.pilier
),
composite AS (
    SELECT p.site_id, p.mois_paqd, p.programme_id,
           round(sum(p.score * gp.poids_pct) / nullif(sum(gp.poids_pct), 0), 1)::numeric(5, 1) AS score_composite,
           sum(gp.poids_pct)::numeric(6, 2)                                                       AS poids_piliers_calcules
    FROM piliers p
    JOIN dqa.grille_poids_pilier gp ON gp.grille_id = p.grille_id AND gp.pilier = p.pilier
    WHERE p.score IS NOT NULL
    GROUP BY p.site_id, p.mois_paqd, p.programme_id
),
pivot AS (
    SELECT site_id, mois_paqd, programme_id,
           max(score)      FILTER (WHERE pilier = 'P1') AS p_completude,
           max(score)      FILTER (WHERE pilier = 'P2') AS p_promptitude,
           max(score)      FILTER (WHERE pilier = 'P3') AS p_regularite,
           max(score)      FILTER (WHERE pilier = 'P4') AS p_ecart_sdu,
           max(score)      FILTER (WHERE pilier = 'P5') AS p_concordance,
           max(score)      FILTER (WHERE pilier = 'P6') AS p_ajustements,
           max(poids_calc) FILTER (WHERE pilier = 'P1') AS poids_calc_p1,
           max(poids_calc) FILTER (WHERE pilier = 'P2') AS poids_calc_p2,
           max(poids_calc) FILTER (WHERE pilier = 'P3') AS poids_calc_p3,
           max(poids_calc) FILTER (WHERE pilier = 'P4') AS poids_calc_p4,
           max(poids_calc) FILTER (WHERE pilier = 'P5') AS poids_calc_p5,
           max(poids_calc) FILTER (WHERE pilier = 'P6') AS poids_calc_p6
    FROM piliers
    GROUP BY site_id, mois_paqd, programme_id
)
SELECT
    j.site_id, j.mois_paqd, j.programme_id, j.grille_id,
    pv.p_completude, pv.p_promptitude, pv.p_regularite, pv.p_ecart_sdu, pv.p_concordance, pv.p_ajustements,
    j.sc_completude_requisitions, j.sc_completude_receptions,
    j.sc_promptitude_inventaires, j.sc_promptitude_requisitions, j.sc_regularite_saisie,
    j.sc_ecart_sdu, j.sc_ecart_consommation, j.sc_concordance, j.sc_ratio_ajustements,
    c.score_composite,
    CASE
        WHEN c.score_composite IS NULL THEN NULL
        WHEN c.score_composite >= g.borne_conforme THEN 'CONFORME'
        WHEN c.score_composite >= g.borne_partiellement_conforme THEN 'PARTIELLEMENT_CONFORME'
        ELSE 'NON_CONFORME'
    END                                  AS classification,
    j.n_completude_requisitions  AS note_completude_requisitions,
    j.n_completude_receptions    AS note_completude_receptions,
    j.n_promptitude_inventaires  AS note_promptitude_inventaires,
    j.n_promptitude_requisitions AS note_promptitude_requisitions,
    j.n_regularite_saisie        AS note_regularite_saisie,
    j.n_ecart_sdu                AS note_ecart_sdu,
    j.n_ecart_consommation       AS note_ecart_consommation,
    j.n_concordance              AS note_concordance,
    j.n_ratio_ajustements        AS note_ratio_ajustements,
    j.sanction_ecart_sdu, j.sanction_ecart_consommation, j.sanction_concordance,
    pv.poids_calc_p1, pv.poids_calc_p2, pv.poids_calc_p3, pv.poids_calc_p4, pv.poids_calc_p5, pv.poids_calc_p6,
    coalesce(c.poids_piliers_calcules, 0)::numeric(6, 2) AS poids_piliers_calcules
FROM jointes j
JOIN dqa.grille_parametre g ON g.id = j.grille_id
LEFT JOIN pivot pv ON pv.site_id = j.site_id AND pv.mois_paqd = j.mois_paqd
      AND pv.programme_id IS NOT DISTINCT FROM j.programme_id
LEFT JOIN composite c ON c.site_id = j.site_id AND c.mois_paqd = j.mois_paqd
      AND c.programme_id IS NOT DISTINCT FROM j.programme_id;

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));

-- ══ 10. Historique : notes, sanctions et dénominateurs figés ═══════════════
ALTER TABLE hist_score_site
    ADD COLUMN note_completude_requisitions  numeric(5, 1),
    ADD COLUMN note_completude_receptions    numeric(5, 1),
    ADD COLUMN note_promptitude_inventaires  numeric(5, 1),
    ADD COLUMN note_promptitude_requisitions numeric(5, 1),
    ADD COLUMN note_regularite_saisie        numeric(5, 1),
    ADD COLUMN note_ecart_sdu                numeric(5, 1),
    ADD COLUMN note_ecart_consommation       numeric(5, 1),
    ADD COLUMN note_concordance              numeric(5, 1),
    ADD COLUMN note_ratio_ajustements        numeric(5, 1),
    ADD COLUMN sanction_ecart_sdu            boolean NOT NULL DEFAULT false,
    ADD COLUMN sanction_ecart_consommation   boolean NOT NULL DEFAULT false,
    ADD COLUMN sanction_concordance          boolean NOT NULL DEFAULT false,
    ADD COLUMN poids_calc_p1                 numeric(6, 2),
    ADD COLUMN poids_calc_p2                 numeric(6, 2),
    ADD COLUMN poids_calc_p3                 numeric(6, 2),
    ADD COLUMN poids_calc_p4                 numeric(6, 2),
    ADD COLUMN poids_calc_p5                 numeric(6, 2),
    ADD COLUMN poids_calc_p6                 numeric(6, 2),
    ADD COLUMN poids_piliers_calcules        numeric(6, 2);

COMMENT ON COLUMN hist_score_site.note_ecart_consommation IS
    'Note figée d''une sous-composante (100, 0, note de sanction de la grille, ou NULL non calculable) : avec poids_calc_p* et poids_piliers_calcules, elle redonne exactement les scores figés (transparence, ADR 0022).';

-- Statut d'une sous-composante : de sa note figée (une sanction à note non
-- nulle n'est pas un échec de seuil) ; `retenue` dit si elle compte au score.
CREATE VIEW v_sous_composante_atteinte AS
WITH lignes AS (
    SELECT h.site_id, h.mois_paqd, h.programme_id, sc.sous_composante, sc.valeur, sc.note, sc.sanction,
           gs.sens, gs.retenue,
           CASE WHEN sc.sous_composante = 'regularite_saisie' AND gs.seuil_district IS NOT NULL
                     AND dqa.strate_de(ds.type_structure) = 'District'
                THEN gs.seuil_district ELSE gs.seuil END AS seuil
    FROM dqa.hist_score_site h
    JOIN dqa.dim_site ds ON ds.site_id = h.site_id
    CROSS JOIN LATERAL (VALUES
        ('completude_requisitions',  h.sc_completude_requisitions,  h.note_completude_requisitions,  false),
        ('completude_receptions',    h.sc_completude_receptions,    h.note_completude_receptions,    false),
        ('promptitude_inventaires',  h.sc_promptitude_inventaires,  h.note_promptitude_inventaires,  false),
        ('promptitude_requisitions', h.sc_promptitude_requisitions, h.note_promptitude_requisitions, false),
        ('regularite_saisie',        h.sc_regularite_saisie,        h.note_regularite_saisie,        false),
        ('ecart_sdu',                h.sc_ecart_sdu,                h.note_ecart_sdu,                h.sanction_ecart_sdu),
        ('ecart_consommation',       h.sc_ecart_consommation,       h.note_ecart_consommation,       h.sanction_ecart_consommation),
        ('concordance',              h.sc_concordance,              h.note_concordance,              h.sanction_concordance),
        ('ratio_ajustements',        h.sc_ratio_ajustements,        h.note_ratio_ajustements,        false)
    ) AS sc(sous_composante, valeur, note, sanction)
    LEFT JOIN dqa.grille_seuil_sous_composante gs
           ON gs.grille_id = h.grille_id AND gs.sous_composante = sc.sous_composante
)
SELECT site_id, mois_paqd, programme_id, sous_composante, valeur, seuil, sens, note, sanction,
       coalesce(retenue, false) AS retenue,
       CASE
           WHEN valeur IS NULL THEN NULL
           WHEN sous_composante IN ('ecart_sdu', 'ecart_consommation') THEN least(valeur, 100)
           WHEN sens = 'inf' THEN least(seuil / nullif(valeur, 0), 1) * 100
           ELSE least(valeur / nullif(seuil, 0), 1) * 100
       END AS taux_atteinte,
       CASE
           WHEN note IS NULL THEN 'NON_CALCULABLE'
           WHEN note >= 100 THEN 'CONFORME'
           ELSE 'ALERTE'
       END AS statut
FROM lignes;

-- ══ 11. Synthèse par sous-composante : sous-composantes retenues ══════════
CREATE MATERIALIZED VIEW mv_synthese_sous_composante AS
WITH mois AS (
    SELECT DISTINCT mois_paqd FROM dqa.hist_score_site
),
sites AS (
    SELECT site_id, region, district FROM dqa.dim_site WHERE dans_perimetre_dqa
),
gerant AS (
    SELECT sp.site_id, sp.programme_id
    FROM dqa.dim_site_programme sp
    JOIN sites s ON s.site_id = sp.site_id
    WHERE sp.actif
),
-- les sous-composantes retenues par la grille de chaque mois (composition)
noms AS (
    SELECT m.mois_paqd, gs.sous_composante
    FROM mois m
    JOIN dqa.grille_seuil_sous_composante gs
      ON gs.grille_id = dqa.grille_pour_mois(m.mois_paqd) AND gs.retenue
),
-- toutes les cellules attendues : chaque site du périmètre × chaque mois × les sous-composantes retenues
cellules AS (
    SELECT m.mois_paqd, s.site_id, NULL::text AS programme_id,
           s.region, s.district, n.sous_composante, false AS est_prog
    FROM mois m CROSS JOIN sites s JOIN noms n ON n.mois_paqd = m.mois_paqd
    UNION ALL
    SELECT m.mois_paqd, g.site_id, g.programme_id,
           s.region, s.district, n.sous_composante, true AS est_prog
    FROM mois m CROSS JOIN gerant g JOIN sites s ON s.site_id = g.site_id JOIN noms n ON n.mois_paqd = m.mois_paqd
),
detail AS (
    SELECT
        c.mois_paqd, c.programme_id, c.region, c.district, c.est_prog, c.sous_composante,
        va.taux_atteinte,
        coalesce(va.statut, 'NON_CALCULABLE') AS statut
    FROM cellules c
    LEFT JOIN dqa.v_sous_composante_atteinte va
           ON va.site_id = c.site_id AND va.mois_paqd = c.mois_paqd
          AND va.programme_id IS NOT DISTINCT FROM c.programme_id
          AND va.sous_composante = c.sous_composante
)
SELECT
    mois_paqd,
    NULL::text                                                          AS programme_id,
    CASE WHEN grouping(region)   = 1 THEN NULL ELSE region   END         AS region,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END         AS district,
    sous_composante,
    count(*)                                                            AS nb_sites,
    count(*) FILTER (WHERE statut = 'CONFORME')                         AS nb_conforme,
    count(*) FILTER (WHERE statut = 'ALERTE')                           AS nb_alerte,
    count(*) FILTER (WHERE statut = 'NON_CALCULABLE')                   AS nb_non_calculable,
    round(avg(taux_atteinte), 1)::numeric(5, 1)                         AS taux_atteinte_moyen
FROM detail
WHERE NOT est_prog
GROUP BY GROUPING SETS (
    (mois_paqd, sous_composante),
    (mois_paqd, region, sous_composante),
    (mois_paqd, region, district, sous_composante)
)
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(district) = 1 OR district IS NOT NULL)

UNION ALL

SELECT
    mois_paqd,
    programme_id,
    CASE WHEN grouping(region)   = 1 THEN NULL ELSE region   END,
    CASE WHEN grouping(district) = 1 THEN NULL ELSE district END,
    sous_composante,
    count(*),
    count(*) FILTER (WHERE statut = 'CONFORME'),
    count(*) FILTER (WHERE statut = 'ALERTE'),
    count(*) FILTER (WHERE statut = 'NON_CALCULABLE'),
    round(avg(taux_atteinte), 1)::numeric(5, 1)
FROM detail
WHERE est_prog
GROUP BY GROUPING SETS (
    (mois_paqd, programme_id, sous_composante),
    (mois_paqd, programme_id, region, sous_composante),
    (mois_paqd, programme_id, region, district, sous_composante)
)
HAVING (grouping(region) = 1 OR region IS NOT NULL)
   AND (grouping(district) = 1 OR district IS NOT NULL);

CREATE UNIQUE INDEX mv_synthese_sous_composante_uq
    ON mv_synthese_sous_composante
       (mois_paqd, coalesce(programme_id, ''), coalesce(region, ''), coalesce(district, ''), sous_composante);

-- ══ 12. Produits absents d'un inventaire ═══════════════════════════════════
ALTER TABLE hist_produit_ecarte RENAME COLUMN receptions TO entrees;
ALTER TABLE hist_produit_ecarte RENAME COLUMN sorties_declarees TO sorties;
COMMENT ON COLUMN hist_produit_ecarte.entrees IS
    'Entrées enregistrées entre les deux inventaires : factures fournisseur, ajustements positifs, retours client.';
COMMENT ON COLUMN hist_produit_ecarte.sorties IS
    'Sorties enregistrées entre les deux inventaires : dispensations (distributions pour un district), ajustements négatifs, retours fournisseur.';

-- Constat de site (tous programmes, par code produit), quand le site a ses
-- deux inventaires (mv_cloture_mois). Toutes les entrées et sorties
-- enregistrées comptent :
--   - absent de l'ouverture : stock minimal à l'ouverture = compté clôture
--     + sorties - entrées ; les sorties réelles sont au moins les sorties
--     enregistrées, > 0 prouve que le produit existait : `oubli_demontre` ;
--     sinon `indetermine` (rupture possible) ;
--   - absent de la clôture (il sort de P4 et de P5 pour le mois) : stock
--     attendu = compté ouverture + entrées - sorties ; des pertes non
--     saisies le surestiment : > 0 donne `oubli_probable`, sinon `epuise`.
CREATE MATERIALIZED VIEW mv_produit_ecarte AS
WITH base AS (
    -- clôtures retenues, tous programmes ; un code compte une fois (ADR 0016)
    SELECT site_id, mois_paqd, produit_code,
           max(libelle)          AS libelle,
           sum(comptee)          AS comptee,
           bool_or(est_district) AS est_district
    FROM dqa.mv_p4_ecart_produit
    WHERE programme_id IS NULL
    GROUP BY site_id, mois_paqd, produit_code
),
paires AS (
    SELECT site_id, mois_paqd, dqa.mois_precedent(mois_paqd) AS mois_prec,
           date_ouverture, date_cloture, est_district
    FROM dqa.mv_cloture_mois
    WHERE programme_id IS NULL AND a_cloture AND a_ouverture
),
absents AS (
    SELECT p.site_id, p.mois_paqd, p.date_ouverture, p.date_cloture, p.est_district,
           b.produit_code, b.libelle, b.comptee AS stock_connu, 'absent_ouverture'::text AS sens
    FROM paires p
    JOIN base b ON b.site_id = p.site_id AND b.mois_paqd = p.mois_paqd
    LEFT JOIN base o ON o.site_id = p.site_id AND o.mois_paqd = p.mois_prec AND o.produit_code = b.produit_code
    WHERE o.produit_code IS NULL
    UNION ALL
    SELECT p.site_id, p.mois_paqd, p.date_ouverture, p.date_cloture, p.est_district,
           b.produit_code, b.libelle, b.comptee, 'absent_cloture'
    FROM paires p
    JOIN base b ON b.site_id = p.site_id AND b.mois_paqd = p.mois_prec
    LEFT JOIN base c ON c.site_id = p.site_id AND c.mois_paqd = p.mois_paqd AND c.produit_code = b.produit_code
    WHERE c.produit_code IS NULL
),
flux AS (
    SELECT a.site_id, a.mois_paqd, a.produit_code, a.sens,
           coalesce(sum(m.reception + m.entree_autre), 0) AS entrees,
           coalesce(sum(CASE WHEN a.est_district THEN m.distribution ELSE m.dispensation END + m.sortie_autre), 0) AS sorties
    FROM absents a
    LEFT JOIN dqa.v_mouvement_stock_jour m
           ON m.site_id = a.site_id AND m.produit_code = a.produit_code
          AND m.jour > a.date_ouverture AND m.jour <= a.date_cloture
    GROUP BY a.site_id, a.mois_paqd, a.produit_code, a.sens
)
SELECT a.site_id, a.mois_paqd, a.produit_code, a.libelle, a.sens,
       a.date_ouverture, a.date_cloture,
       a.stock_connu, f.entrees, f.sorties,
       c.stock_calcule,
       CASE
           WHEN a.sens = 'absent_ouverture' AND c.stock_calcule > 0 THEN 'oubli_demontre'
           WHEN a.sens = 'absent_ouverture'                         THEN 'indetermine'
           WHEN c.stock_calcule > 0                                 THEN 'oubli_probable'
           ELSE 'epuise'
       END AS qualification
FROM absents a
JOIN flux f USING (site_id, mois_paqd, produit_code, sens)
CROSS JOIN LATERAL (SELECT CASE WHEN a.sens = 'absent_ouverture'
                                THEN a.stock_connu + f.sorties - f.entrees
                                ELSE a.stock_connu + f.entrees - f.sorties
                           END AS stock_calcule) c;

CREATE UNIQUE INDEX mv_produit_ecarte_uq ON mv_produit_ecarte (site_id, mois_paqd, produit_code, sens);

-- ══ 13. Gel ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE PROCEDURE dqa.rafraichir_et_geler(p_lot_id bigint)
LANGUAGE plpgsql AS $$
DECLARE
    v_lot_id bigint;
BEGIN
    SELECT id INTO v_lot_id FROM dqa.import_lot WHERE id = p_lot_id;

    -- ordre des dépendances : inventaires, P1 à P3, P4 par produit, clôtures,
    -- P4, P5, P6, scores
    REFRESH MATERIALIZED VIEW dqa.mv_inventaire_mois;
    REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
    REFRESH MATERIALIZED VIEW dqa.mv_p2_promptitude;
    REFRESH MATERIALIZED VIEW dqa.mv_p3_regularite;
    REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart_produit;
    REFRESH MATERIALIZED VIEW dqa.mv_cloture_mois;
    REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
    REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
    REFRESH MATERIALIZED VIEW dqa.mv_p6_ajustements;
    REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;

    INSERT INTO dqa.hist_score_site
        (site_id, mois_paqd, programme_id, grille_id,
         p_completude, p_promptitude, p_regularite, p_ecart_sdu,
         p_concordance, p_ajustements,
         sc_completude_requisitions, sc_completude_receptions,
         sc_promptitude_inventaires, sc_promptitude_requisitions, sc_regularite_saisie,
         sc_ecart_sdu, sc_ecart_consommation, sc_concordance, sc_ratio_ajustements,
         score_composite, classification,
         note_completude_requisitions, note_completude_receptions,
         note_promptitude_inventaires, note_promptitude_requisitions, note_regularite_saisie,
         note_ecart_sdu, note_ecart_consommation, note_concordance, note_ratio_ajustements,
         sanction_ecart_sdu, sanction_ecart_consommation, sanction_concordance,
         poids_calc_p1, poids_calc_p2, poids_calc_p3, poids_calc_p4, poids_calc_p5, poids_calc_p6,
         poids_piliers_calcules, lot_id, calcule_le)
    SELECT sp.site_id, sp.mois_paqd, sp.programme_id, dqa.grille_pour_mois(sp.mois_paqd),
           sp.p_completude, sp.p_promptitude, sp.p_regularite, sp.p_ecart_sdu,
           sp.p_concordance, sp.p_ajustements,
           sp.sc_completude_requisitions, sp.sc_completude_receptions,
           sp.sc_promptitude_inventaires, sp.sc_promptitude_requisitions, sp.sc_regularite_saisie,
           sp.sc_ecart_sdu, sp.sc_ecart_consommation, sp.sc_concordance, sp.sc_ratio_ajustements,
           sp.score_composite, sp.classification,
           sp.note_completude_requisitions, sp.note_completude_receptions,
           sp.note_promptitude_inventaires, sp.note_promptitude_requisitions, sp.note_regularite_saisie,
           sp.note_ecart_sdu, sp.note_ecart_consommation, sp.note_concordance, sp.note_ratio_ajustements,
           sp.sanction_ecart_sdu, sp.sanction_ecart_consommation, sp.sanction_concordance,
           sp.poids_calc_p1, sp.poids_calc_p2, sp.poids_calc_p3, sp.poids_calc_p4, sp.poids_calc_p5, sp.poids_calc_p6,
           sp.poids_piliers_calcules, v_lot_id, now()
    FROM dqa.mv_score_pilier sp
    JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
    ON CONFLICT (site_id, mois_paqd, programme_id) DO UPDATE SET
        grille_id                   = EXCLUDED.grille_id,
        p_completude                = EXCLUDED.p_completude,
        p_promptitude               = EXCLUDED.p_promptitude,
        p_regularite                = EXCLUDED.p_regularite,
        p_ecart_sdu                 = EXCLUDED.p_ecart_sdu,
        p_concordance               = EXCLUDED.p_concordance,
        p_ajustements               = EXCLUDED.p_ajustements,
        sc_completude_requisitions  = EXCLUDED.sc_completude_requisitions,
        sc_completude_receptions    = EXCLUDED.sc_completude_receptions,
        sc_promptitude_inventaires  = EXCLUDED.sc_promptitude_inventaires,
        sc_promptitude_requisitions = EXCLUDED.sc_promptitude_requisitions,
        sc_regularite_saisie        = EXCLUDED.sc_regularite_saisie,
        sc_ecart_sdu                = EXCLUDED.sc_ecart_sdu,
        sc_ecart_consommation       = EXCLUDED.sc_ecart_consommation,
        sc_concordance              = EXCLUDED.sc_concordance,
        sc_ratio_ajustements        = EXCLUDED.sc_ratio_ajustements,
        score_composite             = EXCLUDED.score_composite,
        classification              = EXCLUDED.classification,
        note_completude_requisitions  = EXCLUDED.note_completude_requisitions,
        note_completude_receptions    = EXCLUDED.note_completude_receptions,
        note_promptitude_inventaires  = EXCLUDED.note_promptitude_inventaires,
        note_promptitude_requisitions = EXCLUDED.note_promptitude_requisitions,
        note_regularite_saisie        = EXCLUDED.note_regularite_saisie,
        note_ecart_sdu                = EXCLUDED.note_ecart_sdu,
        note_ecart_consommation       = EXCLUDED.note_ecart_consommation,
        note_concordance              = EXCLUDED.note_concordance,
        note_ratio_ajustements        = EXCLUDED.note_ratio_ajustements,
        sanction_ecart_sdu            = EXCLUDED.sanction_ecart_sdu,
        sanction_ecart_consommation   = EXCLUDED.sanction_ecart_consommation,
        sanction_concordance          = EXCLUDED.sanction_concordance,
        poids_calc_p1                 = EXCLUDED.poids_calc_p1,
        poids_calc_p2                 = EXCLUDED.poids_calc_p2,
        poids_calc_p3                 = EXCLUDED.poids_calc_p3,
        poids_calc_p4                 = EXCLUDED.poids_calc_p4,
        poids_calc_p5                 = EXCLUDED.poids_calc_p5,
        poids_calc_p6                 = EXCLUDED.poids_calc_p6,
        poids_piliers_calcules        = EXCLUDED.poids_piliers_calcules,
        lot_id                      = EXCLUDED.lot_id,
        calcule_le                  = now();

    -- Le gel reconstruit tous les mois (ADR 0010) : une ligne qui n'est plus
    -- calculée (programme retiré, données corrigées) ne survit pas. Un site
    -- sorti du périmètre n'est plus calculé mais garde son historique.
    DELETE FROM dqa.hist_score_site h
    WHERE NOT EXISTS (SELECT 1 FROM dqa.mv_score_pilier sp
                       WHERE sp.site_id = h.site_id AND sp.mois_paqd = h.mois_paqd
                         AND sp.programme_id IS NOT DISTINCT FROM h.programme_id)
      AND EXISTS (SELECT 1 FROM dqa.dim_site s WHERE s.site_id = h.site_id AND s.dans_perimetre_dqa);

    -- Un compte n'est figé que si sa sous-composante est calculable : avant
    -- l'échéance, aucun couple attendu / réalisé ne circule.
    INSERT INTO dqa.hist_pilier_brut
        (site_id, mois_paqd, programme_id, mesure, nb_attendu, nb_realise, nb_a_lheure, lot_id, calcule_le)
    SELECT sm.site_id, sm.mois_paqd, sm.programme_id, m.mesure,
           m.nb_attendu::int, m.nb_realise::int, m.nb_a_lheure::int, v_lot_id, now()
    FROM (SELECT DISTINCT site_id, mois_paqd, programme_id FROM dqa.mv_score_pilier) sm
    JOIN dqa.dim_site s ON s.site_id = sm.site_id AND s.dans_perimetre_dqa
    LEFT JOIN dqa.mv_p1_completude  p1 ON p1.site_id = sm.site_id AND p1.mois_paqd = sm.mois_paqd AND p1.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p2_promptitude p2 ON p2.site_id = sm.site_id AND p2.mois_paqd = sm.mois_paqd AND p2.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p3_regularite  p3 ON p3.site_id = sm.site_id AND p3.mois_paqd = sm.mois_paqd AND p3.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p4_ecart       p4 ON p4.site_id = sm.site_id AND p4.mois_paqd = sm.mois_paqd AND p4.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p5_concordance p5 ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd AND p5.programme_id IS NOT DISTINCT FROM sm.programme_id
    LEFT JOIN dqa.mv_p6_ajustements p6 ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd AND p6.programme_id IS NOT DISTINCT FROM sm.programme_id
    CROSS JOIN LATERAL (VALUES
        ('p1_requisitions',       p1.nb_requisitions_attendu, p1.nb_requisitions_realise,  NULL::int,                     p1.completude_requisitions_pct),
        ('p1_receptions',         p1.nb_factures,             p1.nb_factures_acceptees,    NULL::int,                     p1.completude_receptions_pct),
        ('p2_inventaires',        p2.nb_inventaires_attendu,  p2.nb_inventaires_realise,   p2.nb_inventaires_a_lheure,    p2.promptitude_inventaires_pct),
        ('p2_requisitions',       p2.nb_requisitions_attendu, p2.nb_requisitions_realise,  p2.nb_requisitions_a_lheure,   p2.promptitude_requisitions_pct),
        ('p3_regularite',         p3.nb_jours,                p3.nb_jours_avec_sortie,     NULL::int,                     p3.taux_regularite_pct),
        ('p4_ecart_sdu',          p4.nb_produits_sdu,         p4.nb_conformes_sdu,         NULL::int,                     p4.taux_sdu_pct),
        ('p4_ecart_consommation', p4.nb_produits_conso,       p4.nb_conformes_conso,       NULL::int,                     p4.taux_conso_pct),
        ('p5_concordance',        p5.nb_produits,             p5.nb_produits_conformes,    NULL::int,                     p5.taux_concordance_pct),
        ('p6_ajustements',        p6.nb_mouvements,           p6.nb_ajustements,           NULL::int,                     p6.ratio_ajustements_pct)
    ) AS m(mesure, nb_attendu, nb_realise, nb_a_lheure, pct)
    WHERE m.pct IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_hist_pilier_brut DO UPDATE SET
        nb_attendu  = EXCLUDED.nb_attendu,
        nb_realise  = EXCLUDED.nb_realise,
        nb_a_lheure = EXCLUDED.nb_a_lheure,
        lot_id      = EXCLUDED.lot_id,
        calcule_le  = now();

    -- Un compte n'existe que si sa sous-composante est calculable dans la vue
    -- courante : toute mesure devenue non calculable (règle, échéance,
    -- programme retiré, données corrigées) est retirée, sauf pour un site
    -- sorti du périmètre, qui garde son historique.
    DELETE FROM dqa.hist_pilier_brut b
    WHERE NOT EXISTS (
        SELECT 1
        FROM dqa.mv_score_pilier sp
        CROSS JOIN LATERAL (VALUES
            ('p1_requisitions',       sp.sc_completude_requisitions),
            ('p1_receptions',         sp.sc_completude_receptions),
            ('p2_inventaires',        sp.sc_promptitude_inventaires),
            ('p2_requisitions',       sp.sc_promptitude_requisitions),
            ('p3_regularite',         sp.sc_regularite_saisie),
            ('p4_ecart_sdu',          sp.sc_ecart_sdu),
            ('p4_ecart_consommation', sp.sc_ecart_consommation),
            ('p5_concordance',        sp.sc_concordance),
            ('p6_ajustements',        sp.sc_ratio_ajustements)
        ) AS m(mesure, pct)
        WHERE sp.site_id = b.site_id AND sp.mois_paqd = b.mois_paqd
          AND sp.programme_id IS NOT DISTINCT FROM b.programme_id
          AND m.mesure = b.mesure AND m.pct IS NOT NULL)
      AND EXISTS (SELECT 1 FROM dqa.dim_site s WHERE s.site_id = b.site_id AND s.dans_perimetre_dqa);

    -- Produits écartés d'un inventaire (migration 0060) : historisés comme les
    -- scores, tout mois reconstruit à chaque gel (ADR 0010) ; une absence qui
    -- n'existe plus dans le core (ré-import corrigé) est retirée.
    REFRESH MATERIALIZED VIEW dqa.mv_produit_ecarte;
    INSERT INTO dqa.hist_produit_ecarte
        (site_id, mois_paqd, produit_code, sens, libelle, date_ouverture, date_cloture,
         stock_connu, entrees, sorties, stock_calcule, qualification, lot_id, calcule_le)
    SELECT site_id, mois_paqd, produit_code, sens, libelle, date_ouverture, date_cloture,
           stock_connu, entrees, sorties, stock_calcule, qualification, v_lot_id, now()
    FROM dqa.mv_produit_ecarte
    ON CONFLICT (site_id, mois_paqd, produit_code, sens) DO UPDATE SET
        libelle           = EXCLUDED.libelle,
        date_ouverture    = EXCLUDED.date_ouverture,
        date_cloture      = EXCLUDED.date_cloture,
        stock_connu       = EXCLUDED.stock_connu,
        entrees           = EXCLUDED.entrees,
        sorties           = EXCLUDED.sorties,
        stock_calcule     = EXCLUDED.stock_calcule,
        qualification     = EXCLUDED.qualification,
        lot_id            = EXCLUDED.lot_id,
        calcule_le        = now();
    -- Seule une absence corrigée par un ré-import est retirée : un site sorti
    -- du périmètre ou un traceur désactivé garde son historique (migration 0061).
    DELETE FROM dqa.hist_produit_ecarte h
    WHERE NOT EXISTS (SELECT 1 FROM dqa.mv_produit_ecarte v
                       WHERE v.site_id = h.site_id AND v.mois_paqd = h.mois_paqd
                         AND v.produit_code = h.produit_code AND v.sens = h.sens)
      AND EXISTS (SELECT 1 FROM dqa.dim_site s WHERE s.site_id = h.site_id AND s.dans_perimetre_dqa)
      AND EXISTS (SELECT 1 FROM dqa.dim_produit_traceur t WHERE t.produit_code = h.produit_code AND t.actif);

    REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_territoire_rapports;
    REFRESH MATERIALIZED VIEW dqa.mv_synthese_territoire_scores;
END;
$$;

-- ══ 14. L'historique suit les règles de cette migration ══════════════════
CALL dqa.rafraichir_et_geler(NULL);
