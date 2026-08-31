# Spec — Administration : grille de paramètres et comptes

Status: ready-for-agent
Feature: admin-grille-comptes
Date: 2026-08-31

Références : `CONTEXT.md` (Grille de paramètres, Coordination), `CLAUDE.md`
§3/§5/§8, `DESIGN_SYSTEM.md`, `docs/adr/0003-parametres-versionnes-scores-immuables.md`,
`docs/adr/0004-authentification-obligatoire.md`, `docs/guide_module_auth.md`,
`db/migrations/0006_grille_parametre.sql`, `db/migrations/0010_utilisateurs.sql`,
`apps/api/src/admin/` (module traceurs, à suivre comme modèle).

---

## Problem Statement

Deux référentiels sont éditables « dans l'app » sur le papier mais ne le sont
pas :

1. **La grille de paramètres** (poids des piliers, seuils et tolérances des
   sous-composantes) est modifiable seulement par une migration SQL. La
   coordination nationale ne peut pas préparer la grille du cycle suivant.
   ADR 0003 impose qu'une modification ne vaille **que pour les cycles à
   venir** et que les scores déjà gelés ne bougent jamais.
2. **Les comptes** sont provisionnés par la migration 0010, un par rôle. Le
   rôle `admin` existe pour « gérer les comptes sans toucher aux données »
   (guide auth) mais n'a aucun écran.

## Solution

1. **API grille** sous `/api/admin/grille` (rôle `coordination`) : lister les
   versions, lire le détail d'une version, **créer une nouvelle version** datée
   dans le futur, éditer ou supprimer une version **planifiée** (pas encore en
   vigueur). Une version en vigueur ou passée est en lecture seule.
2. **API comptes** sous `/api/admin/comptes` (rôle `admin`) : lister, créer,
   modifier (nom / rôle / actif), réinitialiser le mot de passe. Pas de
   suppression : désactivation. Garde-fou anti-verrouillage.
3. **Écrans** `/admin/grille` et `/admin/comptes`, liens dans l'en-tête
   (visibles selon le rôle, comme `/admin/traceurs`).

## User Stories

### Grille

1. En tant qu'agent de coordination, je veux voir la liste des versions de grille avec leur date d'effet et leur statut (en vigueur / planifiée / passée), afin de savoir laquelle s'applique.
2. En tant qu'agent de coordination, je veux ouvrir le détail d'une version : les six poids de pilier et les seuils/tolérances de chaque sous-composante.
3. En tant qu'agent de coordination, je veux créer une nouvelle version en repartant des valeurs de la version en vigueur, afin de n'ajuster que ce qui change.
4. En tant qu'agent de coordination, je veux que la date d'effet d'une nouvelle version soit obligatoirement dans le futur, afin de ne jamais altérer un score déjà calculé (ADR 0003).
5. En tant qu'agent de coordination, je veux que la somme des six poids de pilier soit exactement 100, refusée sinon.
6. En tant qu'agent de coordination, je veux fournir pour chaque sous-composante son seuil, son sens (atteint-ou-dépasse / au-plus), et — pour l'écart SDU et l'écart consommation — une tolérance par produit.
7. En tant qu'agent de coordination, je veux modifier une version **planifiée** (date d'effet future) tant qu'elle n'a servi à aucun score.
8. En tant qu'agent de coordination, je veux supprimer une version planifiée, afin d'annuler un changement prévu.
9. En tant qu'agent de coordination, je veux qu'une version **en vigueur ou passée** soit en lecture seule (modification et suppression refusées) — la base refuse déjà la suppression d'une grille référencée par un score gelé.
10. En tant qu'agent de coordination, je veux que deux versions ne puissent pas avoir la même date d'effet.
11. En tant que lecteur, je ne dois pas pouvoir accéder aux écrans ni aux endpoints d'administration de la grille (rôle `coordination` minimum).

### Comptes

12. En tant qu'administrateur, je veux la liste des comptes (identifiant, nom, rôle, actif), sans aucun hash de mot de passe.
13. En tant qu'administrateur, je veux créer un compte (identifiant unique, nom, rôle, mot de passe d'au moins 8 caractères).
14. En tant qu'administrateur, je veux modifier le nom, le rôle et l'état actif d'un compte.
15. En tant qu'administrateur, je veux réinitialiser le mot de passe d'un compte.
16. En tant qu'administrateur, je ne dois pas pouvoir me désactiver moi-même ni retirer mon propre rôle `admin`.
17. En tant qu'administrateur, je ne dois pas pouvoir désactiver ou rétrograder le dernier `admin` actif.
18. En tant que coordination ou lecteur, je ne dois pas pouvoir accéder aux écrans ni aux endpoints de gestion des comptes (rôle `admin` uniquement).
19. En tant qu'administrateur, je veux qu'un identifiant déjà pris soit refusé (409).
20. En tant que développeur, je veux que le front rejette une réponse `GrilleDetail` / `CompteAdmin[]` non conforme au contrat.

## Implementation Decisions

### Schéma

- **Aucune migration.** Les tables existent : `grille_parametre`
  (`effet_a_partir_de date UNIQUE`), `grille_poids_pilier`,
  `grille_seuil_sous_composante` (les deux en `ON DELETE CASCADE` sur
  `grille_id`), `utilisateur`, `session`.
- **Immutabilité (ADR 0003)** : une version est **modifiable** ssi
  `effet_a_partir_de > CURRENT_DATE`. Le `DELETE` d'une version référencée par
  `hist_score_site.grille_id` est déjà refusé par la FK ; le repository ajoute
  la garde `effet_a_partir_de > CURRENT_DATE` pour un message clair et pour
  couvrir le cas « future mais jamais utilisée ».
- **Création d'une version** : `INSERT` dans `grille_parametre` puis les 6
  `grille_poids_pilier` et les `grille_seuil_sous_composante`, **en une
  transaction**.

### Contrats (`@dqa/contracts`)

```
SENS_SEUIL = ['sup', 'inf']  (z.enum)  — 'sup' conforme si valeur ≥ seuil ; 'inf' si ≤

grilleParametre = {
  id: number, version: string, effetAPartirDe: DateIso,
  creeLe: string(datetime),
  statut: 'planifiee' | 'en_vigueur' | 'passee',
  modifiable: boolean,               // statut === 'planifiee'
}
poidsPilier          = { pilier: Pilier, poidsPct: number }
seuilSousComposante  = { sousComposante: SousComposante, seuil: number, sens: SensSeuil, tolerance: number | null }
grilleDetail         = grilleParametre & { poids: poidsPilier[6], seuils: seuilSousComposante[] }

entreeGrille = {
  version: string(1..40),
  effetAPartirDe: DateIso,
  poids: array(poidsPilier).length(6),           // .refine somme = 100
  seuils: array(seuilSousComposante).min(1),     // tolerance non nulle ssi ecart_sdu / ecart_consommation
}

compteAdmin  = { id: string, identifiant: string, nom: string, role: Role, actif: boolean, creeLe: string(datetime) }
entreeCompte = { identifiant: string(1..60), nom: string(1..120), role: Role, motDePasse: string(min 8, max 200) }
majCompte    = { nom: string(1..120), role: Role, actif: boolean }
motDePasseCompte = { motDePasse: string(min 8, max 200) }
```

- `DateIso` existe déjà (`AAAA-MM-JJ`). `Role`, `roleSchema` existent. `Pilier`,
  `SousComposante` existent.
- `Utilisateur` (auth) est distinct de `CompteAdmin` (celui-ci porte `actif` et
  `creeLe`, pas l'inverse) — deux DTO séparés.

### API

Module `apps/api/src/admin/` (étendu). Toutes les routes derrière `AuthGuard`
global ; `@Roles(['coordination'])` sur la grille, `@Roles(['admin'])` sur les
comptes. Validation par `ZodValidationPipe` (modèle traceurs).

**Grille** (`/api/admin/grille`) :
| Méthode | Chemin | Rôle | Effet |
|---|---|---|---|
| `GET` | `/` | coordination | `GrilleParametre[]`, triées par `effetAPartirDe` desc |
| `GET` | `/:id` | coordination | `GrilleDetail` (404 si inconnue) |
| `POST` | `/` | coordination | crée une version ; 400 si date ≤ aujourd'hui, date déjà prise (409), somme des poids ≠ 100, tolérance manquante/en trop |
| `PUT` | `/:id` | coordination | remplace poids + seuils d'une version planifiée ; 409 si non modifiable |
| `DELETE` | `/:id` | coordination | supprime une version planifiée (204) ; 409 si non modifiable ou référencée |

- `statut` : `passee` si une version postérieure est déjà en vigueur, sinon
  `en_vigueur` si `effet_a_partir_de <= CURRENT_DATE`, sinon `planifiee`.
  (Concrètement : la version « en vigueur » est celle de `grille_pour_mois` pour
  le mois courant.)

**Comptes** (`/api/admin/comptes`) :
| Méthode | Chemin | Effet |
|---|---|---|
| `GET` | `/` | `CompteAdmin[]` triés par identifiant, jamais le hash |
| `POST` | `/` | crée ; 409 si identifiant pris ; hash `hacherMotDePasse` |
| `PUT` | `/:id` | met à jour nom / rôle / actif ; 404 si inconnu ; 400 si l'appelant se désactive/rétrograde lui-même (US 16) ou si c'est le dernier admin actif (US 17) |
| `POST` | `/:id/mot-de-passe` | réinitialise le hash (204) |

- L'utilisateur courant vient de `req.utilisateur` (posé par `AuthGuard`),
  lu via `@Req()`.

### Front

- **Routes** `/admin/grille` (`gardeRole(['coordination','admin'])`) et
  `/admin/comptes` (`gardeRole(['admin'])`), lazy-loaded, sur le modèle de
  `/admin/traceurs`. Liens dans `ui/entete` : « Grille » (coordination/admin),
  « Comptes » (admin).
- **`pages/admin-grille.ts`** : tableau des versions (statut en badge) ; bouton
  « Nouvelle version » ouvre un formulaire pré-rempli depuis la version en
  vigueur (`GET /:id`) — champs : libellé de version, date d'effet, 6 poids
  (avec un total live et un signal d'erreur si ≠ 100), une ligne par
  sous-composante (seuil, sens, tolérance si applicable). « Enregistrer » →
  `POST`. Une version planifiée est éditable en place (`PUT`) et supprimable.
- **`pages/admin-comptes.ts`** : tableau des comptes ; « Nouveau compte »
  (identifiant, nom, rôle, mot de passe) ; par ligne : édition nom/rôle,
  bascule actif/inactif, action « réinitialiser le mot de passe ». Les actions
  interdites (US 16/17) sont désactivées côté front en plus du refus serveur.
- **`core/adminGrille.service.ts`** et **`core/adminComptes.service.ts`** :
  `validerReponse` sur chaque lecture.
- Pas de nouveau composant d'UI générique nécessaire ; réutilise
  `ui/badge-*` au besoin (un petit badge de statut de grille peut rester local).

## Testing Decisions

Base PostgreSQL **éphémère** (testcontainers), jamais mockée (CLAUDE.md §3).
Une règle de validation = un cas passant **et** un cas échouant.

### Couture — API grille (`test/admin-grille.test.ts`)

Via `POST /api/imports`-style : monter `AppModule`, se connecter en
`coordination`. Cas : liste renvoie la v1 seedée `en_vigueur` ; création d'une
version future valide (poids = 100, tolérances correctes) puis relecture du
détail ; **refus** date passée, date dupliquée (409), somme ≠ 100, tolérance
manquante sur `ecart_sdu` ; `PUT` sur une version planifiée OK, sur la v1 → 409 ;
`DELETE` d'une planifiée OK, de la v1 → 409 ; un `lecteur` → 403 sur tous.
Vérifier qu'après création d'une version future, `hist_score_site` et les
scores d'un mois passé sont **inchangés** (ADR 0003 — s'appuyer sur une fixture
d'import minimale ou insérer une ligne `hist_score_site` à la main).

### Couture — API comptes (`test/admin-comptes.test.ts`)

Se connecter en `admin`. Cas : liste sans hash ; création + connexion réussie
avec le nouveau mot de passe ; identifiant dupliqué → 409 ; `PUT` nom/rôle/actif ;
**refus** auto-désactivation, auto-rétrogradation, désactivation du dernier
admin ; réinitialisation du mot de passe puis connexion avec le nouveau ; un
`coordination` → 403 sur tous.

### Couture D — services HTTP Angular

Étend `apps/web/src/app/core/valider-reponse.test.ts` : une `GrilleDetail`
complète et une liste `CompteAdmin[]` passent ; un `statut` de grille inconnu,
un `poids` hors [0, 100], un `role` inconnu → lèvent.

## Out of Scope

- L'**historique des modifications** de grille / comptes (audit log).
- La **suppression** de comptes (désactivation seulement).
- Le **changement de son propre mot de passe** par un utilisateur non-admin
  (écran « mon compte ») — tranche distincte si demandé.
- La **purge des sessions** expirées (déjà notée comme dette).
- Toute **UI de la liste des traceurs** au-delà de l'existant.
- Les **fêtes mobiles** dans `dim_temps` — tranche distincte.
- Un **recalcul rétroactif** des scores : explicitement interdit (ADR 0003).

## Further Notes

- ADR 0003 est le cœur de la tranche : la seule façon d'« éditer » la grille
  est de créer une version datée dans le futur. Le garde-fou serveur
  (`effet_a_partir_de > CURRENT_DATE`) + la FK `hist_score_site.grille_id`
  rendent une altération rétroactive impossible.
- `grille_pour_mois(text)` (migration 0012) reste la source de vérité pour
  « quelle grille s'applique à ce mois » ; l'admin n'y touche pas.
- Le hachage de mot de passe réutilise `hacherMotDePasse` (`auth/password.ts`),
  scrypt, bibliothèque standard (CLAUDE.md §7).
- Les comptes de démonstration de la migration 0010 restent ; l'écran permet
  d'en créer de vrais et de désactiver les démos.
