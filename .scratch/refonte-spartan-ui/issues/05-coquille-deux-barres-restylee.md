# 05: Coquille deux barres re-stylée

**What to build:** la coquille de la console prend le registre shadcn-admin —
deux barres horizontales, aucune barre latérale — et reste utilisable sur
écran étroit.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `ui/coquille` re-stylée en Tailwind + composants spartan, jetons du thème
      uniquement.
- [ ] Barre 1 (`--primary`) : titre à gauche ; à droite, menu compte en
      `dropdown-menu` spartan (nom, rôle, Déconnexion).
- [ ] Barre 2 (`--card`, bordure basse) : navigation de sections filtrée par
      rôle ; onglet actif souligné `--primary`.
- [ ] Écran étroit : les deux barres s'empilent, la navigation se replie en
      `dropdown-menu` (motif `TopNav` de shadcn-admin).
- [ ] Icônes lucide.
- [ ] Aucun sélecteur global (mois, programme) dans les barres.
- [ ] Captures Playwright : large et étroit.
- [ ] `ng build` + typecheck verts ; `conventions-source.test.ts` verte.
