# DESIGN_SYSTEM.md — Console DQA mSupply

Registre visuel : **console d'administration**, dense en information, consultée
en réunion et **projetée**. Recréée à partir du template **shadcn-admin**
(React) sur **spartan/ui** — le portage Angular de shadcn/ui. Décision et
compromis : `docs/adr/0008-adoption-spartan-ui.md` (remplace l'ADR 0006).

La lisibilité à distance prime : contrastes francs, chiffres clés généreux,
légendes de graphe complètes.

Interdits : dégradés, animation décorative, iconographie superflue, **tiret
long** (§10). Autorisés : ombre `xs` sur les surfaces, transitions courtes sur
repli / dépli.

**Mode clair uniquement.** Le bloc `.dark` généré par spartan reste dans
`theme.css` mais aucun sélecteur de thème n'est exposé : la console est
projetée en salle éclairée.

---

## 1. Socle : spartan/ui

- **Brain** (primitives sans style, sur Angular CDK) + **Helm** (composants
  stylés). Les composants Helm sont **copiés dans `apps/web/src/app/ui/spartan/`**
  par `ng g @spartan-ng/cli:ui` (mode Angular CLI, non interactif via
  `components.json`, `"style": "nova"`), avec les utilitaires Tailwind inlinés
  et les alias `@spartan-ng/helm/*` posés dans `tsconfig`. On les possède, on
  les édite, on ne les met pas à jour en masse.
- Tailwind CSS v4 (`.postcssrc.json` avec `@tailwindcss/postcss`) + preset
  `@spartan-ng/brain/hlm-tailwind-preset`. La fonction `hlm()` fusionne les
  classes (`clsx` + `tailwind-merge` + `class-variance-authority` +
  `tw-animate-css` : compagnons requis par spartan, cf. `CLAUDE.md §3`).
- Angular 21 zoneless, standalone, `ChangeDetectionStrategy.OnPush`, signals.
  Pas d'état global : services injectés et signals (pas de store tiers).

### Composants Helm

Posés (ticket 01) : `button`, `card`, `badge`, `table`, `tabs`, `select`,
`dropdown-menu`, `tooltip`, `dialog`, `input`, `label`, `separator`,
`skeleton`, `sonner` (toasts). Ajoutés au fil des tickets selon besoin
(`checkbox`, `radio-group`, `sheet`, `scroll-area`…) ; tout ajout est listé
ici. Coquille et navigation : §5.

### Ce qu'on ne prend pas de shadcn-admin

La barre latérale (§5), le mode sombre, la recherche ⌘K globale, le
`ConfigDrawer`, les polices multiples (Inter seule, §6), `recharts` (→
ApexCharts, §8), les dégradés (`faded-bottom`), Clerk.

---

## 2. Jetons de thème (`theme.css`)

Jetons shadcn (base `slate`), en oklch, sur `:root`. **Aucune valeur hex ou
oklch en dur dans un composant** : toujours un utilitaire Tailwind mappé au
thème (`bg-card`, `text-muted-foreground`, `border-border`…).

### Chrome

| Jeton | Rôle |
|---|---|
| `--background` / `--foreground` | fond général / texte |
| `--card` / `--card-foreground` | surfaces (cartes, tableaux, barres) |
| `--muted` / `--muted-foreground` | remplissages discrets / libellés, légendes |
| `--accent` / `--accent-foreground` | survol, sélection douce |
| `--border` | séparateurs, contours |
| `--input` | bordure de champ |
| `--ring` | anneau de focus (3px) |
| `--primary` / `--primary-foreground` | liens, onglet actif, bouton primaire, fond de la barre 1 |

**`--primary` est forcé à `#1f6fd6`** (l'ancien `--accent` StarAdmin, déjà
validé en projection) au lieu du quasi-noir de shadcn : un primaire sombre se
lit mal projeté et supprime l'affordance « lien / actif ».

Échelle de rayon shadcn : `--radius: 0.625rem`, dérivés `--radius-sm/md/lg/xl`.
Bouton / champ / badge = `sm` ; carte / dialogue = `lg`.

### Statuts — calibrés pour la projection, hors palette du thème

La couleur n'est **jamais seule** : toujours doublée d'un libellé texte.

| Statut | Fond | Texte |
|---|---|---|
| CONFORME | `--conforme-fond` `#e3f1e4` | `--conforme-texte` `#1b5e20` |
| ALERTE | `--alerte-fond` `#fde3e1` | `--alerte-texte` `#8a1c13` |
| NON_CALCULABLE | `--nc-fond` `#ececec` | `--nc-texte` `#4a4a4a` |

Classification de site : CONFORME → vert, PARTIELLEMENT CONFORME →
`--partiel-fond` `#fff3d6` / `--partiel-texte` `#7a5200`, NON CONFORME → rouge.

### Graphes

`--chart-1` … `--chart-5` (jetons shadcn) pour les séries. Au-delà de cinq
séries, on cycle. Ces jetons remplacent les anciens `--serie-1..6`.

---

## 3. Tailwind

- Utilitaires mappés au thème uniquement. **Pas de valeur arbitraire**
  (`bg-[#…]`, `w-[13px]`, `text-[15px]`) : si le besoin n'existe pas dans
  l'échelle, on l'ajoute au thème, on ne le bricole pas dans le template.
- Ordre des classes : `prettier-plugin-tailwindcss`.
- Les styles spécifiques à un composant vivent dans son template (classes
  utilitaires). `styles.css` ne porte que l'entrée Tailwind + preset spartan,
  l'import de `theme.css`, la police, et la couche `@layer base` (reset,
  `cursor`, et une compat transitoire pour les écrans non migrés, retirée au
  ticket 12). Les jetons vivent dans `theme.css`.
- `prettier-plugin-tailwindcss` n'est pas encore installé : l'ordre des classes
  suit la convention shadcn à la main jusqu'à ce qu'il le soit.

---

## 4. Typographie

- **Inter**, auto-hébergée (`@fontsource`/woff2 vendu) : aucune requête
  externe, démarrage sans FOUT.
- Base `14px` (`text-sm` de shadcn). Échelle 12 / 13 / 14 / 16 / 18.
- Titres : `h1` 700, `h2`–`h6` 600 ; `tracking-tight` sur les titres.
- **Chiffres clés** : `text-2xl` minimum, `font-bold`, `tabular-nums` pour
  l'alignement en colonne.

---

## 5. Coquille : deux barres horizontales

`ui/coquille` est le seul point d'entrée de la navigation. **Aucune barre
latérale** — on écarte volontairement la sidebar de shadcn-admin (ADR 0008,
héritée d'ADR 0006).

- **Barre 1** (texte `--primary-foreground` sur `--primary`) : titre à gauche ;
  nom + rôle de l'utilisateur et Déconnexion à droite (spartan `dropdown-menu`).
- **Barre 2** (`--card`, bordure basse) : navigation de sections, filtrée par
  rôle ; onglet actif souligné à `--primary`.
- **Aucun sélecteur global** (mois, programme, plage) dans les barres : chaque
  écran porte ses filtres dans son `<main>`.
- Écran étroit : les barres s'empilent ; la navigation passe à la ligne (ou
  bascule en `dropdown-menu`, comme le `TopNav` de shadcn-admin).
- Contenu : largeur max `72rem`, centré, gouttière `1.5rem`.

---

## 6. Espacement et grille

- Échelle Tailwind par défaut (base `0.25rem`). Marge de carte `1rem`,
  gouttières `1rem`.
- Tableaux : lignes hautes, zébrage léger (`--muted`), en-tête collant,
  en-tête `text-xs` `text-muted-foreground` `font-medium`.
- Cartes de stat : grille `sm:grid-cols-2 lg:grid-cols-4` ; en-tête = titre
  `text-sm font-medium` + icône lucide `size-4 text-muted-foreground` ; corps =
  chiffre `text-2xl font-bold` + delta `text-xs text-muted-foreground`.

---

## 7. Composants métier

- **Carte de pilier** : libellé, valeur mesurée en grand, seuil en secondaire,
  badge de statut. Pas de bordure colorée : le badge porte la couleur.
- **Badge de statut** : spartan `badge` (`variant` mappé au statut), pastille +
  libellé, coins `sm`, jamais rond.
- **Badge « n piliers sur 6 »** : `badge` neutre discret, visible tant que la
  couverture est partielle.
- **Barre de répartition** (classifications d'un ensemble de sites) : `<div>`
  flex segmenté en CSS, **pas un graphe** ApexCharts ; chaque segment doublé
  d'une légende chiffrée.
- **État vide** : phrase explicite (« Aucun import n'a encore été traité pour
  ce site »), jamais une page en erreur ni un tableau vide muet.

---

## 8. Graphes — ApexCharts

`ng-apexcharts` (standalone, signal inputs, compatible zoneless). Remplace les
composants SVG maison `ui/radar`, `ui/courbe-series`, `ui/mini-courbe`.

| Usage | Type ApexCharts |
|---|---|
| Progression d'un score dans le temps | `line` (ou `area` discret) |
| Forces / faiblesses d'un site | `radar` |
| Aperçu compact dans une carte / cellule | `line` sparkline (`sparkline.enabled`) |
| Comparaison par catégorie | `bar` |

### Règles de lisibilité (non négociables — projection)

- **Légende toujours complète, jamais tronquée.** Les libellés de séries et les
  graduations d'axe ne sont jamais rognés : rotation ou éclaircissage des
  graduations plutôt que débordement.
- Au-delà de **6 séries**, la légende passe **sous** le graphe et s'enroule.
- La couleur (`--chart-1..5`) est **toujours doublée** par la légende ou un
  libellé direct.
- Palette de séries = jetons `--chart-*` du thème, jamais les couleurs de
  statut (une courbe « par pilier » n'est ni conforme ni en alerte).
- Repères de seuil (65 / 75 / 90…) en annotations pointillées `--muted-foreground`.
- Un mois sans donnée reste un trou : on ne relie que des points consécutifs.
- Animations d'entrée désactivées (`chart.animations.enabled: false`).

---

## 9. Icônes

**lucide** via **`@ng-icons/lucide`** + `@ng-icons/core` (`<ng-icon>`,
`provideIcons`) : c'est le wrapper qu'attendent les composants Helm de spartan.
Tree-shakeable (un import nommé par icône). Taille par défaut `size-4` ; couleur
`currentColor` ou `text-muted-foreground`. Une icône ne remplace jamais un
libellé sur un élément d'action.

---

## 10. Interactions — filtres

Un changement de filtre (`select`, onglet, case, champ de recherche) :

- **ne démonte jamais la vue** et n'affiche **jamais** de spinner plein écran ;
- **filtrage côté client** quand la donnée nécessaire est déjà chargée (ex.
  région / district sur la synthèse si tous les grains sont chargés d'un coup) ;
- sinon **requête en arrière-plan**, le contenu courant restant visible ;
- affordance d'attente = **barre de progression fine** en haut de la zone
  concernée + `aria-busy` sur le panneau, rien de plus ;
- l'état des filtres est reflété dans l'**URL** (query params) — lien
  partageable, survit à F5 — **sans** navigation qui remonte le composant.

S'applique à **tout** contrôle de filtre, pas seulement aux `<select>`.

---

## 11. Ponctuation

**Aucun tiret long dans la console** : ni cadratin `—` (U+2014), ni
demi-cadratin `–` (U+2013), ni signe moins typographique `−` (U+2212). Test de
garde : `apps/web/src/app/conventions-source.test.ts`.

| Cas | Remplacement |
|---|---|
| Valeur absente (`{{ x ?? … }}`) | `n/d` (`VALEUR_ABSENTE`) |
| Grandeur sans objet | `s/o` (`SANS_OBJET`) |
| Séparateur de titre (« P1 … Complétude ») | point médian `·` |
| Apposition en ligne | deux-points |
| Delta négatif | trait d'union `-3 pts` (la couleur porte le sens) |

Pas de référence à un numéro d'ADR ou de décision dans les textes d'écran.
