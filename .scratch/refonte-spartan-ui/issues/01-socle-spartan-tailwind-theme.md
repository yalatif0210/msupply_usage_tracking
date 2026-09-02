# 01: Socle spartan/ui + Tailwind + thème

**What to build:** la chaîne d'outils visuelle est en place et prouvée, sans
qu'aucun écran ne change encore d'aspect. Un développeur peut importer un
composant spartan, une icône lucide et un graphe ApexCharts, et `ng build`
reste vert.

**Blocked by:** None (can start immediately)

**Status:** done

### Montée de version Angular

spartan/ui 1.x exige **Angular ≥ 21** (`@spartan-ng/brain` :
`@angular/core >=21 <23`, `@angular/cdk >=21`).

- [x] `apps/web` monté de Angular 20 → **21** (core, common, compiler, forms,
      platform-browser, router, `@angular/build`, `@angular/cli`,
      `@angular/compiler-cli`).
- [x] `@angular/cdk@21` ajouté.
- [x] TypeScript `~5.8` → `~5.9` sur tout le dépôt ; vitest `3` → `4`
      (Angular 21 exige vitest 4) ; `unplugin-swc` bump.
- [x] Aucune régression : `ng build -w @dqa/web`, typecheck des 3 workspaces,
      43 tests front, **169 tests API** — tous verts.
- [x] Aucun changement visuel ni fonctionnel dû à l'upgrade.

### Socle spartan / Tailwind / graphes

- [x] Tailwind v4 : `spartan/cli:init` + `.postcssrc.json`
      (`@tailwindcss/postcss`), preset `@spartan-ng/brain/hlm-tailwind-preset`.
- [x] Composants Helm via `ng g @spartan-ng/cli:ui` (mode Angular CLI, non
      interactif via `components.json`) dans `src/app/ui/spartan/`, alias
      `@spartan-ng/helm/*` : `button`, `card`, `badge`, `table`, `tabs`,
      `select`, `dropdown-menu`, `tooltip`, `dialog`, `input`, `label`,
      `separator`, `skeleton`, `sonner`. `forwardRef` appliqué à
      `hlm-dropdown-menu-radio` / `-checkbox` (useExisting auto-référent).
- [x] `ng-apexcharts` + `apexcharts` ; `@ng-icons/lucide` + `@ng-icons/core`
      (pas `lucide-angular` : c'est le wrapper qu'attend spartan Helm).
- [x] Jetons de thème shadcn (base slate) dans `styles.css` ; `--primary`
      forcé à `#1f6fd6` ; `--chart-1..5` exposés ; bloc `.dark` présent, aucun
      sélecteur de thème.
- [x] Couleurs de statut et classification conservées, hors palette du thème.
- [x] Inter auto-hébergée (`@fontsource/inter`), aucune requête externe.
- [x] `--accent` (marque, bleu) renommé `--marque` dans les 10 composants qui
      l'utilisaient, pour ne pas entrer en collision avec le `--accent` de
      shadcn. Bloc StarAdmin hérité conservé jusqu'au ticket 12.
- [x] Budget `angular.json` relevé (900 kb / 1.6 mb + `anyComponentStyle`).
- [x] Smoke sous zoneless : `hlmBtn` (défaut + outline, primaire `#1f6fd6`),
      `hlmBadge`, `hlmCard`, `<ng-icon name="lucideCircleCheck">`, `<apx-chart>`
      ligne — tous rendus et capturés (`smoke-socle-spartan.png`). Route
      `/_smoke` temporaire retirée. Aucune incompatibilité zoneless.
- [x] `ng build` + typecheck verts ; suite API inchangée.
