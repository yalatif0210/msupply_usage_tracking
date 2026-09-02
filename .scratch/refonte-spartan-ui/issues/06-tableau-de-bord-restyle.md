# 06: Tableau de bord national re-stylé

**What to build:** la page d'accueil `/` prend le registre shadcn-admin :
l'état national se lit en trois secondes, cartes de statistiques nettes et
courbe de progression en vrai graphe.

**Blocked by:** 04, 05

**Status:** done (fusionné dans master)

- [ ] Cartes de stat spartan (`card`) : chiffre en grand (`tabular-nums`),
      libellé, icône lucide, delta en secondaire ; grille
      `sm:grid-cols-2 lg:grid-cols-4`.
- [ ] Courbe « Progression nationale » via le composant sparkline / courbe
      ApexCharts (04).
- [ ] Barre de répartition des classifications : `<div>` flex segmenté
      re-stylé, chaque segment doublé d'une légende chiffrée (pas un graphe).
- [ ] Tableau « Sous-composantes en difficulté » en `table` spartan.
- [ ] Aucun filtre sur cette page (agrégat fixe du dernier mois) : comportement
      inchangé.
- [ ] Captures Playwright ; `ng build` + typecheck verts ;
      `conventions-source.test.ts` verte.
