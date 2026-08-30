# Guide du module Authentification

## Rôle

Tout accès à l'application est authentifié (ADR 0004). Ce module gère la
connexion, la session serveur et le contrôle de rôle.

Emplacement : `apps/api/src/auth/`.

## Points d'entrée

| Méthode | Chemin | Effet |
|---|---|---|
| `POST` | `/api/auth/connexion` | vérifie identifiant + mot de passe, pose le cookie `dqa_session` (httpOnly), renvoie `Utilisateur` |
| `POST` | `/api/auth/deconnexion` | supprime la session, efface le cookie (204) |
| `GET` | `/api/auth/moi` | renvoie l'utilisateur de la session (401 sinon) |

## Fonctionnement

- **`AuthGuard` est globale** (`APP_GUARD`). Toute route exige une session valide,
  sauf celles marquées `@Public()` (santé, connexion). `@Roles(['coordination'])`
  restreint en plus.
- **Session** : ligne dans `dqa.session` (uuid, `expire_le` à +12 h), référencée
  par un cookie httpOnly `sameSite=lax`, `secure` en production.
- **Mots de passe** : hachés avec `scrypt` (`node:crypto`), format
  `scrypt$<sel>$<hash>`. Comparaison en temps constant (`timingSafeEqual`).
- **Comptes** : provisionnés par la migration 0010, un par rôle
  (`lecteur` / `coordination` / `admin`). Pas d'auto-inscription. Pas encore
  d'écran de gestion des comptes (hors périmètre de la première tranche).

## Rôles

| Rôle | Peut |
|---|---|
| `lecteur` | consulter tous les écrans |
| `coordination` | + déclencher les imports, (à venir) éditer la grille et les traceurs |
| `admin` | + (à venir) gérer les comptes ; ne touche pas aux données |

## Front

`AuthService` (signal `utilisateur`), garde de route `gardeAuthentifie`
(redirige vers `/connexion`), intercepteur HTTP `avecIdentifiants`
(`withCredentials` sur `/api`). Écran `pages/connexion.ts`.

## Pièges connus

- Les sessions expirées ne sont pas purgées automatiquement (index sur
  `expire_le` en place pour un futur job de nettoyage).
- Changer le hachage de mot de passe impose de re-seeder les comptes de
  démonstration (les hashes de la migration 0010 sont figés pour un mot de passe
  connu — à changer avant toute mise en service).
