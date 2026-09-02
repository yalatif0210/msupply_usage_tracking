# Adoption de spartan/ui ; `DESIGN_SYSTEM.md` réécrit ; remplace l'ADR 0006

**Contexte.** L'ADR 0006 (2026-08) a retenu un schéma chromatique StarAdmin
recréé en jetons CSS maison, **sans aucune librairie d'UI ni de graphes** :
HTML + CSS natif, SVG inline. Six tranches (15 tickets) ont livré sur cette
base : coquille à deux barres, tableau de bord national, fiche site analytique
avec radar et courbes en SVG maison. En revue, deux limites : (1) réimplémenter
à la main chaque primitive (Select, Dialog, Tabs, Table triable, Tooltip) est
lent et inégal ; (2) les graphes SVG maison rognent les légendes et les
libellés d'axe — inacceptable en projection. La coordination a fourni le
template **shadcn-admin** (React) comme cible visuelle.

**Décision.** Le front adopte **spartan/ui**, le portage Angular de shadcn/ui :
primitives « Brain » sur Angular CDK + composants « Helm » copiés dans le
dépôt. Cela impose **Tailwind CSS v4** et ses compagnons spartan (`clsx`,
`tailwind-merge`, `class-variance-authority`, `tw-animate-css`). Les graphes
passent à **ApexCharts** (`ng-apexcharts` + `apexcharts`), les icônes à
**lucide** (`@ng-icons/lucide` + `@ng-icons/core`), la police à **Inter**
(`@fontsource/inter`, auto-hébergée). Le socle UI devient une **liste fermée**
(`CLAUDE.md §3`) ; au-delà, un ADR.

On **garde** de l'ADR 0006 : la coquille à deux barres horizontales **sans
barre latérale** ; le **mode clair unique** ; les couleurs de statut calibrées
pour la projection ; l'interdiction du tiret long.

On **abandonne** : les jetons StarAdmin, l'interdiction des librairies
d'UI / graphes, le « tout en SVG inline maison », l'interdiction des ombres
portées (l'ombre `xs` de shadcn est autorisée).

Les jetons de thème sont ceux de shadcn (base `slate` : `--background`,
`--muted`, `--border`, `--ring`, `--chart-1..5`, échelle de rayon). Seul
`--primary` est forcé à un bleu lisible en projection (`#1f6fd6`, l'ancien
`--accent`) au lieu du quasi-noir de shadcn. `DESIGN_SYSTEM.md` est réécrit.

**Pourquoi.** spartan/ui donne l'esthétique shadcn-admin sans la réécrire :
composants accessibles éprouvés (CDK), possédés dans le dépôt (pas de boîte
noire à suivre), langage de thème documenté. ApexCharts est la seule
bibliothèque de graphes Angular qui revendique la compatibilité zoneless et
gère proprement légendes et axes. Le coût — reprendre la coquille, chaque écran
et les composants `ui/*` livrés cette semaine — est réel mais **circonscrit au
front** : l'API, les contrats et le SQL ne bougent pas. Cloner shadcn-admin tel
quel (React, TanStack Router, Clerk) aurait imposé une réécriture complète du
front pour un gain nul par rapport à spartan/ui. Rester sur l'ADR 0006 aurait
figé la lenteur d'implémentation et les graphes illisibles.

**Prérequis technique.** spartan/ui 1.x exige **Angular ≥ 21**
(`@spartan-ng/brain` : `@angular/core >=21 <23`, `@angular/cdk >=21`).
`apps/web` était sur Angular 20 : le ticket 01 monte `apps/web` en Angular 21,
avec un bump TypeScript `~5.8` → `~5.9` et vitest `3` → `4` sur tout le dépôt.
NestJS n'est pas concerné. Le CLI spartan fonctionne en mode Angular CLI
(`ng g @spartan-ng/cli:init` / `:ui`, non interactif) : il copie les composants
Helm dans `apps/web/src/app/ui/spartan/` avec les utilitaires Tailwind inlinés
et pose les alias `@spartan-ng/helm/*` dans `tsconfig`. Les icônes passent par
`@ng-icons/lucide` (le wrapper qu'attendent les composants Helm) ; Tailwind v4
demande un `.postcssrc.json` avec `@tailwindcss/postcss`.

**Conséquence.** `CLAUDE.md` (§2, §3, §8) et `DESIGN_SYSTEM.md` sont mis à jour
dans la même passe que cet ADR ; l'implémentation suit en 12 tickets
(`.scratch/refonte-spartan-ui/`), une branche par ticket. L'ADR 0006 reçoit un
bandeau « Remplacé par l'ADR 0008 » ; sa décision reste l'historique de la
période StarAdmin. Les composants `ui/radar`, `ui/courbe-series`,
`ui/mini-courbe` seront remplacés par ApexCharts ; `ui/badge-classification`,
`ui/badge-statut` et `ui/repartition-classification` par des primitives
spartan ; `ui/coquille` est **conservé** et re-stylé (Tailwind +
`dropdown-menu`). Le test `apps/web/src/app/typographie.test.ts` reste (élargi
au ticket 02). Nouvelle règle transverse
(`DESIGN_SYSTEM.md §10`) : un changement de filtre ne recharge jamais la vue
entière et reflète son état dans l'URL. Le template `shadcn-admin` est extrait
dans `docs/reference/shadcn-admin/` (gitignoré) comme référence visuelle
pendant l'implémentation, puis supprimé.
