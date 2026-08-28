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

**Status:** ready-for-agent

- [ ] Un endpoint de connexion accepte identifiant + mot de passe et renvoie une session (cookie httpOnly) ; un endpoint de déconnexion l'efface.
- [ ] Une garde de rôle protège les routes : anonyme → 401, mauvais rôle → 403.
- [ ] Les rôles `lecteur` / `coordination` / `admin` sont modélisés ; une migration seede au moins un compte par rôle.
- [ ] L'écran de connexion du front authentifie et redirige ; une visite non authentifiée d'une route du tableau de bord atterrit sur la connexion.
- [ ] Les mots de passe sont stockés hachés (jamais en clair).
- [ ] Tests : la garde passe pour le bon rôle et échoue pour l'anonyme et le mauvais rôle.
