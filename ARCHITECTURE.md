# Architecture — Tableau de bord DQA mSupply

Document de référence pour l'implémentation. À lire avec `CLAUDE.md`.

---

## 1. Vue d'ensemble

```
  DAP                    NPSP (VPS)
  ───                    ──────────

  mSupply                ┌──────────────────────────────────┐
     │                   │  Angular  (apps/web)             │
     │ requêtes SQL      │    consulte les indicateurs      │
     ▼                   └───────────────┬──────────────────┘
  Fichier Excel                          │ HTTP + @dqa/contracts
  8 onglets                              ▼
     │                   ┌──────────────────────────────────┐
     │ transmission      │  NestJS  (apps/api)              │
     │ hebdomadaire      │    ImportModule   IndicateursModule │
     ▼                   └───────────────┬──────────────────┘
  Dépôt manuel                           │ SQL
  via l'interface  ────────────────────► ▼
                       ┌──────────────────────────────────┐
                       │  PostgreSQL                      │
                       │   stg_*  →  dim_/fact_  →  mv_*  │
                       └──────────────────────────────────┘
```

Le flux d'entrée est **manuel et discontinu**. Aucun composant ne suppose une
connexion vers mSupply.

---

## 2. Modules API

### `ImportModule`

Responsable de la chaîne fichier Excel → base.

| Étape | Rôle |
|-------|------|
| `FichierController` | Réception du fichier, calcul de l'empreinte SHA-256 |
| `LectureExcelService` | Lecture des 8 onglets, aucune interprétation |
| `ValidationService` | Compteurs METADATA, formats, références croisées |
| `StagingService` | Écriture brute dans `stg_*` |
| `PromotionService` | Staging → core, en transaction |
| `RafraichissementService` | Appel de `dqa.rafraichir_indicateurs()` |

**Règles.**

L'empreinte SHA-256 est vérifiée avant tout traitement : un fichier déjà
importé est rejeté immédiatement. Sans cela, un double envoi fausse les
compteurs et l'historique.

La validation est **bloquante sur les compteurs**. Si le nombre de lignes d'un
onglet diffère de la valeur déclarée dans METADATA, l'import est rejeté en
entier. Un import partiel est pire qu'un import absent : il produit des
indicateurs faux qui ont l'air valides.

La promotion vers le core est une transaction unique. Soit tout le lot entre,
soit rien.

Le rafraîchissement des vues intervient en dernier, hors transaction, et fige
le score du jour dans `hist_score_site`.

### `IndicateursModule`

Lecture seule. N'interroge que les vues `mv_*` et `hist_score_site`.

Ce module ne recalcule jamais un score. Si un chiffre est faux, la correction
se fait dans la vue SQL, pas dans le service.

### `ReferentielModule`

Sites, produits, districts. Sert les filtres du front.

---

## 3. Points d'entrée HTTP

| Méthode | Chemin | Retour |
|---------|--------|--------|
| `GET` | `/api/synthese` | `SyntheseNationale` |
| `GET` | `/api/sites` | `ScoreSite[]`, filtrable par `FiltreSites` |
| `GET` | `/api/sites/:id` | `DetailSite` |
| `GET` | `/api/sites/:id/historique` | `HistoriqueSite` |
| `GET` | `/api/referentiel/districts` | `string[]` |
| `POST` | `/api/imports` | `ResultatImport` (multipart) |
| `GET` | `/api/imports` | `LotImport[]` |
| `GET` | `/api/imports/:id/anomalies` | `AnomalieImport[]` |

Tous les types viennent de `@dqa/contracts`. Les schémas Zod correspondants
servent de `ValidationPipe` à l'entrée et de garde-fou en test à la sortie.

---

## 4. Front Angular

### Écrans

**Synthèse nationale** — score moyen, répartition des trois classifications,
moyennes par composante, date du dernier import. C'est l'écran projeté en
réunion : lisibilité à distance prioritaire.

**Liste des sites** — tableau triable et filtrable, une ligne par site avec son
score et sa classification. Tri par score croissant par défaut : les sites en
difficulté apparaissent en premier, c'est là qu'est l'action.

**Détail d'un site** — décomposition du score en six composantes pondérées,
liste des indicateurs par pilier avec leur statut, courbe de progression.

**Journal des imports** — historique des lots, statut, anomalies détectées.
Cet écran sert à répondre à la DAP quand un fichier est rejeté.

### Conventions

Composants standalone, `ChangeDetectionStrategy.OnPush`, signals pour l'état
local. Pas de librairie d'état globale.

Les appels HTTP passent par des services typés qui valident la réponse avec le
schéma Zod du contrat. Une réponse non conforme lève une erreur explicite
plutôt que de propager des `undefined` dans l'interface.

### Traitement de `NON_CALCULABLE`

Un indicateur non calculable n'est pas un échec. Il s'affiche distinctement
d'une alerte, avec la raison. Ne jamais le rendre par un zéro ou un tiret muet.

---

## 5. Ordre d'implémentation suggéré

1. `packages/contracts` — fait
2. `db/migrations` — reprise du modèle SQL, plus correction de
   `mv_p6_ajustements` une fois les codes de type confirmés
3. `ImportModule` avec ses tests — c'est le cœur du risque
4. `IndicateursModule` — lecture simple une fois le socle en place
5. Front, écran par écran, en commençant par la synthèse

L'étape 3 concentre la complexité. Les suivantes sont mécaniques si les
contrats et le SQL sont justes.

---

## 6. Dette connue à traiter

`mv_p6_ajustements` filtre actuellement sur les codes `im+` et `im-`. Ces codes
ne sont pas fiables : `transact.type` est un champ texte libre dans mSupply,
sans énumération. L'extraction pose désormais un suffixe `/INVAD`, et la vue
doit filtrer là-dessus.

À corriger dès que la section 0 des requêtes d'extraction aura confirmé les
valeurs réelles sur l'installation de la DAP.
