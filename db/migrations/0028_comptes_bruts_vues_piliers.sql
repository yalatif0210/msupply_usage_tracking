-- ═══════════════════════════════════════════════════════════════════════════
--  COUCHE 3 — Les vues de pilier exposent leurs couples attendu / réalisé
--
--  Chaque vue mv_pN calcule déjà en interne le numérateur et le dénominateur
--  qui produisent son taux, puis les jette au SELECT final. Ce ticket les
--  projette, sans toucher aux taux, aux scores ni au score composite.
--
--   - mv_p1_completude  : + inventaires réalisés / attendus, réquisitions
--                          réalisées / attendues, réceptions / factures
--   - mv_p2_promptitude : + inventaires à l'heure / attendus, réquisitions
--                          à l'heure / attendues (grain « programme géré »,
--                          comme P1 : cf. 0020)
--   - mv_p4_ecart       : + produits conformes SDU / évalués, produits
--                          conformes conso / évalués
--   - mv_p5_concordance : + produits traceurs conformes au seuil / inventoriés
--
--  P3 (nb_jours_avec_sortie / nb_jours) et P6 (nb_ajustements / nb_mouvements)
--  exposent déjà leurs couples : inchangées.
--
--  Le DROP … CASCADE de mv_p1 emporte mv_score_pilier : reconstruite à
--  l'identique de 0025 (dix valeurs sc_*). mv_p4_ecart_produit et
--  mv_synthese_nationale ne dépendent pas de ces vues : intactes.
--  rafraichir_et_geler (0025) résout les vues au moment de l'appel : inchangée.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

DROP MATERIALIZED VIEW IF EXISTS mv_p1_completude CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_p2_promptitude CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_p4_ecart CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_p5_concordance CASCADE;

-- ── P1 — complétude des transactions ──────────────────────────────────────
CREATE MATERIALIZED VIEW mv_p1_completude AS
WITH perimetre AS (
    SELECT site_id FROM dqa.dim_site WHERE dans_perimetre_dqa
),
managed AS (
    SELECT sp.site_id, sp.programme_id AS prog
    FROM dqa.dim_site_programme sp
    JOIN perimetre p ON p.site_id = sp.site_id
    WHERE sp.actif
),
activite AS (
    SELECT DISTINCT site_id, mois FROM (
        SELECT fi.site_id, to_char(fi.date_inventaire, 'YYYY-MM') AS mois
        FROM dqa.fact_inventaire fi
        JOIN perimetre p ON p.site_id = fi.site_id
        WHERE fi.statut = 'fn'
        UNION ALL
        SELECT fr.site_id, fr.mois_couvert
        FROM dqa.fact_requisition fr
        JOIN perimetre p ON p.site_id = fr.site_id
        UNION ALL
        SELECT ft.site_id, to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM')
        FROM dqa.fact_transaction ft
        JOIN perimetre p ON p.site_id = ft.site_id
        WHERE ft.nature IN ('reception', 'facture_fournisseur')
          AND coalesce(ft.annulation, false) = false
          AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
    ) u
),
grain AS (
    SELECT a.site_id, a.mois, m.prog
    FROM activite a
    JOIN managed m ON m.site_id = a.site_id
    UNION
    SELECT a.site_id, a.mois, NULL::text
    FROM activite a
),
statut_prog AS (
    SELECT
        g.site_id, g.mois, m.prog,
        EXISTS (SELECT 1 FROM dqa.fact_inventaire fi
                 WHERE fi.site_id = g.site_id AND fi.statut = 'fn'
                   AND fi.programme_id = m.prog
                   AND to_char(fi.date_inventaire, 'YYYY-MM') = g.mois)     AS a_inv,
        EXISTS (SELECT 1 FROM dqa.fact_requisition fr
                 WHERE fr.site_id = g.site_id AND fr.programme_id = m.prog
                   AND fr.mois_couvert = g.mois)                            AS a_req
    FROM (SELECT DISTINCT site_id, mois FROM grain) g
    JOIN managed m ON m.site_id = g.site_id
),
inv_req AS (
    -- par programme géré : attendu 1, réalisé 0 ou 1
    SELECT sp.site_id, sp.mois, sp.prog,
        CASE WHEN sp.a_inv THEN 100.0 ELSE 0.0 END              AS completude_inventaires_pct,
        CASE WHEN sp.a_req THEN 100.0 ELSE 0.0 END              AS completude_requisitions_pct,
        1                                                       AS nb_inventaires_attendu,
        CASE WHEN sp.a_inv THEN 1 ELSE 0 END                    AS nb_inventaires_realise,
        1                                                       AS nb_requisitions_attendu,
        CASE WHEN sp.a_req THEN 1 ELSE 0 END                    AS nb_requisitions_realise
    FROM statut_prog sp
    UNION ALL
    -- tous programmes : part des programmes gérés couverts
    SELECT sp.site_id, sp.mois, NULL::text,
        round(100.0 * count(*) FILTER (WHERE sp.a_inv) / nullif(count(*), 0), 1),
        round(100.0 * count(*) FILTER (WHERE sp.a_req) / nullif(count(*), 0), 1),
        count(*)::int,
        count(*) FILTER (WHERE sp.a_inv)::int,
        count(*)::int,
        count(*) FILTER (WHERE sp.a_req)::int
    FROM statut_prog sp
    GROUP BY sp.site_id, sp.mois
),
receptions AS (
    SELECT
        g.site_id, g.mois, g.prog,
        (SELECT count(*)::int FROM dqa.fact_transaction ft
          WHERE ft.site_id = g.site_id AND ft.nature = 'reception'
            AND coalesce(ft.statut, '') = 'fn'
            AND coalesce(ft.annulation, false) = false
            AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = g.mois
            AND (g.prog IS NULL OR ft.programme_id = g.prog))              AS nb_receptions,
        (SELECT count(*)::int FROM dqa.fact_transaction ft
          WHERE ft.site_id = g.site_id AND ft.nature = 'facture_fournisseur'
            AND coalesce(ft.annulation, false) = false
            AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = g.mois
            AND (g.prog IS NULL OR ft.programme_id = g.prog))              AS nb_factures
    FROM grain g
),
seuil AS (
    SELECT m.mois, max(sc.seuil) AS seuil
    FROM (SELECT DISTINCT mois FROM grain) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois)
     AND sc.sous_composante = 'completude_inventaires'
    GROUP BY m.mois
),
assemble AS (
    SELECT
        ir.site_id,
        ir.prog                                                          AS programme_id,
        ir.mois                                                          AS mois_paqd,
        ir.completude_inventaires_pct,
        ir.completude_requisitions_pct,
        CASE WHEN r.nb_factures > 0
             THEN round(100.0 * r.nb_receptions / r.nb_factures, 1)
        END                                                              AS completude_receptions_pct,
        ir.nb_inventaires_realise,
        ir.nb_inventaires_attendu,
        ir.nb_requisitions_realise,
        ir.nb_requisitions_attendu,
        r.nb_receptions,
        r.nb_factures,
        s.seuil
    FROM inv_req ir
    JOIN seuil s ON s.mois = ir.mois
    LEFT JOIN receptions r
           ON r.site_id = ir.site_id AND r.mois = ir.mois
          AND r.prog IS NOT DISTINCT FROM ir.prog
)
SELECT
    site_id,
    programme_id,
    mois_paqd,
    completude_inventaires_pct,
    completude_requisitions_pct,
    completude_receptions_pct,
    nb_inventaires_realise,
    nb_inventaires_attendu,
    nb_requisitions_realise,
    nb_requisitions_attendu,
    nb_receptions,
    nb_factures,
    CASE WHEN completude_inventaires_pct  >= seuil THEN 100.0 ELSE 0.0 END AS score_inventaires,
    CASE WHEN completude_requisitions_pct >= seuil THEN 100.0 ELSE 0.0 END AS score_requisitions,
    CASE WHEN completude_receptions_pct IS NULL THEN NULL
         WHEN completude_receptions_pct >= seuil THEN 100.0 ELSE 0.0 END   AS score_receptions,
    (
        SELECT round(avg(v.s), 1)::numeric(5, 1)
        FROM (VALUES
            (CASE WHEN completude_inventaires_pct  >= seuil THEN 100.0 ELSE 0.0 END),
            (CASE WHEN completude_requisitions_pct >= seuil THEN 100.0 ELSE 0.0 END),
            (CASE WHEN completude_receptions_pct IS NULL THEN NULL
                  WHEN completude_receptions_pct >= seuil THEN 100.0 ELSE 0.0 END)
        ) AS v(s)
        WHERE v.s IS NOT NULL
    )                                                                    AS p_completude
FROM assemble;

CREATE UNIQUE INDEX mv_p1_uq
    ON mv_p1_completude (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── P2 — promptitude des transactions (grain « programme géré », cf. 0020) ──
CREATE MATERIALIZED VIEW mv_p2_promptitude AS
WITH perimetre AS (
    SELECT site_id, type_structure, jour_limite_requisition
    FROM dqa.dim_site WHERE dans_perimetre_dqa
),
managed AS (
    SELECT sp.site_id, sp.programme_id AS prog
    FROM dqa.dim_site_programme sp
    JOIN perimetre p ON p.site_id = sp.site_id
    WHERE sp.actif
),
activite AS (
    SELECT DISTINCT site_id, mois FROM (
        SELECT fi.site_id, to_char(fi.date_inventaire, 'YYYY-MM') AS mois
        FROM dqa.fact_inventaire fi
        JOIN perimetre p ON p.site_id = fi.site_id
        WHERE fi.statut = 'fn'
        UNION ALL
        SELECT fr.site_id, fr.mois_couvert
        FROM dqa.fact_requisition fr
        JOIN perimetre p ON p.site_id = fr.site_id
    ) u
),
statut_prog AS (
    SELECT
        a.site_id, a.mois, m.prog,
        EXISTS (
            SELECT 1 FROM dqa.fact_inventaire fi
            WHERE fi.site_id = a.site_id AND fi.statut = 'fn'
              AND fi.programme_id = m.prog
              AND to_char(fi.date_inventaire, 'YYYY-MM') = a.mois
              AND fi.date_inventaire >= (date_trunc('month', fi.date_inventaire)
                                        + interval '1 month' - interval '3 days')::date
        ) AS inv_ot,
        EXISTS (
            SELECT 1 FROM dqa.fact_requisition fr
            WHERE fr.site_id = a.site_id AND fr.programme_id = m.prog
              AND fr.mois_couvert = a.mois
              AND fr.date_soumission IS NOT NULL
              AND fr.date_soumission <= (
                  (date_trunc('month', (a.mois || '-01')::date) + interval '1 month')::date
                  + (coalesce(
                       p.jour_limite_requisition,
                       CASE WHEN p.type_structure IN ('CSU', 'CSR', 'ESPC') THEN 5
                            WHEN p.type_structure IN ('HG', 'CHR')          THEN 7
                            ELSE 10 END
                     ) - 1)
              )
        ) AS req_ot
    FROM activite a
    JOIN managed m    ON m.site_id = a.site_id
    JOIN perimetre p  ON p.site_id = a.site_id
),
seuil AS (
    SELECT m.mois, max(sc.seuil) AS seuil
    FROM (SELECT DISTINCT mois FROM activite) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois)
     AND sc.sous_composante = 'promptitude_inventaires'
    GROUP BY m.mois
),
par_prog AS (
    SELECT site_id, mois, prog,
        CASE WHEN inv_ot THEN 100.0 ELSE 0.0 END AS promptitude_inventaires_pct,
        CASE WHEN req_ot THEN 100.0 ELSE 0.0 END AS promptitude_requisitions_pct,
        1                                        AS nb_inventaires_attendu,
        CASE WHEN inv_ot THEN 1 ELSE 0 END       AS nb_inventaires_a_lheure,
        1                                        AS nb_requisitions_attendu,
        CASE WHEN req_ot THEN 1 ELSE 0 END       AS nb_requisitions_a_lheure
    FROM statut_prog
    UNION ALL
    SELECT site_id, mois, NULL::text,
        round(100.0 * count(*) FILTER (WHERE inv_ot) / nullif(count(*), 0), 1),
        round(100.0 * count(*) FILTER (WHERE req_ot) / nullif(count(*), 0), 1),
        count(*)::int,
        count(*) FILTER (WHERE inv_ot)::int,
        count(*)::int,
        count(*) FILTER (WHERE req_ot)::int
    FROM statut_prog
    GROUP BY site_id, mois
)
SELECT
    pp.site_id,
    pp.prog                                          AS programme_id,
    pp.mois                                           AS mois_paqd,
    pp.promptitude_inventaires_pct,
    pp.promptitude_requisitions_pct,
    pp.nb_inventaires_a_lheure,
    pp.nb_inventaires_attendu,
    pp.nb_requisitions_a_lheure,
    pp.nb_requisitions_attendu,
    CASE WHEN pp.promptitude_inventaires_pct  >= s.seuil THEN 100.0 ELSE 0.0 END AS score_inventaires,
    CASE WHEN pp.promptitude_requisitions_pct >= s.seuil THEN 100.0 ELSE 0.0 END AS score_requisitions,
    round((
        (CASE WHEN pp.promptitude_inventaires_pct  >= s.seuil THEN 100.0 ELSE 0.0 END)
      + (CASE WHEN pp.promptitude_requisitions_pct >= s.seuil THEN 100.0 ELSE 0.0 END)
    ) / 2.0, 1)::numeric(5, 1)                        AS p_promptitude
FROM par_prog pp
JOIN seuil s ON s.mois = pp.mois;

CREATE UNIQUE INDEX mv_p2_uq
    ON mv_p2_promptitude (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── P5 — concordance physique / théorique ────────────────────────────────
CREATE MATERIALIZED VIEW mv_p5_concordance AS
WITH dernier_inv AS (
    SELECT DISTINCT ON (fi.site_id, fil.produit_id, to_char(fi.date_inventaire, 'YYYY-MM'))
        fi.site_id,
        fi.programme_id,
        to_char(fi.date_inventaire, 'YYYY-MM')                       AS mois_paqd,
        fil.produit_id,
        fil.quantite_comptee,
        fil.quantite_theorique
    FROM dqa.fact_inventaire fi
    JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
    JOIN dqa.dim_produit p     ON p.produit_id = fil.produit_id
    JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
    JOIN dqa.dim_site s        ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    WHERE fi.statut = 'fn'
    ORDER BY fi.site_id, fil.produit_id, to_char(fi.date_inventaire, 'YYYY-MM'),
             fi.date_inventaire DESC
),
seuil_mois AS (
    SELECT m.mois_paqd, max(sc.seuil) AS seuil
    FROM (SELECT DISTINCT mois_paqd FROM dernier_inv) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
     AND sc.sous_composante = 'concordance'
    GROUP BY m.mois_paqd
),
taux AS (
    SELECT di.site_id, di.programme_id, di.mois_paqd, di.produit_id,
        CASE
            WHEN di.quantite_theorique IS NULL OR di.quantite_comptee IS NULL THEN NULL
            WHEN greatest(abs(di.quantite_theorique), abs(di.quantite_comptee)) = 0 THEN 100.0
            ELSE least(abs(di.quantite_theorique), abs(di.quantite_comptee))
                 / greatest(abs(di.quantite_theorique), abs(di.quantite_comptee)) * 100.0
        END AS taux_pct,
        sm.seuil
    FROM dernier_inv di
    LEFT JOIN seuil_mois sm ON sm.mois_paqd = di.mois_paqd
)
SELECT
    site_id,
    CASE WHEN grouping(programme_id) = 1 THEN NULL ELSE programme_id END AS programme_id,
    mois_paqd,
    round(avg(taux_pct)::numeric, 1)                                        AS taux_concordance_pct,
    count(*) FILTER (WHERE taux_pct IS NOT NULL)::int                       AS nb_produits,
    count(*) FILTER (WHERE taux_pct IS NOT NULL AND taux_pct >= seuil)::int  AS nb_produits_conformes
FROM taux
GROUP BY GROUPING SETS ((site_id, programme_id, mois_paqd), (site_id, mois_paqd))
HAVING grouping(programme_id) = 1 OR programme_id IS NOT NULL;

CREATE UNIQUE INDEX mv_p5_uq ON mv_p5_concordance (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── P4 — écart SDU et écart consommation ─────────────────────────────────
CREATE MATERIALIZED VIEW mv_p4_ecart AS
WITH lignes_traceur AS (
    SELECT
        fi.site_id,
        fi.programme_id,
        fi.date_inventaire,
        to_char(fi.date_inventaire, 'YYYY-MM')        AS mois_paqd,
        p.produit_id,
        sum(fil.quantite_theorique)                   AS theorique,
        sum(fil.quantite_comptee)                     AS comptee
    FROM dqa.fact_inventaire fi
    JOIN dqa.dim_site s            ON s.site_id = fi.site_id AND s.dans_perimetre_dqa
    JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
    JOIN dqa.dim_produit p         ON p.produit_id = fil.produit_id
    JOIN dqa.dim_produit_traceur tr ON tr.produit_code = p.produit_code AND tr.actif
    WHERE fi.statut = 'fn'
    GROUP BY fi.site_id, fi.programme_id, fi.date_inventaire, p.produit_id
),
lignes_dim AS (
    SELECT site_id, programme_id AS prog, mois_paqd, date_inventaire, produit_id, theorique, comptee
    FROM lignes_traceur
    UNION ALL
    SELECT site_id, NULL, mois_paqd, date_inventaire, produit_id, theorique, comptee
    FROM lignes_traceur
),
tol_mois AS (
    SELECT
        m.mois_paqd,
        max(sc.tolerance) FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS tol_sdu,
        max(sc.seuil)     FILTER (WHERE sc.sous_composante = 'ecart_sdu')          AS seuil_sdu,
        max(sc.tolerance) FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS tol_conso,
        max(sc.seuil)     FILTER (WHERE sc.sous_composante = 'ecart_consommation') AS seuil_conso
    FROM (SELECT DISTINCT mois_paqd FROM lignes_traceur) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
     AND sc.sous_composante IN ('ecart_sdu', 'ecart_consommation')
    GROUP BY m.mois_paqd
),
sdu_produit AS (
    SELECT DISTINCT ON (site_id, prog, mois_paqd, produit_id)
        site_id, prog, mois_paqd, produit_id,
        coalesce(theorique, 0) AS theorique,
        coalesce(comptee, 0)   AS comptee
    FROM lignes_dim
    ORDER BY site_id, prog, mois_paqd, produit_id, date_inventaire DESC
),
sdu AS (
    SELECT
        sp.site_id, sp.prog, sp.mois_paqd,
        count(*)::int                                  AS nb_produits,
        count(*) FILTER (WHERE
            CASE
                WHEN sp.comptee = 0 AND sp.theorique = 0 THEN true
                WHEN sp.comptee = 0                      THEN false
                ELSE abs(sp.theorique - sp.comptee) / sp.comptee * 100 <= t.tol_sdu
            END
        )::int                                         AS nb_conformes
    FROM sdu_produit sp
    JOIN tol_mois t ON t.mois_paqd = sp.mois_paqd
    GROUP BY sp.site_id, sp.prog, sp.mois_paqd
),
bornes AS (
    SELECT site_id, prog, mois_paqd, produit_id,
        min(date_inventaire) AS d_debut,
        max(date_inventaire) AS d_fin
    FROM lignes_dim
    GROUP BY site_id, prog, mois_paqd, produit_id
    HAVING min(date_inventaire) <> max(date_inventaire)
),
stock_borne AS (
    SELECT b.*,
        (SELECT sum(ld.comptee) FROM lignes_dim ld
          WHERE ld.site_id = b.site_id AND ld.prog IS NOT DISTINCT FROM b.prog
            AND ld.mois_paqd = b.mois_paqd AND ld.produit_id = b.produit_id
            AND ld.date_inventaire = b.d_debut)          AS stock_debut,
        (SELECT sum(ld.comptee) FROM lignes_dim ld
          WHERE ld.site_id = b.site_id AND ld.prog IS NOT DISTINCT FROM b.prog
            AND ld.mois_paqd = b.mois_paqd AND ld.produit_id = b.produit_id
            AND ld.date_inventaire = b.d_fin)            AS stock_fin
    FROM bornes b
),
mouvements AS (
    SELECT
        ft.site_id,
        ft.programme_id                                  AS prog,
        l.produit_id,
        coalesce(ft.date_confirmation, ft.date_saisie)   AS jour,
        ft.nature,
        sum(l.quantite_unitaire)                         AS q
    FROM dqa.fact_transaction ft
    JOIN dqa.fact_ligne_transaction l ON l.transaction_id = ft.transaction_id
    JOIN dqa.dim_produit p            ON p.produit_id = l.produit_id
    JOIN dqa.dim_produit_traceur tr   ON tr.produit_code = p.produit_code AND tr.actif
    JOIN dqa.dim_site s               ON s.site_id = ft.site_id AND s.dans_perimetre_dqa
    WHERE ft.nature IN ('reception', 'dispensation')
      AND coalesce(ft.annulation, false) = false
      AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
    GROUP BY ft.site_id, ft.programme_id, l.produit_id,
             coalesce(ft.date_confirmation, ft.date_saisie), ft.nature
),
mouvements_dim AS (
    SELECT site_id, prog, produit_id, jour, nature, q FROM mouvements
    UNION ALL
    SELECT site_id, NULL, produit_id, jour, nature, q FROM mouvements
),
conso_produit AS (
    SELECT
        sb.site_id, sb.prog, sb.mois_paqd, sb.produit_id,
        coalesce(sb.stock_debut, 0)
          + coalesce((SELECT sum(m.q) FROM mouvements_dim m
                       WHERE m.site_id = sb.site_id AND m.prog IS NOT DISTINCT FROM sb.prog
                         AND m.produit_id = sb.produit_id AND m.nature = 'reception'
                         AND m.jour > sb.d_debut AND m.jour <= sb.d_fin), 0)
          - coalesce(sb.stock_fin, 0)                    AS reconstituee,
        coalesce((SELECT sum(m.q) FROM mouvements_dim m
                   WHERE m.site_id = sb.site_id AND m.prog IS NOT DISTINCT FROM sb.prog
                     AND m.produit_id = sb.produit_id AND m.nature = 'dispensation'
                     AND m.jour > sb.d_debut AND m.jour <= sb.d_fin), 0) AS declaree
    FROM stock_borne sb
),
conso AS (
    SELECT
        c.site_id, c.prog, c.mois_paqd,
        count(*) FILTER (WHERE c.reconstituee > 0)::int  AS nb_produits,
        (count(*) FILTER (WHERE c.reconstituee > 0
            AND abs(c.declaree - c.reconstituee) / c.reconstituee * 100 <= t.tol_conso))::int AS nb_conformes
    FROM conso_produit c
    JOIN tol_mois t ON t.mois_paqd = c.mois_paqd
    GROUP BY c.site_id, c.prog, c.mois_paqd
),
assemble AS (
    SELECT
        sdu.site_id, sdu.prog, sdu.mois_paqd,
        round(sdu.nb_conformes::numeric / nullif(sdu.nb_produits, 0) * 100, 1)     AS taux_sdu_pct,
        sdu.nb_produits                                                            AS nb_produits_sdu,
        sdu.nb_conformes                                                           AS nb_conformes_sdu,
        CASE WHEN coalesce(conso.nb_produits, 0) > 0
             THEN round(conso.nb_conformes::numeric / conso.nb_produits * 100, 1)
        END                                                                       AS taux_conso_pct,
        coalesce(conso.nb_produits, 0)                                             AS nb_produits_conso,
        coalesce(conso.nb_conformes, 0)                                            AS nb_conformes_conso,
        t.seuil_sdu, t.seuil_conso
    FROM sdu
    JOIN tol_mois t ON t.mois_paqd = sdu.mois_paqd
    LEFT JOIN conso
           ON conso.site_id = sdu.site_id
          AND conso.prog IS NOT DISTINCT FROM sdu.prog
          AND conso.mois_paqd = sdu.mois_paqd
)
SELECT
    site_id,
    prog                                              AS programme_id,
    mois_paqd,
    taux_sdu_pct,
    nb_produits_sdu,
    nb_conformes_sdu,
    taux_conso_pct,
    nb_produits_conso,
    nb_conformes_conso,
    CASE WHEN taux_sdu_pct   IS NULL THEN NULL WHEN taux_sdu_pct   >= seuil_sdu   THEN 100.0 ELSE 0.0 END AS score_sdu,
    CASE WHEN taux_conso_pct IS NULL THEN NULL WHEN taux_conso_pct >= seuil_conso THEN 100.0 ELSE 0.0 END AS score_conso,
    (
        SELECT round(avg(v.s), 1)::numeric(5, 1)
        FROM (VALUES
            (CASE WHEN taux_sdu_pct   IS NULL THEN NULL WHEN taux_sdu_pct   >= seuil_sdu   THEN 100.0 ELSE 0.0 END),
            (CASE WHEN taux_conso_pct IS NULL THEN NULL WHEN taux_conso_pct >= seuil_conso THEN 100.0 ELSE 0.0 END)
        ) AS v(s)
        WHERE v.s IS NOT NULL
    )                                                 AS p_ecart_sdu
FROM assemble;

CREATE UNIQUE INDEX mv_p4_uq
    ON mv_p4_ecart (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── mv_score_pilier — reconstruite à l'identique de 0025 ─────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_score_pilier CASCADE;
CREATE MATERIALIZED VIEW mv_score_pilier AS
WITH sites_mois AS (
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p1_completude
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p2_promptitude
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p3_regularite
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p4_ecart
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p5_concordance
    UNION
    SELECT DISTINCT site_id, mois_paqd, programme_id FROM mv_p6_ajustements
),
seuils AS (
    SELECT sc.sous_composante, sc.seuil, sc.sens, m.mois_paqd
    FROM (SELECT DISTINCT mois_paqd FROM sites_mois) m
    JOIN dqa.grille_seuil_sous_composante sc
      ON sc.grille_id = dqa.grille_pour_mois(m.mois_paqd)
),
base AS (
    SELECT
        sm.site_id,
        sm.mois_paqd,
        sm.programme_id,
        dqa.grille_pour_mois(sm.mois_paqd)                            AS grille_id,
        p1.p_completude                                              AS p_completude,
        p2.p_promptitude                                             AS p_promptitude,
        CASE
            WHEN p3.taux_regularite_pct IS NULL THEN NULL
            WHEN p3.taux_regularite_pct >= sc3.seuil THEN 100.0
            ELSE 0.0
        END                                                          AS p_regularite,
        p4.p_ecart_sdu                                                AS p_ecart_sdu,
        CASE
            WHEN p5.taux_concordance_pct IS NULL THEN NULL
            WHEN p5.taux_concordance_pct >= sc5.seuil THEN 100.0
            ELSE 0.0
        END                                                          AS p_concordance,
        CASE
            WHEN p6.ratio_ajustements_pct IS NULL THEN NULL
            WHEN p6.ratio_ajustements_pct <= sc6.seuil THEN 100.0
            ELSE 0.0
        END                                                          AS p_ajustements,
        p1.completude_inventaires_pct                                AS sc_completude_inventaires,
        p1.completude_requisitions_pct                               AS sc_completude_requisitions,
        p1.completude_receptions_pct                                 AS sc_completude_receptions,
        p2.promptitude_inventaires_pct                               AS sc_promptitude_inventaires,
        p2.promptitude_requisitions_pct                              AS sc_promptitude_requisitions,
        p3.taux_regularite_pct                                       AS sc_regularite_saisie,
        p4.taux_sdu_pct                                              AS sc_ecart_sdu,
        p4.taux_conso_pct                                            AS sc_ecart_consommation,
        p5.taux_concordance_pct                                      AS sc_concordance,
        p6.ratio_ajustements_pct                                     AS sc_ratio_ajustements
    FROM sites_mois sm
    LEFT JOIN mv_p1_completude p1
           ON p1.site_id = sm.site_id AND p1.mois_paqd = sm.mois_paqd
          AND coalesce(p1.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p2_promptitude p2
           ON p2.site_id = sm.site_id AND p2.mois_paqd = sm.mois_paqd
          AND coalesce(p2.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p3_regularite p3
           ON p3.site_id = sm.site_id AND p3.mois_paqd = sm.mois_paqd
          AND coalesce(p3.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p4_ecart p4
           ON p4.site_id = sm.site_id AND p4.mois_paqd = sm.mois_paqd
          AND coalesce(p4.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p5_concordance p5
           ON p5.site_id = sm.site_id AND p5.mois_paqd = sm.mois_paqd
          AND coalesce(p5.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN mv_p6_ajustements p6
           ON p6.site_id = sm.site_id AND p6.mois_paqd = sm.mois_paqd
          AND coalesce(p6.programme_id, '') = coalesce(sm.programme_id, '')
    LEFT JOIN seuils sc3 ON sc3.sous_composante = 'regularite_saisie' AND sc3.mois_paqd = sm.mois_paqd
    LEFT JOIN seuils sc5 ON sc5.sous_composante = 'concordance'       AND sc5.mois_paqd = sm.mois_paqd
    LEFT JOIN seuils sc6 ON sc6.sous_composante = 'ratio_ajustements' AND sc6.mois_paqd = sm.mois_paqd
),
composite AS (
    SELECT
        b.site_id, b.mois_paqd, b.programme_id,
        round(
            sum(pil.score * gp.poids_pct) / nullif(sum(gp.poids_pct), 0),
            1
        )::numeric(5, 1)                                              AS score_composite
    FROM base b
    CROSS JOIN LATERAL (VALUES
        ('P1', b.p_completude),  ('P2', b.p_promptitude), ('P3', b.p_regularite),
        ('P4', b.p_ecart_sdu),   ('P5', b.p_concordance), ('P6', b.p_ajustements)
    ) AS pil(pilier, score)
    JOIN dqa.grille_poids_pilier gp
      ON gp.grille_id = b.grille_id AND gp.pilier = pil.pilier
    WHERE pil.score IS NOT NULL
    GROUP BY b.site_id, b.mois_paqd, b.programme_id
)
SELECT
    b.site_id,
    b.mois_paqd,
    b.programme_id,
    b.grille_id,
    b.p_completude,
    b.p_promptitude,
    b.p_regularite,
    b.p_ecart_sdu,
    b.p_concordance,
    b.p_ajustements,
    b.sc_completude_inventaires,
    b.sc_completude_requisitions,
    b.sc_completude_receptions,
    b.sc_promptitude_inventaires,
    b.sc_promptitude_requisitions,
    b.sc_regularite_saisie,
    b.sc_ecart_sdu,
    b.sc_ecart_consommation,
    b.sc_concordance,
    b.sc_ratio_ajustements,
    c.score_composite,
    dqa.classer_composite(c.score_composite)                         AS classification
FROM base b
LEFT JOIN composite c
       ON c.site_id = b.site_id AND c.mois_paqd = b.mois_paqd
      AND coalesce(c.programme_id, '') = coalesce(b.programme_id, '');

CREATE UNIQUE INDEX mv_score_pilier_uq
    ON mv_score_pilier (site_id, mois_paqd, coalesce(programme_id, ''));

-- ── Rafraîchissement dans l'ordre des dépendances ────────────────────────
REFRESH MATERIALIZED VIEW dqa.mv_p1_completude;
REFRESH MATERIALIZED VIEW dqa.mv_p2_promptitude;
REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart;
REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance;
REFRESH MATERIALIZED VIEW dqa.mv_score_pilier;
