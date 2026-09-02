# 11: Écrans traceurs, journal d'imports et connexion re-stylés

**What to build:** les écrans `/admin/traceurs`, `/imports` et `/connexion`
prennent le registre shadcn-admin.

**Blocked by:** 05

**Status:** done (fusionné dans master)

- [ ] `admin-traceurs` : gestion des produits traceurs sur `table` / `input` /
      `checkbox` spartan.
- [ ] `journal-imports` : journal des lots d'import en `table` spartan, badges
      de statut spartan, état vide explicite.
- [ ] `connexion` : carte centrée au style shadcn-admin (titre, sous-titre,
      champs `input` / `label` spartan, bouton pleine largeur), message
      d'erreur non bloquant en `alert` spartan.
- [ ] Retours via `sonner` où c'est pertinent.
- [ ] `n/d` pour les valeurs absentes ; aucun tiret long.
- [ ] Captures Playwright ; `ng build` + typecheck verts ;
      `conventions-source.test.ts` verte.
