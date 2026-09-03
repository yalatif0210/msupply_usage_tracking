# Guide du module Administration

## Rôle

Édition « dans l'app » de référentiels qui, avant, ne changeaient que par
migration : la **grille de paramètres** (rôle `coordination`), les **comptes**
(rôle `admin`) et la correspondance **strate de structure** (lecture tout rôle,
écriture `coordination`). Emplacement : `apps/api/src/admin/` (module
`AdminModule`, partagé avec les traceurs) et `apps/web/src/app/pages/admin-*.ts`.

## Points d'entrée

| Méthode | Chemin | Rôle | Retour |
|---|---|---|---|
| `GET` | `/api/admin/grille` | coordination | `GrilleParametre[]` (desc par date d'effet) |
| `GET` | `/api/admin/grille/:id` | coordination | `GrilleDetail` (404 inconnue) |
| `POST` | `/api/admin/grille` | coordination | `GrilleDetail` (201) |
| `PUT` | `/api/admin/grille/:id` | coordination | `GrilleDetail` |
| `DELETE` | `/api/admin/grille/:id` | coordination | 204 |
| `GET` | `/api/admin/comptes` | admin | `CompteAdmin[]` (jamais de hash) |
| `POST` | `/api/admin/comptes` | admin | `CompteAdmin` (201) |
| `PUT` | `/api/admin/comptes/:id` | admin | `CompteAdmin` |
| `POST` | `/api/admin/comptes/:id/mot-de-passe` | admin | 204 |
| `GET` | `/api/admin/strates` | tout rôle authentifié | `VueStrates` (`{ mappings, nonClasses }`) |
| `PUT` | `/api/admin/strates/:typeStructure` | coordination | `StrateStructure` (upsert) |
| `DELETE` | `/api/admin/strates/:typeStructure` | coordination | 204 (404 si inconnu) |

## Grille de paramètres (ADR 0003)

**Une grille en vigueur ou passée est immuable.** La seule façon d'ajuster les
poids / seuils / tolérances est de **créer une nouvelle version** dont la
`effet_a_partir_de` est **dans le futur** — elle ne s'appliquera qu'aux mois à
partir de cette date (`grille_pour_mois`), sans jamais toucher un score déjà
gelé.

- `statut` : `planifiee` (`effet_a_partir_de > CURRENT_DATE`), `en_vigueur`
  (celle que `grille_pour_mois` du mois courant renvoie), `passee` (le reste).
  `modifiable = statut === 'planifiee'`.
- `POST` : transaction `grille_parametre` + 6 `grille_poids_pilier` + N
  `grille_seuil_sous_composante`. Refus : date ≤ aujourd'hui (400), date déjà
  prise (409, `UNIQUE`), somme des poids ≠ 100 (400, refine Zod), tolérance
  absente sur `ecart_sdu` / `ecart_consommation` ou présente ailleurs (400).
- `PUT` / `DELETE` : refusés (409) si la version n'est pas `planifiee`. La FK
  `hist_score_site.grille_id` bloque de toute façon la suppression d'une
  version ayant servi à un score.
- Aucune migration : les tables (0006 + colonne `tolerance` de 0017) suffisent.

Écran `pages/admin-grille.ts` : liste des versions à gauche, détail / formulaire
à droite. « Nouvelle version » pré-remplit depuis la version en vigueur ; le
total des poids est affiché en direct.

## Comptes

- `GET` ne renvoie jamais `mot_de_passe_hash`.
- `POST` : hash `scrypt` via `auth/password.ts` ; identifiant `UNIQUE` → 409.
- `PUT` (nom / rôle / actif) — garde-fous anti-verrouillage :
  - l'appelant ne peut pas se désactiver ni retirer son propre rôle `admin`
    (400) ;
  - une modification qui laisserait **zéro `admin` actif** est refusée (400) —
    en pratique atteignable seulement hors HTTP (appelant ≠ cible), la garde
    « soi-même » couvrant le reste.
- `POST /:id/mot-de-passe` : nouveau hash, 204.
- Pas de suppression : désactivation (`actif = false`). Les comptes de démo de
  la migration 0010 restent ; l'écran permet de les désactiver.

Écran `pages/admin-comptes.ts` : tableau éditable en place ; les actions
interdites pour l'utilisateur courant sont désactivées côté front en plus du
refus serveur.

## Strates de structure (chantier « données brutes des piliers »)

- Table `dqa.strate_structure (type_structure PK → strate)`, seed :
  `CSU`/`CSR` → `CS` ; `ESPC`, `HG`, `CHR`, `CHU` → strate homonyme ;
  `District sanitaire` → `District`. Migration `0031`.
- **Aucun gel** : la strate est un regroupement d'affichage. Un changement
  prend effet à la consultation suivante, sans ré-import (contrairement à la
  grille dont chaque score référence une version). Table non historisée.
- `dqa.strate_de(p_type text)` (SQL, `STABLE`) résout la strate d'un
  `type_structure` : correspondance administrée, sinon `'Non classé'` (le NULL
  y tombe aussi). C'est la porte d'entrée des lectures nationales — jamais un
  site rangé nulle part.
- `GET` renvoie aussi `nonClasses` : les `type_structure` présents dans
  `dim_site` (périmètre DQA) sans correspondance, pour que l'écran montre ce
  qu'il reste à classer. L'écran `pages/admin-strates.ts` les liste en tête,
  surlignés ; `lecteur` a la vue en lecture seule (contrôles masqués, refus
  serveur en doublure).

## Pièges connus

- Le `statut` d'une grille est calculé à la lecture (`grille_pour_mois` +
  `CURRENT_DATE`) : il change tout seul quand une version planifiée arrive à
  échéance, sans rien réécrire.
- `grille_parametre.id` est un `bigint` : le repository le rend en `::int`.
- **Désactiver** un compte (`actif = false`) coupe l'accès au prochain contrôle
  de session (`utilisateurDeSession` filtre sur `u.actif`). **Réinitialiser le
  mot de passe** ne déconnecte pas : le hash n'est vérifié qu'à la connexion.
  Pour forcer une reconnexion, désactiver puis réactiver, ou supprimer les
  lignes `dqa.session` du compte.
