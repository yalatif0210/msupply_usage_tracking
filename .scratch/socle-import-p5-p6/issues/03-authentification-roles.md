# 03: Authentification — connexion, session, rôles, gardes

**What to build:** Tout écran et tout endpoint exige un utilisateur connecté. Un
utilisateur se connecte avec un identifiant et un mot de passe et reçoit une
session côté serveur ; la déconnexion la termine. Trois rôles existent —
`lecteur`, `coordination`, `admin` — et une garde les fait respecter : une
requête anonyme est rejetée, un `lecteur` ne peut pas atteindre une action
réservée à la `coordination`. Les comptes sont provisionnés par migration ; pas
d'auto-inscription. Le front affiche un écran de connexion et route un
utilisateur authentifié vers le tableau de bord.

**Blocked by:** 01

**Status:** done (commit ab6d538)

- [x] `POST /api/auth/connexion` accepte identifiant + mot de passe et pose un cookie `dqa_session` httpOnly ; `POST /api/auth/deconnexion` l'efface (204).
- [x] Garde globale : anonyme → 401 ; `@Roles([...])` → mauvais rôle 403. `@Public()` pour santé et connexion.
- [x] Rôles `lecteur` / `coordination` / `admin` modélisés ; migration 0010 seede un compte par rôle.
- [x] Front : service + garde d'auth, écran de connexion, redirection vers `/connexion` pour toute route protégée non authentifiée ; proxy dev `/api`.
- [x] Mots de passe hachés (scrypt, `node:crypto`) — hash seedé, jamais de clair en base.
- [x] 6 tests d'intégration (base éphémère) : anonyme 401, santé publique 200, mauvais mot de passe 401, cookie httpOnly, /moi puis déconnexion → 401, garde de rôle lecteur 403 / coordination 200.
