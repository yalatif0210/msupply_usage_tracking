# 01: Socle spartan/ui + Tailwind + thème

**What to build:** la chaîne d'outils visuelle est en place et prouvée, sans
qu'aucun écran ne change encore d'aspect. Un développeur peut importer un
composant spartan, une icône lucide et un graphe ApexCharts, et `ng build`
reste vert.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Tailwind v4 + preset spartan (`hlm-tailwind-preset`) intégrés au build
      Angular ; `spartan init` exécuté.
- [ ] `ng-apexcharts` et `lucide-angular` installés ; le socle UI de
      `CLAUDE.md §3` est respecté (rien d'autre).
- [ ] `theme.css` : jetons shadcn (base `slate`, oklch), `--primary` forcé à
      `#1f6fd6`, `--chart-1..5` disponibles, bloc `.dark` présent mais aucun
      sélecteur de thème.
- [ ] Couleurs de statut (CONFORME / ALERTE / NON_CALCULABLE) et classification
      PARTIELLEMENT CONFORME conservées, hors palette du thème.
- [ ] Inter auto-hébergée, aucune requête externe au démarrage.
- [ ] `styles.css` réduit à l'entrée Tailwind + import `theme.css` + police.
- [ ] Budget `angular.json` relevé pour absorber Tailwind + spartan +
      ApexCharts + lucide.
- [ ] Composants Helm copiés dans le dépôt : `button`, `card`, `badge`,
      `table`, `tabs`, `select`, `dropdown-menu`, `tooltip`, `dialog`, `input`,
      `label`, `separator`, `skeleton`.
- [ ] Smoke sous zoneless : un `Button` spartan, une icône lucide et un graphe
      ApexCharts trivial rendus quelque part et vérifiés à l'écran ; toute
      incompatibilité zoneless est signalée dans les commentaires du ticket.
- [ ] `ng build` + `npm run typecheck -w @dqa/web` verts ; suite API inchangée.
