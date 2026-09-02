# 01: Socle spartan/ui + Tailwind + thème

**What to build:** la chaîne d'outils visuelle est en place et prouvée, sans
qu'aucun écran ne change encore d'aspect. Un développeur peut importer un
composant spartan, une icône lucide et un graphe ApexCharts, et `ng build`
reste vert.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

### Prérequis — montée de version Angular

spartan/ui 1.x exige **Angular ≥ 21** (`@spartan-ng/brain` :
`@angular/core >=21 <23`, `@angular/cdk >=21`). `apps/web` est sur Angular 20.
`lucide-angular@1.0.0` plafonne à Angular 21 ; `ng-apexcharts@3` demande
`>=20`. **Angular 21** lève tous les blocages : c'est la cible.

- [ ] `apps/web` monté de Angular 20 → **21** (`@angular/core`, `common`,
      `compiler`, `forms`, `platform-browser`, `router`, `@angular/build`,
      `@angular/cli`, `@angular/compiler-cli`).
- [ ] `@angular/cdk@21` ajouté (dépendance de `@spartan-ng/brain`).
- [ ] TypeScript bump `~5.8` → `~5.9` sur tout le dépôt (racine, `apps/api`,
      `apps/web`, `packages/contracts`) — Angular 21 exige `>=5.9 <6.0`.
- [ ] Aucune régression : `ng build -w @dqa/web`, `typecheck` des trois
      workspaces, `npm test` (contrats + web), suite API (169) — tous verts.
- [ ] Aucun changement visuel ni fonctionnel dû à l'upgrade.

### Socle spartan / Tailwind / graphes

- [ ] Tailwind v4 intégré au build Angular 21 (support natif de
      `@angular/build@21`, peer `tailwindcss ^4`).
- [ ] `@spartan-ng/brain` installé ; composants Helm **copiés à la main**
      depuis le dépôt spartan (MIT) — le CLI spartan est un générateur nx, or
      DQA est en npm workspaces. Le socle UI de `CLAUDE.md §3` est respecté.
- [ ] `ng-apexcharts` (+ `apexcharts`) et `lucide-angular` installés.
- [ ] `theme.css` : jetons shadcn (base `slate`, oklch), `--primary` forcé à
      `#1f6fd6`, `--chart-1..5` disponibles, bloc `.dark` présent mais aucun
      sélecteur de thème.
- [ ] Couleurs de statut (CONFORME / ALERTE / NON_CALCULABLE) et classification
      PARTIELLEMENT CONFORME conservées, hors palette du thème.
- [ ] Inter auto-hébergée, aucune requête externe au démarrage.
- [ ] `styles.css` réduit à l'entrée Tailwind + import `theme.css` + police.
- [ ] Budget `angular.json` relevé pour absorber Tailwind + spartan +
      ApexCharts + lucide.
- [ ] Composants Helm copiés : `button`, `card`, `badge`, `table`, `tabs`,
      `select`, `dropdown-menu`, `tooltip`, `dialog`, `input`, `label`,
      `separator`, `skeleton`.
- [ ] Smoke sous zoneless : un `Button` spartan, une icône lucide et un graphe
      ApexCharts trivial rendus et vérifiés à l'écran (capture) ; toute
      incompatibilité zoneless est signalée dans les commentaires du ticket.
- [ ] `ng build` + `npm run typecheck -w @dqa/web` verts ; suite API inchangée.
