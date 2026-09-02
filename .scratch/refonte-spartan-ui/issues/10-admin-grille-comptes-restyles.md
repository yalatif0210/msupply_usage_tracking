# 10: Écrans admin — grille et comptes re-stylés

**What to build:** les écrans `/admin/grille` et `/admin/comptes` prennent le
registre shadcn-admin, avec des formulaires cohérents.

**Blocked by:** 05

**Status:** done (fusionné dans master)

- [ ] `admin-grille` : édition de la grille de paramètres sur `input` /
      `select` spartan, `table` spartan ; le recalcul de la somme des poids
      reste client (aucun rechargement).
- [ ] `admin-comptes` : liste et création de comptes sur `table`, `input`,
      `dialog` spartan ; réinitialisation de mot de passe et
      activation / désactivation au style spartan.
- [ ] Retours (succès / erreur) via `sonner` (toasts) spartan.
- [ ] Gardes de rôle inchangées.
- [ ] `n/d` pour les valeurs absentes ; aucun tiret long.
- [ ] Captures Playwright ; `ng build` + typecheck verts ;
      `conventions-source.test.ts` verte.
