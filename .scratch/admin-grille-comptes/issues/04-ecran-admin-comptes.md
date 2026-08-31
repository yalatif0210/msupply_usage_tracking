# 04: Écran `/admin/comptes`

**What to build:** l'écran de l'administrateur pour gérer les comptes.

**Blocked by:** 03

**Status:** done (branche `admin-grille-comptes`)

- [x] Route `/admin/comptes` (`gardeRole(['admin'])`), lazy-loaded. Lien
      « Comptes » dans `ui/entete`, visible pour `admin` uniquement.
- [x] `core/admin-comptes.service.ts` : `lister()`, `creer(entree)`,
      `modifier(id, maj)`, `reinitialiserMotDePasse(id, motDePasse)` ;
      `validerReponse` sur la liste.
- [x] `pages/admin-comptes.ts` : tableau des comptes (identifiant, nom, rôle,
      actif) ; « Nouveau compte » (identifiant, nom, rôle, mot de passe) ; par
      ligne : édition nom + rôle, bascule actif/inactif, action « réinitialiser
      le mot de passe » (saisie + confirmation).
- [x] Les actions interdites pour l'utilisateur courant (se désactiver, se
      rétrograder) sont **désactivées côté front** en plus du refus serveur ;
      le message serveur (dernier admin, identifiant pris) est affiché.
- [x] `typecheck` + `ng build` OK.
- [x] Mettre à jour `docs/guide_module_auth.md` (rôles, écrans) et créer
      `docs/guide_module_admin.md` (grille + comptes) — CLAUDE.md §7.
