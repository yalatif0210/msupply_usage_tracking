# Spec — Socle : import V2 + piliers P5 et P6

Status: ready-for-agent
Feature: socle-import-p5-p6
Date: 2026-08-28

Références : `CONTEXT.md`, `docs/adr/0001`–`0005`,
`docs/canevas_extraction_v2.md`, `docs/specification_extraction_dap.md`,
`docs/exploration_etat_des_lieux.md`, `ARCHITECTURE.md`, `CLAUDE.md`.

---

## Problem Statement

La DAP transmet chaque semaine un export mSupply couvrant 40 sites, mais il
n'existe aujourd'hui aucun moyen d'en tirer une lecture de la qualité des
données. Le dépôt ne contient qu'un squelette : des contrats TypeScript, un
brouillon SQL incohérent (trois modèles de piliers concurrents, vues câblées sur
des codes de transaction inexistants) et de la documentation. Rien ne tourne, et
le brouillon SQL produirait des scores faux d'apparence valide.

Les équipes district et la coordination nationale ont besoin de voir, site par
site, où la donnée décroche — et de le faire à partir d'un fichier hebdomadaire,
sans connexion temps réel à mSupply.

## Solution

Une première tranche verticale, déployable, qui traverse toute la chaîne pour
**deux piliers seulement** — P5 (concordance physique / théorique) et P6 (ratio
d'ajustements) — choisis parce qu'ils sont auto-portants : ni calendrier, ni
notion de transaction attendue.

Concrètement :

1. Un **monorepo** échafaudé (API NestJS, front Angular, package de contrats
   partagés, migrations SQL) conforme à `CLAUDE.md`.
2. Un **contrat d'extraction V2** (10 jeux, cf. `docs/specification_extraction_dap.md`)
   remplaçant le canevas V1. L'import accepte **un classeur Excel unique**, un
   onglet par jeu, conforme au gabarit `Canevas_Extraction_mSupply_DQA_v2.xlsx`
   (en-têtes ligne 5, données ligne 6).
3. Une **chaîne d'import** : réception du classeur → lecture onglet par onglet →
   validation → staging → promotion en core (upsert sur identifiants mSupply) →
   rafraîchissement des vues P5/P6 → gel du mois dans l'historique.
4. Un **modèle SQL réécrit** (ADR 0001) : couche core au format à six piliers,
   grille de paramètres datée (ADR 0003), vues matérialisées `mv_p5_*` et
   `mv_p6_*`, table d'historique.
5. Une **authentification** obligatoire (ADR 0004) : connexion, session, rôles
   `lecteur` / `coordination` / `admin`.
6. Un **écran « détail site »** : pour un site et un mois PAQD, les piliers P5 et
   P6 avec le statut binaire de leur sous-composante, la valeur mesurée et le
   seuil ; filtrable par programme de santé. **Pas de score composite** tant que
   les six piliers ne sont pas couverts.
7. Un **journal des imports** minimal : liste des lots, statut, anomalies.

## User Stories

1. En tant qu'agent de coordination, je veux me connecter avec un identifiant et un mot de passe, afin d'accéder au tableau de bord.
2. En tant qu'agent de district, je veux me connecter en lecture seule, afin de consulter les scores de mes sites.
3. En tant qu'administrateur, je veux que les comptes soient provisionnés à l'avance, afin qu'aucun visiteur anonyme n'accède aux données.
4. En tant qu'agent de coordination, je veux déposer le classeur Excel hebdomadaire de la DAP, afin d'alimenter le tableau de bord.
5. En tant qu'agent de district, je ne veux pas pouvoir déclencher un import, afin que seule la coordination pilote l'alimentation.
6. En tant qu'agent de coordination, je veux que l'import me réponde immédiatement « validé » ou « rejeté », afin de savoir si je dois renvoyer un fichier corrigé à la DAP.
7. En tant qu'agent de coordination, quand un import est rejeté, je veux le motif et la liste des anomalies, afin de faire un retour précis à la DAP.
8. En tant qu'agent de coordination, je veux qu'un import rejeté ne modifie aucune donnée, afin qu'un fichier partiel ne produise jamais d'indicateurs faux.
9. En tant qu'agent de coordination, je veux qu'un écart entre un compteur METADATA et le nombre de lignes réel rejette le lot entier, afin de détecter une extraction tronquée.
10. En tant qu'agent de coordination, je veux qu'un `site_id` / `produit_id` / `programme_id` / `transaction_id` cité mais absent du jeu de référence soit signalé comme anomalie, afin de repérer une extraction incohérente.
11. En tant qu'agent de coordination, je veux qu'une date au mauvais format ou un nombre non numérique soit capturé en staging sans faire échouer la lecture, afin qu'aucun fichier mal formé ne bloque la chaîne.
12. En tant qu'agent de coordination, je veux pouvoir renvoyer le même classeur deux fois sans doublonner les données, afin de ne pas craindre un envoi accidentel.
13. En tant qu'agent de coordination, je veux qu'un fichier corrigé pour le même mois PAQD remplace l'état de ce mois, afin que le dernier envoi fasse foi.
14. En tant qu'agent de coordination, je veux que les données des semaines précédentes ré-apportées par la fenêtre de 45 jours mettent à jour le core sans re-geler les mois de cycles clos, afin que les scores historiques restent immuables (ADR 0003).
15. En tant qu'agent de coordination, je veux qu'un import déclarant un mois PAQD dans le futur, hors cycle connu, ou antérieur au mois précédent, soit rejeté, afin d'éviter un gel de score erroné.
16. En tant qu'agent de coordination, je veux que chaque lot importé apparaisse dans le journal des imports avec sa date, son mois PAQD, son statut et ses compteurs, afin de suivre l'historique d'alimentation.
17. En tant qu'agent de coordination, je veux voir pour un lot la liste de ses anomalies avec leur gravité, l'onglet et la ligne source, afin de les transmettre à la DAP.
18. En tant qu'exploitant, je veux que chaque ligne du core porte l'identifiant du lot qui l'a produite, afin de pouvoir tracer d'où vient chaque chiffre.
19. En tant qu'agent de district, je veux ouvrir la fiche d'un site, afin de voir l'état de sa qualité de données pour le dernier mois PAQD mesuré.
20. En tant qu'agent de district, je veux voir sur la fiche site le pilier P5 (concordance) avec le statut CONFORME ou ALERTE de sa sous-composante, afin de savoir si le stock physique concorde avec le théorique.
21. En tant qu'agent de district, je veux voir sur la fiche site le pilier P6 (ratio d'ajustements) avec son statut binaire, afin de repérer un site qui ajuste trop souvent son stock.
22. En tant qu'agent de district, je veux voir pour chaque pilier la valeur mesurée et le seuil de référence, afin de comprendre pourquoi le statut est CONFORME ou ALERTE.
23. En tant qu'agent de district, quand un pilier ne peut pas être calculé (ex. pas de deux inventaires bornants), je veux qu'il s'affiche NON_CALCULABLE avec la raison, jamais comme un zéro ou un tiret muet.
24. En tant qu'agent de district, je veux filtrer la fiche site par programme de santé, afin de voir la concordance et les ajustements pour le VIH, la TB, etc. séparément.
25. En tant qu'agent de district, quand un site ne gère qu'un seul programme, je veux que le filtre le reflète sans friction.
26. En tant qu'agent de coordination, je ne veux **pas** voir de score composite tant que seuls P5 et P6 sont calculés, afin de ne pas communiquer un chiffre qui changera de sens quand P1–P4 arriveront.
27. En tant qu'agent de district, je veux que la fiche indique explicitement « 2 piliers sur 6 couverts », afin de savoir que la lecture est partielle.
28. En tant qu'agent de coordination, je veux que seuls les sites marqués `dans_perimetre_dqa` par la DAP entrent dans les calculs, afin que les scores ne soient pas pollués par des sites hors mission.
29. En tant qu'agent de coordination, je veux que la concordance et les ajustements ne portent que sur les produits traceurs, afin de rester sur le panier de suivi DQA.
30. En tant qu'agent de coordination, je veux que la liste des produits traceurs soit une donnée de référence de l'application, afin de ne pas dépendre d'un marquage mSupply.
31. En tant qu'agent de coordination, je veux que les seuils utilisés pour P5 et P6 viennent de la grille de paramètres en base, afin qu'ils puissent évoluer entre deux cycles sans redéploiement.
32. En tant qu'agent de coordination, je veux que chaque score gelé référence la version de grille avec laquelle il a été calculé, afin qu'un audit puisse reproduire le calcul.
33. En tant qu'agent de district, je veux que la fiche site affiche le mois PAQD sur lequel porte l'affichage, afin de ne pas confondre deux mesures.
34. En tant qu'agent de district, je veux pouvoir consulter un mois PAQD antérieur d'un site, afin de comparer avec le mois courant.
35. En tant qu'agent de coordination, je veux que l'ajustement d'inventaire soit identifié par le lien technique mSupply (`is_from_inventory_adjustment` / liens `invad_*`) et jamais par un code de type de transaction, afin d'éviter les faux positifs (ADR 0002, point de vigilance `CLAUDE.md` §6).
36. En tant qu'agent de coordination, je veux qu'un district du périmètre soit scoré sur P5 et P6 comme un site de dispensation, afin qu'il figure dans le même tableau.
37. En tant qu'agent de district, je veux que la fiche site soit lisible à distance (contrastes francs, chiffres généreux), afin de la projeter en réunion.
38. En tant qu'agent de coordination, je veux que le front rejette explicitement une réponse API non conforme au contrat, afin de ne jamais voir de `undefined` silencieux dans l'interface.
39. En tant qu'agent de district, quand aucun import n'a encore été fait, je veux un écran d'état vide explicite plutôt qu'une page en erreur.
40. En tant qu'exploitant, je veux pouvoir rejouer l'ensemble des migrations sur une base neuve, afin de reconstruire l'environnement de zéro.
41. En tant qu'exploitant, je veux que le rafraîchissement des vues intervienne après la promotion, hors de la transaction de promotion, afin qu'un échec de refresh ne perde pas le lot importé.
42. En tant qu'agent de coordination, je veux que la promotion d'un lot soit tout-ou-rien, afin qu'un lot ne soit jamais à moitié en core.
43. En tant qu'agent de coordination, je veux qu'un onglet obligatoire absent du classeur, ou un nom de colonne modifié en ligne 5, rejette le classeur avec un motif clair, afin de détecter un gabarit altéré.
44. En tant qu'agent de coordination, je veux que la lecture du classeur traite les dates saisies comme texte `AAAA-MM-JJ` sans se laisser piéger par une reconversion Excel, afin que les dates ne soient jamais décalées.

## Implementation Decisions

### Monorepo et contrats

- Le monorepo est échafaudé selon `CLAUDE.md` §2 : `apps/api` (NestJS 10, TS
  strict), `apps/web` (Angular 20+, standalone, signals), `packages/contracts`
  (`@dqa/contracts`), `db/migrations` (SQL numéroté, irréversible).
- `packages/contracts` est repris depuis les fichiers `paqd.ts` / `dto.ts`
  existants et corrigé : le mot « composante » disparaît au profit de **pilier**
  et **sous-composante** ; les clés d'enum utilisent le même jeton que leur nom
  (bug `regularite des saisies` supprimé) ; la classification est sérialisée
  avec des underscores (`PARTIELLEMENT_CONFORME`, `NON_CONFORME`) de part et
  d'autre de la frontière ; les schémas Zod restent la source de vérité, types
  par `z.infer`.
- Les contrats de cette tranche : `DetailSite` (restreint aux piliers P5/P6),
  `ScoreSitePartiel` (sans score composite), `ResultatImport` (union
  discriminée valide/rejeté), `LotImport`, `AnomalieImport`, `FiltreSites`,
  types référentiels (`Site`, `Programme`). `SyntheseNationale` et les
  moyennes par composante ne sont **pas** livrés ici.
- Le pilier n'a pas de statut, seulement un score ; seule la sous-composante
  porte un statut, **binaire** : `CONFORME` / `ALERTE` / `NON_CALCULABLE`
  (décision D5 — l'énumération perd `PARTIEL`).

### Base de données (ADR 0001, 0003)

- `initial.sql` est **remplacé**, pas étendu. Nouvelles migrations numérotées.
- Couche 0 — contrôle des imports : `import_lot` (**sans** `empreinte_sha256`),
  `import_anomalie`. `import_lot` porte le mois PAQD déclaré, le cycle, les
  compteurs déclarés et constatés (JSONB), le statut (`recu` / `en_cours` /
  `valide` / `rejete`).
- Couche 1 — staging : une table `stg_*` par jeu du contrat V2, colonnes `TEXT`,
  aucune contrainte, `lot_id` sur chaque ligne.
- Couche 2 — core :
  - `dim_site` (PK `site_id` mSupply, `dans_perimetre_dqa`, district, région,
    type de structure) ; `dim_produit` (PK `produit_id`) ; `dim_programme`
    (PK `programme_id`) ; `dim_site_programme` (site × programme géré) ;
    `dim_temps` (calendrier, seedé par migration — jours ouvrables CI).
  - `dim_produit_traceur` : liste de référence des `produit_id` traceurs,
    **administrée dans l'application** (ADR 0005), seedée par migration pour
    cette tranche.
  - `fact_transaction` (PK `transaction_id`, `nature` dérivée, `programme_id`,
    dates, `annulation`, `lot_id_source`) ;
    `fact_ligne_transaction` (grain (transaction, produit, lot), `programme_id`,
    quantités, `issu_ajustement`, `lot_id_source`) ;
    `fact_inventaire` (grain (inventaire, produit) ou en-tête + lignes :
    `fact_inventaire` en-tête avec `programme_id`, date, statut, liens `invad_*` ;
    `fact_inventaire_ligne` grain (inventaire, produit, lot) avec quantité
    théorique et comptée) ;
    `fact_stock_snapshot` (grain (date_photo, site, produit, lot)).
  - Toutes les tables `fact_*` / `dim_*` alimentées en **upsert sur les
    identifiants naturels mSupply** : un enregistrement présent dans deux
    fenêtres successives s'écrase à l'identique.
- Paramétrage — `grille_parametre` : jeu daté (période de validité) de poids de
  piliers et de seuils de sous-composantes. Seedée par migration avec les
  valeurs de `CLAUDE.md` §5. Les vues **lisent** la grille active, ne codent
  aucun seuil en dur.
- Couche 3 — indicateurs :
  - `mv_p5_concordance` : par (site, mois PAQD, programme). Dernier inventaire
    finalisé du mois par produit traceur ; taux = quantité comptée / quantité
    théorique. Statut binaire de la sous-composante « concordance » au niveau
    site-mois selon le seuil de la grille ; `NON_CALCULABLE` si aucun inventaire
    exploitable.
  - `mv_p6_ajustements` : par (site, mois PAQD, programme). Numérateur = lignes
    `issu_ajustement` (ou transactions liées aux `invad_*`) ; dénominateur =
    mouvements de stock totaux du mois. Statut binaire selon le seuil de grille.
  - `mv_score_pilier` : score de pilier = moyenne simple des sous-composantes
    calculables (`CONFORME` = 100, `ALERTE` = 0). Pour P5 et P6, une seule
    sous-composante chacun.
  - **Pas de `mv_score_composite`** dans cette tranche.
  - Toutes les vues filtrent `dim_site.dans_perimetre_dqa`.
- `hist_score_site` : gel par (site, `date_mesure` = mois PAQD). Colonnes de
  score par pilier (`p_concordance`, `p_ajustements`), `score_composite`
  **nullable et laissé NULL**, référence à la version de grille, `lot_id`.
  `ON CONFLICT (site_id, date_mesure) DO UPDATE`.
- Procédure de rafraîchissement : `REFRESH` des vues P5/P6 puis `mv_score_pilier`,
  puis `INSERT … ON CONFLICT` dans `hist_score_site` **pour le seul mois PAQD du
  lot**. Exécutée hors de la transaction de promotion.

### Chaîne d'import — `ImportModule` (apps/api)

- Étapes : `FichierController` (réception multipart d'un classeur `.xlsx`) →
  `LectureLotService` (lit un onglet par jeu à partir de la ligne 5 pour les
  en-têtes, ligne 6 pour les données ; aucune interprétation ; les valeurs sont
  lues comme du texte brut) → `ValidationService` → `StagingService` (écriture
  brute `stg_*`) → `PromotionService` (staging → core, **transaction unique
  tout-ou-rien**) → `RafraichissementService` (appel de la procédure, hors
  transaction).
- Le classeur est lu avec une bibliothèque de lecture `.xlsx` (choix laissé au
  ticket, priorité à la bibliothèque standard / la plus légère — `CLAUDE.md`
  §7) ; jamais un tableur en dépendance runtime lourde.
- **Pas de calcul d'empreinte** (décision : SHA-256 abandonné). L'idempotence
  est garantie par la promotion en upsert cadrée sur le mois PAQD et par
  `hist_score_site` en upsert. Un renvoi du même classeur reproduit le même
  état ; il laisse une seconde ligne dans `import_lot`, sans corruption.
- L'intégrité repose sur : endpoint authentifié `coordination`, TLS au niveau
  Nginx, validation bloquante, `lot_id_source` pour la traçabilité.
- `nature` d'une transaction est dérivée à la promotion selon l'ordre du §5.1 de
  `docs/canevas_extraction_v2.md` (ajustement via liens `invad_*` /
  `is_from_inventory_adjustment` d'abord, puis `dispensation`, `distribution`,
  `facture_fournisseur`, `reception`, retours, `autre`).
- Règles de validation (chacune = une anomalie typée ; les bloquantes ont la
  gravité `erreur` et rejettent le lot) :
  - compteur METADATA ≠ nombre de lignes réel d'un onglet → **bloquant**.
  - onglet obligatoire absent, ou nom de colonne (ligne 5) modifié → **bloquant**.
  - `mois_paqd` absent, mal formé, dans le futur, hors cycle connu, ou plus
    ancien que le mois précédent → **bloquant**.
  - `mois_debut` / `mois_fin` incohérents avec `mois_paqd` → **bloquant**.
  - référence croisée manquante (`site_id`, `produit_id`, `programme_id`,
    `transaction_id`, `inventaire_id`) → **avertissement**, ligne ignorée à la
    promotion.
  - date non conforme à `AAAA-MM-JJ`, nombre non numérique, booléen hors
    {OUI, NON} → **avertissement**, capturé en staging, ligne ignorée à la
    promotion si le champ est requis.
  - `nature` non dérivable → **avertissement**.
- `ResultatImport` : `valide` porte le `LotImport` et les anomalies non
  bloquantes ; `rejete` porte le motif et au moins une anomalie `erreur`.

### API en lecture — `IndicateursModule`, `ReferentielModule` (apps/api)

- Lecture seule sur `mv_*` et `hist_score_site` ; aucun recalcul en TypeScript.
- Endpoints de la tranche :
  - `POST /api/imports` (multipart, rôle `coordination`) → `ResultatImport`.
  - `GET /api/imports` (rôle `lecteur`) → `LotImport[]`.
  - `GET /api/imports/:id/anomalies` → `AnomalieImport[]`.
  - `GET /api/sites` (filtrable par district, région, programme) → liste de
    sites avec leurs scores de pilier P5/P6 pour le dernier mois PAQD.
  - `GET /api/sites/:id?mois=AAAA-MM&programme=<id>` → `DetailSite` restreint
    (piliers P5, P6 ; sous-composantes ; valeur ; seuil ; statut ; mention
    « n piliers sur 6 »).
  - `GET /api/referentiel/programmes`, `GET /api/referentiel/districts`.
- Les schémas Zod des contrats servent de `ValidationPipe` à l'entrée et de
  garde-fou en test à la sortie.

### Authentification — `AuthModule` (ADR 0004)

- Connexion identifiant / mot de passe, session côté serveur (cookie httpOnly).
- Rôles `lecteur` / `coordination` / `admin` ; garde sur chaque route.
- `coordination` : imports + (plus tard) grille et traceurs. `lecteur` :
  lecture. `admin` : gestion des comptes (UI **hors périmètre** ici).
- Comptes provisionnés par migration/seed pour cette tranche ; pas
  d'auto-inscription.

### Front — `apps/web`

- Écran de connexion.
- Écran **détail site** : en-tête (nom, district, région, type, mois PAQD
  affiché, « 2 piliers sur 6 »), sélecteur de mois, sélecteur de programme,
  puis pour P5 et P6 : libellé du pilier, sous-composante, valeur mesurée,
  seuil, badge de statut (CONFORME / ALERTE / NON_CALCULABLE avec raison).
- Écran **journal des imports** : tableau des lots (date, mois PAQD, statut,
  compteurs) ; détail d'un lot = ses anomalies.
- Composants standalone, `OnPush`, signals ; pas d'état global. Services HTTP
  typés qui valident la réponse avec le schéma Zod du contrat et lèvent une
  erreur explicite si non conforme.
- Registre visuel de `DESIGN_SYSTEM.md` (à créer) : sobre, dense, lisible à
  distance ; pas de score composite affiché.

## Testing Decisions

Aucun test n'existe dans le dépôt : cette tranche **établit les patterns**.
Règles directrices (`CLAUDE.md` §3) : tester le comportement externe, jamais
l'implémentation ; base PostgreSQL **éphémère**, jamais mockée ; un test par
règle de validation, avec un cas passant et un cas échouant.

### Couture A — frontière HTTP (principale)

Test d'intégration : l'application API démarrée contre une base PostgreSQL
éphémère (les migrations sont jouées au démarrage du test). Un test :

1. `POST /api/imports` avec un classeur `.xlsx` de fixture, puis
2. `GET /api/sites/:id` et `GET /api/imports`.

Assertions : forme de `ResultatImport` (union discriminée), état résultant des
couches `stg_*` / `dim_*` / `fact_*`, sortie des vues P5/P6, ligne gelée dans
`hist_score_site` avec sa version de grille, anomalies enregistrées, et
conformité de `DetailSite` au schéma Zod de `@dqa/contracts`.

Jeux de fixtures (classeurs `.xlsx` construits pour le test) : import propre ;
compteur METADATA faux → rejet ; onglet manquant → rejet ; `mois_paqd` futur →
rejet ; renvoi du même classeur → même état, seconde ligne `import_lot` ;
fenêtre chevauchant deux mois → seul le mois déclaré est gelé ; site produisant
un pilier `NON_CALCULABLE`.

### Couture B — vues d'indicateurs (SQL)

Test d'intégration : migrations jouées sur base éphémère, insertion de lignes
`fact_*` / `dim_*` fabriquées à la main, `REFRESH`, assertions sur les lignes de
`mv_p5_concordance`, `mv_p6_ajustements`, `mv_score_pilier`. Cas : concordance
au-dessus / en dessous du seuil de grille ; ratio d'ajustements conforme /
alerte ; aucun inventaire exploitable → `NON_CALCULABLE` ; filtrage
`dans_perimetre_dqa` ; ventilation par programme. Séparée de A parce que
fabriquer un classeur produisant un cas de score précis est fragile et que le calcul
est le cœur du risque (ADR 0001).

### Couture C — règles de validation (imposée par `CLAUDE.md` §3)

Tests unitaires du `ValidationService`, sans base. Pour **chaque** règle listée
dans les Implementation Decisions : un cas passant et un cas échouant, avec
l'anomalie typée attendue (code, gravité, onglet, ligne source).

### Couture D — services HTTP Angular

Tests unitaires légers : chaque service typé, confronté à une réponse HTTP
simulée conforme puis non conforme au contrat, doit respectivement rendre la
donnée et lever une erreur explicite.

## Out of Scope

- Les piliers **P1, P2, P3, P4** et leurs sous-composantes ; le calendrier
  `dim_temps` au-delà du seed ; la notion de transaction attendue.
- Le **score composite** : ni calculé, ni affiché, ni gelé (colonne laissée
  NULL). La renormalisation des poids sur pilier NON_CALCULABLE.
- Les écrans **synthèse nationale**, **scores par programme**, les **courbes de
  progression** M+1→M+4, le **filtre programme global** hors écran détail site.
- Les **UI d'administration** : édition de la grille de paramètres, de la liste
  des traceurs, du périmètre, gestion des comptes. (Modèles de données et seeds
  en place ; édition = migration pour l'instant.)
- L'ingestion d'un **jeu de CSV** (le classeur `.xlsx` est le seul format
  accepté ici) et l'**export Excel** depuis l'application.
- Toute **preuve d'origine** du fichier (HMAC, signature) — évolution possible,
  cf. Further Notes.
- Le jeu de **vues SQL d'extraction** livré à la DAP (produit à part, cf.
  `docs/specification_extraction_dap.md`).

## Further Notes

- **Confirmations DAP en attente** (n'empêchent pas de commencer, cf.
  `docs/canevas_extraction_v2.md` §6) : périodes mSupply mensuelles ou repli sur
  `date_stock_take` ; `si` = facture fournisseur / `rc` = réception (n'affecte
  pas P5/P6) ; pertes hors mécanisme INVAD (affecte le dénominateur de P6 —
  documenté comme limite V1) ; `programid` toujours renseigné.
- **Agrégation de la sous-composante P5** : la règle exacte (part de lignes
  traceurs concordantes vs taux agrégé site) sera arrêtée dans le ticket de la
  vue `mv_p5_concordance`, en s'appuyant sur l'art antérieur de `initial.sql`
  (`mv_p5_concordance`) et le seuil « = 100 % » de `CLAUDE.md` §5, sachant
  qu'une tolérance sera très probablement paramétrée dans la grille.
- **Fenêtre de 45 jours** : chargée en entier à chaque import ; sa largeur est
  un besoin fonctionnel (rattrapage d'une semaine oubliée, et P4 plus tard aura
  besoin de deux inventaires bornants pouvant être à cheval sur deux mois). Le
  « cadrage mois » ne concerne que le gel dans `hist_score_site`.
- `initial.sql` reste dans le dépôt comme référence historique jusqu'à ce que
  les nouvelles migrations le couvrent, puis est supprimé.
- Le point de vigilance `CLAUDE.md` §6 (`im+` / `im-` non fiables) est résolu :
  l'identification des ajustements passe uniquement par les liens techniques
  mSupply.
