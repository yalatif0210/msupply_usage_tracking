# 07: Liste des sites re-stylée

**What to build:** l'écran `/sites` prend le registre shadcn-admin : tableau
triable propre, badges de classification cohérents. La mécanique des filtres
(déjà migrée) reste sans clignotement.

**Blocked by:** 03, 05

**Status:** done (fusionné dans master)

- [ ] `liste-sites` en `table` spartan : en-tête discret (`text-xs`,
      `text-muted-foreground`), lignes hautes, survol.
- [ ] Tri par colonne conservé.
- [ ] `badge-classification` rendu via le `badge` spartan, couleur toujours
      doublée du libellé ; badge « n/6 piliers » discret quand la couverture
      est partielle.
- [ ] Filtres district / programme au style spartan ; comportement inchangé
      (district = client instantané, programme = refetch non bloquant, URL
      suit).
- [ ] `n/d` pour toute valeur absente ; aucun tiret long.
- [ ] Captures Playwright ; `ng build` + typecheck verts ;
      `conventions-source.test.ts` verte.
