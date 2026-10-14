-- ============================================================================
--  Extraction mSupply -> classeur DQA
--  Une requête par onglet du gabarit Canevas_Extraction_mSupply_DQA_v2.xlsx
--
--  Destinataire  : DAP / Nouvelle PSP-CI (chargé de l'extraction)
--  Contrat       : docs/specification_extraction_dap.md (v2.0, 2026-08-28)
--  Base cible    : mSupply (PostgreSQL). Script 100% lecture seule --
--                  aucune ligne n'est créée, modifiée ni supprimée.
--
--  État de validation
--  -------------------------------------------------------------------------
--  Colonnes vérifiées contre le schéma de référence mSupply. Jointure
--  district -> région vérifiée par la DAP sur la base réelle le 2026-10-12
--  (202/202 districts résolus). Chaîne complète (ce script, puis
--  csv_vers_canevas.py, puis la validation et l'import du tableau de bord)
--  testée de bout en bout le 2026-10-12 sur une base mSupply simulée
--  reprenant le schéma réel et des cas pièges (sites désactivés, ajustements,
--  commentaires avec « = » ou caractères de contrôle, réquisitions tardives).
--  Audit du 2026-10-13 (apports de la DAP conservés) : paramètres contrôlés
--  avant extraction, une ligne par clé dans chaque jeu (STOCK_ACTUEL,
--  SITE_PROGRAMME), quantités en unités sans conversion (dispensation à
--  l'unité), stock daté du jour d'exécution,
--  réquisition du site servi rattachée aux distributions des districts,
--  heure et numéro des inventaires, sous-requêtes corrélées remplacées par
--  des jointures (testé sur 30 000 transactions sans index).
--
--  Mode d'emploi
--  -------------
--  1. Renseigner les paramètres de la section 0 (dates de la fenêtre et du
--     mois PAQD, cycle, version mSupply, rédacteur).
--  2. Remplacer le contenu de tmp_perimetre_dqa et tmp_traceurs par les
--     listes réelles fournies par la mission DQA (annexe A de la
--     spécification), révisées à chaque cycle.
--  3. Lancer `./lancer_extraction.sh` (méthode recommandée) : il exécute ce
--     script, assemble les CSV dans le gabarit (csv_vers_canevas.py) puis
--     VÉRIFIE le classeur produit. Envoyer ce fichier tel quel, sans l'ouvrir
--     ni le réenregistrer dans Excel. S'il a été ouvert entre-temps :
--     `python csv_vers_canevas.py --verifier <classeur.xlsx>` avant l'envoi.
--  4. À défaut (pas de bash ni de Python), exporter chaque table à la main
--     -- méthodes A et B ci-dessous, en secours seulement.
--
--  Saisie manuelle (secours) -- de la table temporaire à l'onglet Excel
--  -------------------------------------------------------------------------
--  La ligne 5 de chaque onglet (les en-têtes de colonnes) ne bouge jamais, les
--  données s'écrivent à partir de la ligne 6, en écrasant la ligne d'exemple.
--  RÈGLE IMPÉRATIVE : une fois les données collées, ne JAMAIS supprimer la
--  ligne 6 -- elle contient alors la première vraie donnée. Effacer seulement
--  sa mise en forme (Accueil -> Effacer -> Effacer les formats), sinon elle
--  garde le gris italique de l'exemple et finit supprimée par erreur (lot du
--  2026-10-12 : une ligne réelle perdue sur 8 onglets, classeur rejeté).
--
--  MÉTHODE A -- CSV + import Excel (celle qui évite le bug des dates) :
--    a. Exécuter le script en entier : la section « Export » produit un
--       fichier `<jeu>.csv` par onglet (ex. `sites.csv`, `transactions.csv`)
--       dans le dossier courant de la session psql, encodés UTF-8.
--    b. Dans Excel, sur l'onglet cible du gabarit : ruban Données ->
--       « À partir d'un fichier texte/CSV » (PAS un simple double-clic sur
--       le CSV, qui laisse Excel deviner les types tout seul -- c'est
--       justement ce qui transforme une date en numéro de série).
--    c. Dans l'aperçu d'import, régler l'origine du fichier sur UTF-8 (sinon
--       les caractères accentués se corrompent), puis, étape importante,
--       ouvrir « Transformer les données » (Power Query) et forcer le TYPE
--       de chaque colonne qui contient une date sur « Texte » explicitement
--       -- jamais « Date » ni « Détection automatique ». C'est ce réglage,
--       pas le format de cellule Excel après coup, qui empêche la
--       réinterprétation.
--    d. Charger le résultat, copier les lignes de données (sans l'en-tête,
--       que Power Query réimporte) et les coller en ligne 6 de l'onglet du
--       gabarit, par « Collage spécial -> Valeurs ».
--    e. Vérifier un échantillon : une cellule de date doit afficher
--       `2026-08-29`, jamais `46262` -- c'est le contrôle le plus rapide
--       pour détecter une réinterprétation avant l'envoi.
--
--  MÉTHODE B -- copier-coller direct depuis un client SQL graphique
--  (pgAdmin, DBeaver...), plus rapide mais plus fragile :
--    a. Exécuter `SELECT * FROM tmp_<jeu>;` et copier le résultat (sans
--       l'en-tête de colonnes, déjà présent en ligne 5 du gabarit).
--    b. AVANT de coller : sélectionner dans le gabarit les colonnes de date
--       de l'onglet cible et les mettre au format de cellule « Texte »
--       (clic droit -> Format de cellule -> Texte). Coller seulement après
--       ce réglage -- si on colle avant, Excel a déjà fait son
--       interprétation et le format appliqué après ne la défait pas.
--    c. Coller par « Collage spécial -> Valeurs », jamais un collage
--       simple (qui peut importer une mise en forme ou une formule
--       involontaire depuis le client SQL).
--    d. Même vérification qu'en méthode A : relire un échantillon de dates
--       collées.
--
--  Cas particulier -- METADATA : c'est un onglet clé/valeur (deux colonnes,
--  une ligne par champ), pas un grand tableau comme les 9 autres. Si le
--  gabarit liste déjà les noms de champs en colonne A (date_extraction,
--  cycle_paqd, ...), ne coller QUE la colonne « valeur » de tmp_metadata,
--  dans l'ordre, en face du bon champ -- ne pas écraser la colonne des
--  noms de champs avec le résultat de la requête.
--
--  Checklist avant envoi, quel que soit l'onglet :
--    - ligne 5 (en-têtes) inchangée, aucune colonne renommée ni déplacée ;
--    - aucune ligne vide intercalée entre la ligne 6 et la dernière ligne
--      de données (l'application compte les lignes consécutives) ;
--    - un échantillon de dates affiche bien AAAA-MM-JJ, pas un nombre ;
--    - les 9 compteurs `nb_lignes_*` de METADATA correspondent au nombre
--      de lignes réellement collées dans chaque onglet : le contrôler avec
--      `python csv_vers_canevas.py --verifier <classeur.xlsx>`, qui applique
--      la même règle de comptage que le tableau de bord.
--
--  IMPORTANT -- dates
--  -------------------------------------------------------------------------
--  Chaque colonne date est produite en TEXTE au format AAAA-MM-JJ avec
--  to_char(...), jamais en type `date` natif. C'est volontaire : un export
--  CSV ou un copier-coller qui laisse Excel réinterpréter une colonne comme
--  une date la transforme en numéro de série (ex. `46262` au lieu de
--  `2026-08-29`) -- c'est exactement le défaut constaté sur le dernier
--  classeur déposé (55 339 avertissements DATE_MAL_FORMEE sur un seul
--  envoi). À l'import dans Excel, choisir le format de colonne « Texte »
--  pour les colonnes de date, ou passer par un import CSV brut plutôt
--  qu'un copier-coller direct depuis un client SQL.
-- ============================================================================


-- ══ 0. Paramètres de l'extraction ═══════════════════════════════════════════
-- Arrêt à la première erreur, même si le script est lancé à la main sans
-- l'option -v ON_ERROR_STOP=1 du lanceur : un classeur partiel ne doit
-- jamais être produit.
\set ON_ERROR_STOP on
-- Ce fichier est écrit en UTF-8. Sous Windows, psql.exe le lirait sinon dans
-- l'encodage de la console (WIN1252, CP850) : les littéraux accentués
-- (`'HÔPITAL'`, `H[OÔ]PITAL G[EÉ]N[EÉ]RAL`) ne correspondraient plus et un
-- site « Hôpital » perdrait son type de structure. Les fichiers CSV restent
-- en UTF-8 (option ENCODING des \copy).
\encoding UTF8

-- À adapter à chaque envoi hebdomadaire. Syntaxe psql (`\set nom valeur`) ;
-- si vous n'utilisez pas psql, remplacez chaque `:'nom'` du script par la
-- valeur littérale entre guillemets simples (ex. `:'fenetre_debut'::date`
-- devient `'2026-08-29'::date`).
--
-- Une valeur avec des espaces (ex. un nom complet) doit être entre guillemets
-- simples dans le `\set` lui-même, sinon psql ne garde que le premier mot :
-- `\set x 'Jean Dupont'` fonctionne, `\set x Jean Dupont` donnerait
-- « JeanDupont ».

-- ATTENTION : jamais de commentaire `--` sur la même ligne qu'un `\set` --
-- psql ne les ignore pas sur une méta-commande, ils seraient collés à la
-- valeur (et une apostrophe dans le commentaire casse la ligne).
--
-- fenetre_debut   : 45 jours avant la date d'extraction (spec §1)
-- fenetre_fin     : date d'extraction (aujourd'hui)
-- mois_debut/fin  : 1er et dernier jour du mois PAQD en cours
-- cycle_paqd      : AAAA-CN
-- mois_paqd       : M+1 à M+4 dans le cycle
-- version_msupply : visible dans mSupply : Aide > À propos
-- observations    : toute anomalie constatée pendant l'extraction (facultatif)
\set fenetre_debut     2026-08-29
\set fenetre_fin       2026-10-12
\set mois_debut        2026-10-01
\set mois_fin          2026-10-31
\set cycle_paqd        2026-C3
\set mois_paqd         M+2
\set version_msupply   9.3.5
\set realisee_par      'Prénom NOM, DAP'
\set observations      RAS


-- ══ Contrôle des paramètres ═══════════════════════════════════════════════
-- Mêmes règles que la validation au dépôt (BORNES_MOIS_INCOHERENTES,
-- MOIS_PAQD_FUTUR, MOIS_PAQD_TROP_ANCIEN...) : une erreur de saisie arrête
-- l'extraction ici, avec un message clair, au lieu d'un rejet du classeur.
-- Les avertissements (WARNING) n'arrêtent rien.
CREATE OR REPLACE FUNCTION pg_temp.echec(message text) RETURNS void
LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'PARAMETRE INCORRECT : %', message; END $f$;
CREATE OR REPLACE FUNCTION pg_temp.avertir(message text) RETURNS void
LANGUAGE plpgsql AS $f$ BEGIN RAISE WARNING '%', message; END $f$;

DROP TABLE IF EXISTS tmp_parametres;
CREATE TEMP TABLE tmp_parametres AS
SELECT
    :'fenetre_debut'::date AS fenetre_debut,
    :'fenetre_fin'::date   AS fenetre_fin,
    :'mois_debut'::date    AS mois_debut,
    :'mois_fin'::date      AS mois_fin,
    :'cycle_paqd'::text    AS cycle_paqd,
    :'mois_paqd'::text     AS mois_paqd;

SELECT pg_temp.echec('cycle_paqd « ' || cycle_paqd || ' » : attendu AAAA-C1, AAAA-C2 ou AAAA-C3')
FROM tmp_parametres WHERE cycle_paqd !~ '^\d{4}-C[1-3]$';
SELECT pg_temp.echec('mois_paqd « ' || mois_paqd || ' » : attendu M+1, M+2, M+3 ou M+4')
FROM tmp_parametres WHERE mois_paqd !~ '^M\+[1-4]$';

-- Mois mesuré déduit du cycle et du rang (C1 = janvier-avril, C2 = mai-août,
-- C3 = septembre-décembre) : mois_debut / mois_fin doivent y correspondre.
DROP TABLE IF EXISTS tmp_mois_attendu;
CREATE TEMP TABLE tmp_mois_attendu AS
SELECT make_date(left(cycle_paqd, 4)::int,
                 (right(cycle_paqd, 1)::int - 1) * 4 + right(mois_paqd, 1)::int, 1) AS debut
FROM tmp_parametres;

SELECT pg_temp.echec('mois_debut ' || p.mois_debut || ' incohérent avec ' || p.cycle_paqd || ' ' || p.mois_paqd
                     || ' (attendu ' || m.debut || ')')
FROM tmp_parametres p, tmp_mois_attendu m WHERE p.mois_debut <> m.debut;
SELECT pg_temp.echec('mois_fin ' || p.mois_fin || ' incohérent avec ' || p.cycle_paqd || ' ' || p.mois_paqd
                     || ' (attendu ' || (m.debut + interval '1 month - 1 day')::date || ')')
FROM tmp_parametres p, tmp_mois_attendu m WHERE p.mois_fin <> (m.debut + interval '1 month - 1 day')::date;
SELECT pg_temp.echec('le mois mesuré ' || to_char(m.debut, 'YYYY-MM') || ' est postérieur au mois en cours')
FROM tmp_mois_attendu m WHERE m.debut > date_trunc('month', current_date);
SELECT pg_temp.echec('le mois mesuré ' || to_char(m.debut, 'YYYY-MM') || ' est antérieur au mois précédent : '
                     || 'le classeur serait rejeté (MOIS_PAQD_TROP_ANCIEN)')
FROM tmp_mois_attendu m WHERE m.debut < date_trunc('month', current_date) - interval '1 month';

SELECT pg_temp.echec('fenetre_debut ' || fenetre_debut || ' postérieure à fenetre_fin ' || fenetre_fin)
FROM tmp_parametres WHERE fenetre_debut > fenetre_fin;
SELECT pg_temp.echec('fenetre_fin ' || fenetre_fin || ' est dans le futur')
FROM tmp_parametres WHERE fenetre_fin > current_date;
SELECT pg_temp.avertir('fenetre_fin ' || fenetre_fin || ' n''est pas la date du jour (' || current_date
                       || ') : les mouvements postérieurs ne seront pas extraits')
FROM tmp_parametres WHERE fenetre_fin < current_date;
SELECT pg_temp.avertir('fenêtre de ' || (fenetre_fin - fenetre_debut) || ' jours au lieu de 45 (spec §1)')
FROM tmp_parametres WHERE fenetre_fin - fenetre_debut <> 45;


-- ══ Listes fournies par la mission DQA (annexe A de la spécification) ═══════
-- tmp_perimetre_dqa : les `site_id` (= store.id) des 40 sites suivis. Sert à
-- restreindre TOUS les jeux sauf SITES (qui doit rester complet -- voir
-- section 1). tmp_traceurs : les `produit_code` (= item.code) de la liste
-- des produits traceurs, qui restreint PRODUITS, LIGNES_TRANSACTIONS,
-- STOCK_ACTUEL et INVENTAIRE_LIGNES. Cette liste FAIT FOI : tout produit
-- qu'elle contient est traceur d'office dans le tableau de bord, qui reprend
-- l'onglet PRODUITS à chaque import (ADR 0015).
--
-- Les deux listes vivent dans `listes_mission.sql`, à côté de ce script. Il
-- contient des identifiants réels de sites : il n'est PAS versionné (même
-- principe qu'un fichier .env). Modèle versionné : `listes_mission.exemple.sql`.
-- `\ir` le charge depuis le dossier de ce script, quel que soit le dossier
-- courant de psql (le lanceur exécute psql depuis csv_extraction/).

\ir listes_mission.sql


-- ══ 1. SITES ═════════════════════════════════════════════════════════════
-- Grain : un site (`store`). « Tous les magasins actifs » (spec §4.2) --
-- c'est la SEULE table des 9 qui n'est PAS restreinte au périmètre DQA : il
-- faut voir la hiérarchie district/région même des sites hors périmètre
-- (un site DQA peut être rattaché à un district qui, lui, n'est pas dans la
-- liste des 40), et `dans_perimetre_dqa` est justement la colonne qui
-- marque lesquels sont suivis.
--
-- district : le magasin porte un enregistrement `name` (store.name_id).
-- `name.category1_id` pointe directement sur le district (`name_category1`).
--
-- région : `name_category1.parent_id` pointe directement sur
-- `name_category1_level2`, dont la description est la région (vérifié sur
-- la base le 2026-10-12 : 202/202 districts résolus ; `level2.parent_id`
-- remonte ensuite au pays dans `name_category1_level1`, inutile ici).
--
-- type_structure : le PALIER (spec §5.3), ramené au libellé exact attendu
-- par le gabarit : ESPC, HG, CHR, CHU ou District sanitaire.
--   1. name_category3 fait foi quand il est clair : ESPC, CHU, District
--      Sanitaire (-> « District sanitaire »).
--   2. « Hopital » est trop large : départagé en CHR / HG d'après le nom du
--      site (« CHR PUBLIC de ... », « HG PUBLIC de ... ») ; HG par défaut.
--   3. Palier vide ou « NPSP » (agences, dépôts, mais aussi des CSU/CAT mal
--      catégorisés dans mSupply) : déduit du nom du site si celui-ci commence
--      par un sous-type reconnu, sinon laissé vide (dépôts NPSP, magasins
--      système...). Ces sites sont à corriger dans mSupply à la source.
--
-- jour_limite_requisition : déduit du palier normalisé (consigne du
-- gabarit) -- 5 pour les ESPC, 7 pour HG/CHR, 10 pour CHU et districts.
DROP TABLE IF EXISTS tmp_sites;
CREATE TEMP TABLE tmp_sites AS
WITH base AS (
    SELECT
        s.id                                                      AS site_id,
        s.code                                                     AS site_code,
        s.name                                                      AS site_nom,
        c1.description                                               AS district,
        c1l2.description                                              AS region,
        CASE
            WHEN upper(trim(c3.description)) = 'ESPC'               THEN 'ESPC'
            WHEN upper(trim(c3.description)) = 'CHU'                THEN 'CHU'
            WHEN upper(trim(c3.description)) = 'DISTRICT SANITAIRE' THEN 'District sanitaire'
            WHEN upper(trim(c3.description)) IN ('HOPITAL', 'HÔPITAL')
                THEN CASE WHEN upper(s.name) ~ '\mCHR\M' THEN 'CHR' ELSE 'HG' END
            -- palier vide ou NPSP : repli sur le début du nom du site
            WHEN upper(s.name) ~ '^(CSU|CSR|CSUS|CSA|FSU|CAT|DR|INFIRMERIE)\M' THEN 'ESPC'
            WHEN upper(s.name) ~ '^CHR\M'                           THEN 'CHR'
            WHEN upper(s.name) ~ '^(HG|HGS|H[OÔ]PITAL G[EÉ]N[EÉ]RAL)\M' THEN 'HG'
            WHEN upper(s.name) ~ '^CHU\M'                           THEN 'CHU'
            WHEN upper(s.name) ~ '^(DISTRICT SANITAIRE|DDS)\M'      THEN 'District sanitaire'
        END                                                            AS type_structure,
        CASE WHEN s.disabled THEN 'NON' ELSE 'OUI' END                 AS actif,
        CASE WHEN p.site_id IS NOT NULL THEN 'OUI' ELSE 'NON' END       AS dans_perimetre_dqa
    FROM store s
    LEFT JOIN name n                     ON n.id = s.name_id
    LEFT JOIN name_category1 c1          ON c1.id = n.category1_id
    LEFT JOIN name_category1_level2 c1l2 ON c1l2.id = c1.parent_id        -- district -> région
    LEFT JOIN name_category3 c3          ON c3.id = n.category3_id
    LEFT JOIN tmp_perimetre_dqa p        ON p.site_id = s.id
    -- « tous les magasins ACTIFS » (spec §4.2), PLUS les sites du périmètre
    -- même désactivés : leurs transactions, inventaires et réquisitions sont
    -- extraits (filtre sur le périmètre seul), le site doit donc exister dans
    -- SITES, sinon chaque ligne lève une REFERENCE_CROISEE au dépôt. La
    -- colonne `actif` dit alors NON.
    WHERE s.disabled = false OR p.site_id IS NOT NULL
)
SELECT
    base.*,
    CASE type_structure
        WHEN 'ESPC'               THEN '5'
        WHEN 'HG'                 THEN '7'
        WHEN 'CHR'                THEN '7'
        WHEN 'CHU'                THEN '10'
        WHEN 'District sanitaire' THEN '10'
    END                                                                AS jour_limite_requisition
FROM base;


-- ══ 2. SITE_PROGRAMME ════════════════════════════════════════════════════
-- Grain : (site, programme). Pilote directement P1 côté tableau de bord :
-- le nombre d'inventaires et de réquisitions ATTENDUS pour un site = son
-- nombre de programmes gérés. Restreint au périmètre DQA : ce jeu n'a de
-- sens que pour les sites suivis.
--
-- La spec source `site_id` depuis `list_master_name_join.name_id`, qui est
-- un identifiant de la table `name` -- PAS un `store.id`. Pour rester
-- cohérent avec les 9 autres jeux (où `site_id` = `store.id` partout, ce
-- qui permet au tableau de bord de faire ses contrôles de référence
-- croisée), on retrouve ici le magasin dont le `name_id` correspond plutôt
-- que d'exporter le `name_id` brut.
--
-- DISTINCT ON : `list_master_name_join` peut rattacher deux fois la même
-- liste au même nom ; un doublon (site, programme) ferait rejeter le lot à
-- la promotion. En cas de doublon, la ligne active l'emporte.
DROP TABLE IF EXISTS tmp_site_programme;
CREATE TEMP TABLE tmp_site_programme AS
SELECT DISTINCT ON (s.id, lm.id)
    s.id                                                 AS site_id,
    lm.id                                                 AS programme_id,
    lm.code                                                AS programme_code,
    lm.description                                          AS programme_nom,
    CASE WHEN lm.inactive THEN 'NON' ELSE 'OUI' END          AS actif
FROM list_master_name_join lmnj
JOIN list_master lm      ON lm.id = lmnj.list_master_id AND lm.isprogram = true
JOIN store s              ON s.name_id = lmnj.name_id
JOIN tmp_perimetre_dqa p  ON p.site_id = s.id
ORDER BY s.id, lm.id, lm.inactive;


-- ══ 3. PRODUITS ══════════════════════════════════════════════════════════
-- Grain : un produit. UNIQUEMENT les produits traceurs listés dans
-- tmp_traceurs (en tête de ce script). Le tableau de bord tient pour traceur
-- tout produit de cet onglet : sa liste /admin/traceurs est mise à jour à
-- chaque import à partir d'ici (ADR 0015). Ajouter ou retirer un traceur,
-- c'est donc modifier tmp_traceurs, rien d'autre.
--
-- programmes : les codes des listes maîtresses « programme »
-- (list_master.isprogram = true) qui contiennent ce produit, via
-- list_master_line -- dont la colonne vers list_master s'appelle, par une
-- convention mSupply un peu trompeuse, `item_master_id` (pas
-- `list_master_id`). Agrégés avec un point-virgule, comme demandé par la
-- spec.
DROP TABLE IF EXISTS tmp_produits;
CREATE TEMP TABLE tmp_produits AS
SELECT
    i.id                                                         AS produit_id,
    i.code                                                        AS produit_code,
    i.item_name                                                    AS produit_nom,
    u.units                                                         AS unite,
    (
        SELECT string_agg(DISTINCT lm.code, ';' ORDER BY lm.code)
        FROM list_master_line lml
        JOIN list_master lm ON lm.id = lml.item_master_id AND lm.isprogram = true
        WHERE lml.item_id = i.id
    )                                                                AS programmes
FROM item i
JOIN tmp_traceurs tr ON tr.produit_code = i.code
LEFT JOIN unit u ON u.id = i.unit_id;


-- ══ 4. TRANSACTIONS ══════════════════════════════════════════════════════
-- Grain : une transaction. Fenêtre : `finalised_date` OU `confirm_date`
-- dans les 45 jours (spec §4.5). Exclut les brouillons (`status = 'nw'`,
-- spec §5.2) ; inclut les annulations, marquées comme telles plutôt
-- qu'exclues. Restreint au périmètre DQA.
--
-- `nature` est DÉRIVÉE, jamais recopiée depuis un champ mSupply (spec
-- §5.1) : `transact.type` est un champ texte libre côté source, sans
-- énumération garantie (côté application : les anciens
-- codes `im+`/`im-` qu'on trouve dans de vieilles docs ne sont PAS
-- fiables). La dérivation évalue, dans cet ordre, la première règle qui
-- s'applique :
--   1. ajustement_positif / ajustement_negatif -- la transaction est l'une
--      des deux factures qu'un inventaire (`stock_take`) génère à sa
--      finalisation (`invad_additions_id` = positif, `invad_reductions_id`
--      = négatif) ; à défaut, repli sur les lignes (voir `adj_lignes`
--      ci-dessous).
--   2. dispensation        -- type 'ci' + mode 'dispensary'
--   3. distribution         -- type 'ci' + mode 'store'
--   4. facture_fournisseur  -- type 'si'
--   5. reception            -- type 'rc'
--   6. retour_fournisseur   -- type 'sc'
--   7. retour_client        -- type 'cc'
--   8. autre                -- tout le reste
DROP TABLE IF EXISTS tmp_transactions;
CREATE TEMP TABLE tmp_transactions AS
WITH fenetre AS (
    -- Filtre d'abord sur la fenêtre, le périmètre et le statut : tout le
    -- reste de la requête ne retraite que ce sous-ensemble, pas la table
    -- `transact` entière (potentiellement volumineuse sur plusieurs
    -- années d'historique).
    SELECT t.*
    FROM transact t
    JOIN tmp_perimetre_dqa p ON p.site_id = t.store_id
    WHERE t.status <> 'nw'
      AND (
            t.finalised_date BETWEEN :'fenetre_debut'::date AND :'fenetre_fin'::date
         OR t.confirm_date   BETWEEN :'fenetre_debut'::date AND :'fenetre_fin'::date
          )
),
adj_direct AS (
    -- Chemin fiable : la transaction EST directement référencée par
    -- l'inventaire qui l'a générée. Restreint aux transactions de la fenêtre
    -- et dédoublonné, puis joint : une jointure par transaction au lieu d'un
    -- parcours complet de stock_take pour chacune.
    SELECT DISTINCT ON (a.transaction_id) a.transaction_id, a.signe
    FROM (
        SELECT st.invad_additions_id AS transaction_id, 'positif' AS signe
        FROM stock_take st WHERE st.invad_additions_id IN (SELECT id FROM fenetre)
        UNION ALL
        SELECT st.invad_reductions_id, 'negatif'
        FROM stock_take st WHERE st.invad_reductions_id IN (SELECT id FROM fenetre)
    ) a
    ORDER BY a.transaction_id, a.signe
),
adj_lignes AS (
    -- Repli : aucun inventaire ne référence directement la transaction,
    -- mais TOUTES ses lignes sont marquées comme issues d'un ajustement
    -- (`is_from_inventory_adjustment`). Signe déduit du mouvement net des
    -- lignes. Cas qui devrait rester rare -- recouvre la question posée en
    -- annexe B §3 de la spécification (« ajustements hors INVAD ») : si ce
    -- repli se déclenche souvent, le signaler à la DAP plutôt que de s'y
    -- fier silencieusement.
    SELECT
        tl.transaction_id,
        CASE WHEN sum(CASE WHEN tl.type = 'stock_in' THEN tl.quantity ELSE -tl.quantity END) >= 0
             THEN 'positif' ELSE 'negatif' END AS signe
    FROM trans_line tl
    WHERE tl.transaction_id IN (SELECT id FROM fenetre)
    GROUP BY tl.transaction_id
    HAVING bool_and(tl.is_from_inventory_adjustment)
)
SELECT
    f.id                                                          AS transaction_id,
    f.store_id                                                     AS site_id,
    COALESCE(
        'ajustement_' || ad.signe,
        'ajustement_' || al.signe,
        CASE
            WHEN f.type = 'ci' AND f.mode = 'dispensary' THEN 'dispensation'
            WHEN f.type = 'ci' AND f.mode = 'store'      THEN 'distribution'
            WHEN f.type = 'si' THEN 'facture_fournisseur'
            WHEN f.type = 'rc' THEN 'reception'
            WHEN f.type = 'sc' THEN 'retour_fournisseur'
            WHEN f.type = 'cc' THEN 'retour_client'
            ELSE 'autre'
        END
    )                                                               AS nature,
    f.programid                                                     AS programme_id,
    f.type                                                          AS type_transaction,
    f.mode                                                          AS mode,
    f.status                                                        AS statut,
    CASE WHEN f.is_cancellation THEN 'OUI' ELSE 'NON' END           AS annulation,
    to_char(f.entry_date, 'YYYY-MM-DD')                             AS date_saisie,
    to_char(f.confirm_date, 'YYYY-MM-DD')                           AS date_confirmation,
    to_char(f.ship_date, 'YYYY-MM-DD')                              AS date_livraison,
    -- Réquisition servie : un district répond à la réquisition d'un site de
    -- sa zone par SA propre réquisition (réponse), liée à celle du site par
    -- `linked_requisition_id`. Le tableau de bord rapproche la distribution
    -- de la réquisition du SITE (P3 des districts) : on remonte donc ce lien
    -- quand la réquisition citée est une RÉPONSE du magasin qui distribue et
    -- pointe vers celle d'un autre magasin. Une demande porte aussi un lien
    -- (vers la réponse) : sans le filtre sur le type, la réception d'un site
    -- serait détournée vers la réponse du district. Sans lien, l'identifiant
    -- d'origine reste. Valeurs de `requisition.type` vérifiées sur la base de
    -- la DAP le 2026-10-13 : request 254 260, response 250 131 (dont 221 381
    -- liées), sh 42, im 32, vide 23, EPIWastageResponse 1.
    COALESCE(rq_site.id, f.requisition_id)                          AS requisition_id,
    f.goods_received_id                                             AS goods_received_id,
    f.comment                                                       AS commentaire
FROM fenetre f
LEFT JOIN adj_direct ad  ON ad.transaction_id = f.id
LEFT JOIN adj_lignes al  ON al.transaction_id = f.id
LEFT JOIN requisition rq_rep  ON rq_rep.id = f.requisition_id AND rq_rep.store_id = f.store_id
                             AND rq_rep.type ~* 'response$'
LEFT JOIN requisition rq_site ON rq_site.id = rq_rep.linked_requisition_id
                             AND rq_site.store_id <> f.store_id;


-- ══ 5. LIGNES_TRANSACTIONS ═══════════════════════════════════════════════
-- Grain : (transaction, produit, lot). Restreint aux produits TRACEURS et
-- aux transactions déjà retenues dans tmp_transactions (donc déjà
-- filtrées sur la fenêtre, le statut et le périmètre -- pas besoin de
-- refiltrer ici).
DROP TABLE IF EXISTS tmp_lignes_transactions;
CREATE TEMP TABLE tmp_lignes_transactions AS
SELECT
    tl.id                                                         AS ligne_id,
    tl.transaction_id                                              AS transaction_id,
    tl.item_id                                                      AS produit_id,
    tl.program_id                                                    AS programme_id,
    tl.batch                                                          AS lot,
    tl.quantity                                                        AS quantite,
    -- À titre d'information seulement : `quantity` est déjà en unités de
    -- dispensation (tout est saisi à l'unité en Côte d'Ivoire), le tableau de
    -- bord ne multiplie jamais par le conditionnement (ADR 0017).
    tl.pack_size                                                        AS taille_conditionnement,
    tl.type                                                              AS type_ligne,
    CASE WHEN tl.is_from_inventory_adjustment THEN 'OUI' ELSE 'NON' END AS issu_ajustement,
    to_char(tl.expiry_date, 'YYYY-MM-DD')                               AS date_peremption
FROM trans_line tl
JOIN tmp_transactions t ON t.transaction_id = tl.transaction_id
JOIN item i              ON i.id = tl.item_id
JOIN tmp_traceurs tr     ON tr.produit_code = i.code;


-- ══ 6. STOCK_ACTUEL ══════════════════════════════════════════════════════
-- Grain : (site, produit, lot). PAS une fenêtre -- un instantané du stock
-- disponible (`item_line.available`) au moment de l'extraction. Restreint
-- aux traceurs et au périmètre.
--
-- On AGRÈGE par (site, produit, lot) : mSupply répartit souvent un même lot
-- sur plusieurs `item_line` (emplacements, conditionnements, entrées
-- successives). Sans agrégation, le classeur porte plusieurs lignes pour la
-- même clé et l'application rejette le lot (lot du 2026-10-12 : 3889 lignes
-- pour 2699 clés). La quantité est sommée ; la péremption retenue est la
-- plus proche (`min`), celle qui compte pour le suivi des périmés.
DROP TABLE IF EXISTS tmp_stock_actuel;
CREATE TEMP TABLE tmp_stock_actuel AS
SELECT
    il.store_id                                                   AS site_id,
    il.item_id                                                     AS produit_id,
    il.batch                                                        AS lot,
    -- En Côte d'Ivoire la dispensation se fait à l'unité : `available` est
    -- déjà en unités, aucune multiplication par `pack_size` (confirmé par la
    -- coordination le 2026-10-13).
    sum(il.available)                                                AS quantite_disponible,
    to_char(min(il.expiry_date), 'YYYY-MM-DD')                        AS date_peremption,
    -- item_line n'a pas d'historique : c'est le stock à l'instant où le
    -- script tourne, daté du jour d'exécution (comme date_extraction).
    to_char(current_date, 'YYYY-MM-DD')                               AS date_photo
FROM item_line il
JOIN item i              ON i.id = il.item_id
JOIN tmp_traceurs tr     ON tr.produit_code = i.code
JOIN tmp_perimetre_dqa p ON p.site_id = il.store_id
GROUP BY il.store_id, il.item_id, il.batch;


-- ══ 7. INVENTAIRES ═══════════════════════════════════════════════════════
-- Grain : un inventaire (`stock_take`). Fenêtre sur `stock_take_date`.
-- Restreint au périmètre.
--
-- heure_inventaire / numero_inventaire : un site peut finaliser plusieurs
-- inventaires le même jour sur le même produit (recomptage, correction). Le
-- tableau de bord retient le dernier finalisé : heure, puis numéro attribué par
-- mSupply (`serial_number`, croissant par site). Ne pas les omettre : sans
-- elles, le classeur est rejeté (colonne manquante).
DROP TABLE IF EXISTS tmp_inventaires;
CREATE TEMP TABLE tmp_inventaires AS
SELECT
    st.id                                                         AS inventaire_id,
    st.store_id                                                    AS site_id,
    st.programid                                                    AS programme_id,
    to_char(st.stock_take_date, 'YYYY-MM-DD')                        AS date_inventaire,
    st.status                                                         AS statut,
    st.invad_additions_id                                              AS invad_additions_id,
    st.invad_reductions_id                                              AS invad_reductions_id,
    to_char(st.stock_take_time, 'HH24:MI:SS')                            AS heure_inventaire,
    st.serial_number                                                     AS numero_inventaire
FROM stock_take st
JOIN tmp_perimetre_dqa p ON p.site_id = st.store_id
WHERE st.stock_take_date BETWEEN :'fenetre_debut'::date AND :'fenetre_fin'::date;


-- ══ 8. INVENTAIRE_LIGNES ═════════════════════════════════════════════════
-- Grain : (inventaire, produit, lot), SANS DOUBLON (spec §4.9). Restreint
-- aux traceurs et aux inventaires déjà retenus dans tmp_inventaires.
--
-- `quantite_theorique` = `snapshot_qty` : le stock théorique mSupply à
-- l'ouverture de l'inventaire. `quantite_comptee` = `stock_take_qty` : le
-- compte physique saisi. Les deux sont déjà en unités : la dispensation se
-- fait à l'unité en Côte d'Ivoire (confirmé par la coordination le
-- 2026-10-13). Ne PAS multiplier par `snapshot_packsize` : une version
-- antérieure le faisait pour le seul théorique, ce qui gonflait l'écart des
-- produits dont le conditionnement dépasse 1 (lot du 2026-10-12 : 9 lignes
-- où le théorique valait exactement 2 à 20 fois le compté).
--
-- On AGRÈGE (SUM) plutôt que DISTINCT : `stock_take_lines` peut porter
-- plusieurs lignes pour le même (inventaire, produit, lot) si mSupply les a
-- scindées par `item_line_id` d'origine (prix d'achat différents sur le
-- même lot, par exemple). Un simple DISTINCT laisserait passer des
-- doublons dès que les quantités diffèrent d'une ligne à l'autre ; la
-- somme respecte la contrainte « une ligne par (inventaire, produit, lot) »
-- sans perdre de quantité.
DROP TABLE IF EXISTS tmp_inventaire_lignes;
CREATE TEMP TABLE tmp_inventaire_lignes AS
SELECT
    stl.stock_take_id                                             AS inventaire_id,
    stl.item_id                                                    AS produit_id,
    stl.batch                                                       AS lot,
    sum(stl.snapshot_qty)                                             AS quantite_theorique,
    sum(stl.stock_take_qty)                                           AS quantite_comptee
FROM stock_take_lines stl
JOIN tmp_inventaires inv ON inv.inventaire_id = stl.stock_take_id
JOIN item i               ON i.id = stl.item_id
JOIN tmp_traceurs tr      ON tr.produit_code = i.code
GROUP BY stl.stock_take_id, stl.item_id, stl.batch;


-- ══ 9. REQUISITIONS ══════════════════════════════════════════════════════
-- Grain : une réquisition. Fenêtre : `date_entered` OU la période couverte
-- recoupe la fenêtre d'extraction, ET mois couvert entre M-2 et M (M = mois
-- PAQD, voir la fin de la clause WHERE). Restreint au périmètre.
--
-- Réponses exclues : quand un site commande à son district, mSupply crée la
-- réquisition du site (`request`) ET une copie de travail chez le district
-- (`response`, ou `EPIWastageResponse`), rangée au nom du district. Les
-- extraire ferait compter au district des réquisitions qu'il n'a pas
-- soumises (P1, P2 faussés). Seules les réquisitions propres de chaque site
-- restent ; la réponse ne sert qu'à relier la distribution du district à la
-- demande du site (voir TRANSACTIONS).
--
-- mois_couvert_* : d'abord via le calendrier de périodes mSupply
-- (`period`, liée par `periodid`), à défaut dérivé du mois de
-- `date_stock_take` (repli documenté spec §4.10). Ce repli répond
-- directement à la question ouverte en annexe B §1 de la spécification
-- (« existe-t-il un calendrier de périodes où chaque période = un mois
-- civil ? ») -- si la réponse de la DAP est oui pour toutes les
-- réquisitions, le repli ne se déclenchera jamais et peut être retiré.
DROP TABLE IF EXISTS tmp_requisitions;
CREATE TEMP TABLE tmp_requisitions AS
SELECT
    r.id                                                           AS requisition_id,
    r.store_id                                                      AS site_id,
    r.programid                                                      AS programme_id,
    r.periodid                                                        AS periode_id,
    to_char(
        COALESCE(per.startdate, date_trunc('month', r.date_stock_take)::date),
        'YYYY-MM-DD'
    )                                                                   AS mois_couvert_debut,
    to_char(
        COALESCE(per.enddate, (date_trunc('month', r.date_stock_take) + interval '1 month - 1 day')::date),
        'YYYY-MM-DD'
    )                                                                   AS mois_couvert_fin,
    to_char(r.date_entered, 'YYYY-MM-DD')                               AS date_soumission,
    to_char(r.date_stock_take, 'YYYY-MM-DD')                             AS date_inventaire_ref,
    to_char(r.date_order_received, 'YYYY-MM-DD')                         AS date_reception,
    r.status                                                             AS statut,
    r.authorisationstatus                                                AS statut_autorisation,
    CASE WHEN r.is_emergency THEN 'Urgente' ELSE 'Ordinaire' END          AS type_requisition
FROM requisition r
LEFT JOIN period per      ON per.id = r.periodid
JOIN tmp_perimetre_dqa p  ON p.site_id = r.store_id
WHERE coalesce(r.type, '') !~* 'response$'
  AND (
        r.date_entered BETWEEN :'fenetre_debut'::date AND :'fenetre_fin'::date
     OR (
          COALESCE(per.startdate, date_trunc('month', r.date_stock_take)::date) <= :'fenetre_fin'::date
      AND COALESCE(per.enddate,   (date_trunc('month', r.date_stock_take) + interval '1 month - 1 day')::date) >= :'fenetre_debut'::date
        )
      )
  -- Le mois couvert doit tomber entre M-2 et M (M = mois PAQD) : c'est la
  -- fenêtre que le tableau de bord exploite (règle MOIS_COUVERT_INVALIDE).
  -- Sans cette borne, une réquisition saisie récemment pour un mois ancien
  -- (correction tardive) passe par `date_entered` et lève un avertissement
  -- au dépôt (313 sur le lot du 2026-10-12). Un mois couvert indéterminable
  -- (ni période, ni date d'inventaire de référence) est écarté pour la même
  -- raison : le tableau de bord ne pourrait pas le rattacher à un mois.
  AND date_trunc('month', COALESCE(per.startdate, r.date_stock_take))
      BETWEEN date_trunc('month', :'mois_debut'::date) - interval '2 months'
          AND date_trunc('month', :'mois_debut'::date);


-- ══ METADATA ═════════════════════════════════════════════════════════════
-- Grain : (champ, valeur). Les 9 compteurs `nb_lignes_*` sont calculés
-- directement depuis les tables temporaires ci-dessus, par construction :
-- ils reflètent donc EXACTEMENT ce qui sera transmis dans chaque onglet.
-- Aucun risque d'écart entre le compteur déclaré et les lignes réellement
-- présentes -- c'est précisément ce que l'application vérifie au dépôt
-- (règle bloquante COMPTEUR_METADATA : un écart entraîne le rejet du
-- classeur entier). En construisant METADATA à partir des mêmes tables que
-- les onglets, cet écart est impossible au niveau des CSV. Il reste possible
-- APRÈS, si quelqu'un retouche le classeur dans Excel (lot du 2026-10-12 :
-- la première ligne de données, encore au style gris italique de l'exemple,
-- a été supprimée à la main sur 8 onglets). csv_vers_canevas.py relit donc
-- le classeur enregistré et échoue au moindre écart ; `--verifier` permet de
-- refaire ce contrôle sur un fichier ouvert entre-temps.
DROP TABLE IF EXISTS tmp_metadata;
CREATE TEMP TABLE tmp_metadata AS
SELECT 'date_extraction'           AS champ, to_char(current_date, 'YYYY-MM-DD')                 AS valeur
UNION ALL SELECT 'cycle_paqd',                :'cycle_paqd'
UNION ALL SELECT 'mois_paqd',                 :'mois_paqd'
UNION ALL SELECT 'mois_debut',                to_char(:'mois_debut'::date, 'YYYY-MM-DD')
UNION ALL SELECT 'mois_fin',                  to_char(:'mois_fin'::date, 'YYYY-MM-DD')
UNION ALL SELECT 'fenetre_debut',             to_char(:'fenetre_debut'::date, 'YYYY-MM-DD')
UNION ALL SELECT 'fenetre_fin',               to_char(:'fenetre_fin'::date, 'YYYY-MM-DD')
UNION ALL SELECT 'version_msupply',           :'version_msupply'
UNION ALL SELECT 'realisee_par',              :'realisee_par'
UNION ALL SELECT 'nb_lignes_SITES',               (SELECT count(*)::text FROM tmp_sites)
UNION ALL SELECT 'nb_lignes_SITE_PROGRAMME',      (SELECT count(*)::text FROM tmp_site_programme)
UNION ALL SELECT 'nb_lignes_PRODUITS',            (SELECT count(*)::text FROM tmp_produits)
UNION ALL SELECT 'nb_lignes_TRANSACTIONS',        (SELECT count(*)::text FROM tmp_transactions)
UNION ALL SELECT 'nb_lignes_LIGNES_TRANSACTIONS', (SELECT count(*)::text FROM tmp_lignes_transactions)
UNION ALL SELECT 'nb_lignes_STOCK_ACTUEL',        (SELECT count(*)::text FROM tmp_stock_actuel)
UNION ALL SELECT 'nb_lignes_INVENTAIRES',         (SELECT count(*)::text FROM tmp_inventaires)
UNION ALL SELECT 'nb_lignes_INVENTAIRE_LIGNES',   (SELECT count(*)::text FROM tmp_inventaire_lignes)
UNION ALL SELECT 'nb_lignes_REQUISITIONS',        (SELECT count(*)::text FROM tmp_requisitions)
UNION ALL SELECT 'observations',              :'observations';


-- ══ Export ═══════════════════════════════════════════════════════════════
-- Un \copy par onglet (fonctionnalité psql ; adapter si vous passez par un
-- autre client). Importer ensuite chaque CSV dans l'onglet correspondant du
-- gabarit à partir de la ligne 6, colonnes de date en TEXTE (voir
-- l'avertissement en tête de fichier).
\copy (SELECT * FROM tmp_metadata)            TO 'metadata.csv'            WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy (SELECT * FROM tmp_sites)               TO 'sites.csv'               WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy (SELECT * FROM tmp_site_programme)      TO 'site_programme.csv'      WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy (SELECT * FROM tmp_produits)            TO 'produits.csv'            WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy (SELECT * FROM tmp_transactions)        TO 'transactions.csv'        WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy (SELECT * FROM tmp_lignes_transactions) TO 'lignes_transactions.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy (SELECT * FROM tmp_stock_actuel)        TO 'stock_actuel.csv'        WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy (SELECT * FROM tmp_inventaires)         TO 'inventaires.csv'         WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy (SELECT * FROM tmp_inventaire_lignes)   TO 'inventaire_lignes.csv'   WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy (SELECT * FROM tmp_requisitions)        TO 'requisitions.csv'        WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')


-- ══ Points encore ouverts avec la DAP (annexe B de la spécification) ════════
-- 1. Calendrier de périodes : REQUISITIONS utilise `period` si `periodid`
--    est renseigné, sinon dérive le mois depuis `date_stock_take`. À
--    confirmer : le repli se déclenche-t-il souvent ?
-- 2. `si` / `rc` : la requête TRANSACTIONS suppose `si` = facture
--    fournisseur adressée au site, `rc` = réception enregistrée par le
--    site. À confirmer.
-- 3. Ajustements hors INVAD : la branche `adj_lignes` de TRANSACTIONS est
--    un repli pour ce cas. En surveiller la fréquence réelle.
-- 4. `programid` / `periodid` : la requête les prend tels quels (NULL
--    possible, auquel cas `programme_id` reste vide sur la ligne -- la
--    spec les marque obligatoires seulement « si présents dans mSupply »).
-- 5. Hiérarchie district -> région (SITES) : RÉSOLU le 2026-10-12, lien
--    direct name_category1.parent_id -> name_category1_level2, vérifié par
--    la DAP sur la base réelle (202/202 districts résolus).
-- 6. type_structure : ce script produit ESPC / HG / CHR / CHU / District
--    sanitaire (consigne du gabarit DAP). Le référentiel du tableau de bord
--    (console « Types de structure ») doit connaître HG et CHR pour leur
--    appliquer l'échéance de réquisition de 7 jours ; un libellé inconnu
--    retombe sur 10 jours. Action côté coordination, pas côté extraction.
