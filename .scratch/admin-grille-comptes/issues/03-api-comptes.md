# 03: API de gestion des comptes

**What to build:** les endpoints `/api/admin/comptes` (rôle `admin`) pour
lister, créer, modifier (nom / rôle / actif) et réinitialiser le mot de passe
d'un compte. Pas de suppression : désactivation. Garde-fous
anti-verrouillage.

**Blocked by:** None (peut démarrer en parallèle de 01)

**Status:** done (branche `admin-grille-comptes`)

- [x] `@dqa/contracts` : `compteAdminSchema` (`id`, `identifiant`, `nom`,
      `role`, `actif`, `creeLe`) — **jamais de hash** ; `entreeCompteSchema`
      (`identifiant`, `nom`, `role`, `motDePasse` min 8), `majCompteSchema`
      (`nom`, `role`, `actif`), `motDePasseCompteSchema` (`motDePasse` min 8) ;
      types par `z.infer`.
- [x] Repository + contrôleur dans `apps/api/src/admin/` :
      - `GET /` → `CompteAdmin[]` triés par identifiant, colonnes sûres seulement ;
      - `POST /` → `hacherMotDePasse` puis insert ; 409 si identifiant pris ;
      - `PUT /:id` → maj nom / rôle / actif ; 404 inconnu ; **400** si
        l'appelant se désactive ou se rétrograde lui-même (US 16), ou si
        l'action laisserait zéro `admin` actif (US 17) ;
      - `POST /:id/mot-de-passe` → nouveau hash (204).
- [x] `@Roles(['admin'])` sur toutes les routes. L'utilisateur courant est lu
      via `@Req()` (`req.utilisateur`).
- [x] Couture (`test/admin-comptes.test.ts`) : liste sans hash ; création +
      connexion réussie ; identifiant dupliqué → 409 ; `PUT` nom/rôle/actif ;
      refus auto-désactivation, auto-rétrogradation, désactivation du dernier
      admin ; réinitialisation du mot de passe + connexion avec le nouveau ;
      `coordination` → 403 sur tout.
- [x] Couture D (`valider-reponse.test.ts`) : `CompteAdmin[]` passe ; `role`
      inconnu → lève ; s'assurer qu'aucun champ `motDePasse*` n'est présent dans
      la réponse `GET`.
