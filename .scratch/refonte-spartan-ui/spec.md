# Refonte visuelle sur spartan/ui

**Status:** ready-for-agent

Spec issue des sessions `/grill-with-docs` puis `/to-spec` des 2026-09-01 /
2026-09-02. Gouvernée par `docs/adr/0008-adoption-spartan-ui.md` (remplace
l'ADR 0006). Réécrit `CLAUDE.md` §2/§3/§8 et `DESIGN_SYSTEM.md` déjà faits
(commit `251bae7`).

---

## Problem Statement

La console vient d'être rebâtie (tranches « refonte analytique », 2026-08) sur
des jetons StarAdmin recréés à la main, en HTML + CSS natif et SVG inline, sans
aucune librairie d'UI. Trois gênes en découlent :

- **Chaque primitive est faite main.** Select, Dialog, Tabs, Table triable,
  Tooltip, Dropdown : réimplémentés un à un, c'est lent et le rendu est
  inégal d'un écran à l'autre.
- **Les graphes SVG maison rognent les légendes et les libellés d'axe.** Sur
  la fiche site, la courbe « par pilier » (6 séries) et le radar en mode 10
  sous-composantes deviennent illisibles quand l'écran est projeté en réunion.
- **Changer un filtre fait clignoter toute la page.** Sur `/sites/:id`, dans
  « Analyse fine », changer la période (`de` / `a`) rafraîchit la fiche entière
  comme un rechargement de page : les cartes de pilier disparaissent, « Chargement… »
  s'affiche, puis tout revient. Même effet au changement de mois sur la
  synthèse. C'est inconfortable et fait perdre le fil.

La coordination a fourni le template **shadcn-admin** comme cible visuelle.

## Solution

Reconstruire la couche visuelle du front sur **spartan/ui** — le portage
Angular de shadcn/ui — avec **Tailwind v4**, **ApexCharts** pour de vrais
graphes aux légendes toujours lisibles, **lucide** pour les icônes et **Inter**
pour la police. Recréer l'aspect de shadcn-admin.

- On **garde** la coquille à **deux barres horizontales, aucune barre
  latérale**, et le **mode clair uniquement**.
- Tout graphe porte une **légende complète, jamais tronquée** ; au-delà de 6
  séries elle passe sous le graphe et s'enroule.
- **Un changement de filtre ne fait jamais clignoter ni recharger la vue** : le
  contenu courant reste affiché pendant que la donnée se rafraîchit en
  arrière-plan ; seule une fine barre de progression signale l'attente, sur le
  panneau concerné et pas sur toute la page.
- L'API, les contrats `@dqa/contracts` et le SQL **ne bougent pas**.

## User Stories

1. En tant que membre de la coordination qui projette le tableau de bord en
   réunion, je veux que chaque graphe affiche sa légende complète et sans
   troncature, afin de nommer chaque série depuis le fond de la salle.
2. En tant que membre de la coordination, je veux que la courbe d'évolution
   « par pilier » (6 séries) reste lisible, afin de comparer les piliers d'un
   coup d'œil.
3. En tant qu'équipe district consultant une fiche site, je veux changer la
   période d'analyse sans que la fiche entière ne clignote, afin de garder le
   contexte (score composite, cartes de pilier) sous les yeux.
4. En tant qu'équipe district, je veux que seul le bloc « Analyse fine » montre
   un état d'attente quand je change la plage de mois, afin de comprendre ce
   qui se recharge.
5. En tant que membre de la coordination sur la synthèse nationale, je veux
   changer le mois PAQD sans rechargement de page, afin d'enchaîner les
   comparaisons mois à mois rapidement.
6. En tant qu'utilisateur, je veux qu'un changement de filtre district / région
   / programme laisse le tableau affiché pendant la mise à jour, afin de ne pas
   perdre ma position de lecture.
7. En tant qu'utilisateur, je veux qu'un filtre déjà satisfiable avec la donnée
   chargée (le district sur la liste des sites) s'applique instantanément, sans
   aller-retour serveur.
8. En tant qu'utilisateur, je veux pouvoir copier l'URL d'un écran filtré et la
   rouvrir plus tard (ou après F5) sur les mêmes filtres, afin de partager une
   vue précise.
9. En tant qu'utilisateur, je veux que le bouton « précédent » du navigateur
   ne me fasse pas remonter tout l'historique de mes changements de filtre.
10. En tant que membre de la coordination, je veux le registre visuel d'une
    vraie console d'administration (shadcn-admin), afin que l'outil inspire
    confiance en réunion.
11. En tant qu'utilisateur, je veux une coquille à deux barres horizontales
    sans barre latérale, afin de garder la largeur d'écran pour les données.
12. En tant qu'utilisateur sur écran étroit, je veux que la navigation de
    sections se replie proprement (menu déroulant), afin de rester utilisable
    sur portable.
13. En tant qu'utilisateur, je veux que le menu du compte (nom, rôle,
    déconnexion) soit un menu déroulant propre dans la barre 1.
14. En tant que membre de la coordination, je veux le tableau de bord national
    en cartes de statistiques nettes (chiffre, libellé, icône, delta), afin de
    lire l'état national en trois secondes.
15. En tant qu'utilisateur, je veux des tableaux triables au style shadcn
    (en-tête discret, lignes hautes, survol), afin de trier sans friction.
16. En tant qu'équipe district, je veux le radar « forces / faiblesses » d'un
    site en vrai graphe radar, avec les 6 ou 10 axes tous étiquetés lisiblement.
17. En tant qu'équipe district, je veux la courbe de progression d'un site en
    vrai graphe multi-séries, avec repères de seuil et trous préservés pour
    les mois sans donnée.
18. En tant qu'utilisateur, je veux les badges de statut (CONFORME / ALERTE /
    NON_CALCULABLE) au style shadcn, la couleur toujours doublée du libellé.
19. En tant qu'utilisateur qui projette, je veux que les couleurs de statut
    restent celles calibrées pour la projection, pas la palette neutre du thème.
20. En tant qu'utilisateur, je ne veux voir aucun tiret long dans la console
    (règle conservée de la refonte précédente).
21. En tant que développeur, je veux que les composants spartan soient copiés
    dans le dépôt (modèle Helm), afin de les posséder et de les éditer.
22. En tant que développeur, je veux une seule primitive de données asynchrone
    partagée, afin que « ne jamais vider la vue » soit structurel et pas une
    discipline page par page.
23. En tant que développeur, je veux qu'un test de garde échoue si une valeur
    Tailwind arbitraire (`bg-[#…]`) ou un littéral hex / oklch apparaît dans un
    composant, afin de garder « une couleur = un jeton ».
24. En tant que développeur, je veux que `ng build` et le typecheck restent
    verts à chaque tranche, afin de fusionner sans régression.
25. En tant qu'agent Claude Code, je veux une référence visuelle locale
    (`docs/reference/shadcn-admin/`), afin de recopier l'aspect écran par écran.
26. En tant qu'admin, je veux les écrans d'administration (grille, comptes,
    traceurs) reconstruits sur les composants de formulaire spartan, afin d'une
    saisie cohérente.
27. En tant qu'utilisateur, je veux l'écran de connexion au style shadcn-admin
    (carte centrée, champs spartan).
28. En tant que développeur, je veux que la migration ne touche ni l'API, ni
    les contrats, ni le SQL, afin de circonscrire le risque au front.
29. En tant qu'utilisateur, je veux le mode clair uniquement : pas de sélecteur
    de thème, la console est projetée en salle éclairée.
30. En tant que développeur, je veux qu'aucune animation d'entrée de graphe ni
    aucun dégradé ne réapparaisse, afin de respecter le registre sobre.
31. En tant qu'utilisateur, je veux que le premier chargement d'un écran (aucune
    donnée encore) puisse afficher un squelette, mais qu'un changement de filtre
    ne le fasse jamais.
32. En tant que développeur, je veux la police Inter auto-hébergée, afin
    qu'aucune requête externe ne parte au démarrage.

## Implementation Decisions

### Cadre

- **ADR 0008 fait autorité.** Aucune modification de `apps/api`,
  `packages/contracts`, `db/migrations`. Toute la spec est dans `apps/web`.
- Socle UI = liste fermée (`CLAUDE.md §3`) : spartan/ui (Tailwind v4 + Angular
  CDK), ApexCharts (`ng-apexcharts`), lucide (`lucide-angular`), Inter
  auto-hébergée. Rien d'autre sans nouvel ADR.
- Les composants Helm de spartan sont **copiés** dans `apps/web/src/app/ui/`
  via le CLI spartan ; on les édite, on ne les traite pas comme une dépendance
  à mettre à jour en masse.
- Angular reste zoneless, standalone, signals, `OnPush`. Pas de store tiers :
  la primitive de données (ci-dessous) s'appuie sur les signals et les services
  existants.

### Jetons de thème

- Jeu de jetons shadcn (base `slate`, oklch) dans un `theme.css` ; `--primary`
  **forcé à `#1f6fd6`** (ex-`--accent`, validé en projection). Bloc `.dark`
  généré mais **jamais activé** — aucun sélecteur de thème.
- Couleurs de statut CONFORME / ALERTE / NON_CALCULABLE et classification
  PARTIELLEMENT CONFORME **conservées** telles quelles, hors palette du thème.
- Palette de séries de graphe = `--chart-1..5` du thème (remplace
  `--serie-1..6`).
- `styles.css` réduit à l'entrée Tailwind + import `theme.css` + police.
- Le budget `angular.json` (`initial` 500 kb / 1 mb) sera relevé au T1 :
  Tailwind + spartan + ApexCharts + lucide le dépassent.

### Coquille

- `ui/coquille` **conservé**, re-stylé en Tailwind. Barre 1 : titre + menu
  compte en `dropdown-menu` spartan (nom, rôle, Déconnexion). Barre 2 :
  navigation de sections, onglet actif souligné `--primary`.
- **Aucune barre latérale.** Écran étroit : la barre 2 se replie en
  `dropdown-menu` (motif `TopNav` de shadcn-admin) ; les deux barres s'empilent.

### Primitive de données asynchrone (couture centrale)

Un utilitaire partagé (nom indicatif : `core/ressource`) autour d'un appel de
service, qui :

- expose `valeur()` (dernière donnée connue) et `enCours()` (un refetch est en
  vol) ;
- **retient la valeur précédente pendant un refetch** — ne repasse jamais à
  `null` tant qu'une donnée existe ;
- déclenche le refetch sur changement d'une entrée réactive (filtres) ;
- **synchronise l'état de filtre dans l'URL en place** : mise à jour du query
  param via `replaceUrl` / `location.replaceState`, **sans** `router.navigate`
  vers la route, donc **sans** re-run des guards, **sans** ré-exécution du
  `loadComponent`, **sans** reset du scroll, **sans** entrée d'historique par
  frappe ;
- restaure l'état de filtre depuis l'URL au montage (déjà amorcé :
  `liste-sites` lit `queryParamMap`, `withComponentInputBinding()` est actif).

Le gabarit de comportement (issu du prototypage de la règle) :

```
au montage           : lire les filtres depuis l'URL → 1er fetch
                       (squelette autorisé, aucune donnée encore)
changement de filtre : valeur() garde l'ancienne donnée affichée
                       enCours() passe à true → barre de progression fine
                       URL query param remplacé en place
                       à l'arrivée : valeur() = nouvelle donnée, enCours() false
échec                : valeur() garde l'ancienne donnée + message d'erreur non bloquant
```

Toutes les pages à filtres passent par cette primitive.

### Sémantique des filtres, écran par écran

- **`liste-sites`** : charger la liste **complète** des sites une fois pour un
  `programmeId` donné. `district` = **filtre client** instantané. `programmeId`
  = refetch en arrière-plan (les scores diffèrent par programme).
- **`synthese`** : `mois` et `programmeId` = refetch en arrière-plan. `region`
  = refetch en arrière-plan (le client pur exigerait d'élargir le contrat
  `SyntheseNationale` — **hors périmètre**). L'onglet « Par pilier » /
  « Sous-composantes » = bascule client.
- **`detail-site`** : `de` / `a` / `programme` = refetch en arrière-plan ; seul
  le bloc « Analyse fine » montre l'attente ; le score composite et les cartes
  de pilier **restent en place**. `granularite`, `pilierCourbe`, bascule radar
  6/10, tri du tableau à plat = déjà client, inchangés.
- **`tableau-de-bord`** : pas de filtre (agrégat fixe du dernier mois).

### Affordance d'attente

Fine barre de progression en haut du **panneau concerné** + `aria-busy` sur ce
panneau. Jamais de spinner plein écran. Le squelette (`skeleton` spartan) n'est
autorisé qu'au tout premier chargement, quand aucune donnée n'existe encore.

### Graphes → ApexCharts

| Composant maison actuel | Remplacement ApexCharts |
|---|---|
| `ui/radar` | graphe `radar` (6 ou 10 axes, tous étiquetés) |
| `ui/courbe-series` | `line` multi-séries (repères de seuil en annotations, trous préservés) |
| `ui/mini-courbe` | `line` sparkline (`sparkline.enabled`) |

Règles (`DESIGN_SYSTEM §8`) : légende complète jamais tronquée ; au-delà de 6
séries la légende passe sous le graphe et s'enroule ; graduations d'axe en
rotation ou éclaircies plutôt que rognées ; palette `--chart-*` jamais les
couleurs de statut ; `chart.animations.enabled: false`.

### Autres composants

- `ui/badge-statut`, `ui/badge-classification` → `badge` spartan, `variant`
  mappé au statut, couleur doublée du libellé.
- `ui/repartition-classification` → **reste un `<div>` flex segmenté** en CSS,
  re-stylé ; ce n'est pas un graphe ApexCharts.
- Tableaux → `table` spartan (en-tête `text-xs` `text-muted-foreground`, lignes
  hautes, survol) ; tri conservé côté composant.
- Écrans admin / connexion → composants de formulaire spartan (`input`,
  `label`, `select`, `checkbox`, `dialog`, `sonner` pour les toasts).

### Garde de source

`typographie.test.ts` renommé `conventions-source.test.ts`, même mécanique de
scan de `apps/web/src`, trois assertions :

1. aucun tiret long (`—` `–` `−`) — inchangé ;
2. aucune valeur Tailwind arbitraire dans un template (`class` contenant
   `-[...]`, ex. `bg-[#123456]`, `w-[13px]`) ;
3. aucun littéral hex (`#rrggbb`) ni `oklch(` dans le `styles` d'un composant.

Liste d'exceptions explicite, vide au départ (les composants Helm copiés
peuvent en avoir besoin ponctuellement — chaque exception est justifiée).

### Découpage en tickets

12 tickets dans `.scratch/refonte-spartan-ui/issues/` (session `/to-tickets`,
2026-09-02). Une branche par ticket, `/code-review` deux axes, fusion `ff` vers
master, captures Playwright des écrans touchés.

**Les tickets indépendants se traitent en parallèle.** Frontière après le
ticket 01 : 02, 03, 04, 05 démarrent ensemble. Ensuite 06 (04 + 05), 07 et 08
(03 + 05), 09 (03 + 04 + 05), 10 et 11 (05) — tous parallélisables dès que
leurs bloqueurs sont fusionnés. 12 ferme la marche.

| # | Ticket | Bloqué par |
|---|---|---|
| 01 | Socle spartan/ui + Tailwind + thème | — |
| 02 | Garde de conventions de source élargie | 01 |
| 03 | Primitive `core/ressource` + recâblage des filtres | 01 |
| 04 | Composants de graphe ApexCharts | 01 |
| 05 | Coquille deux barres re-stylée | 01 |
| 06 | Tableau de bord national re-stylé | 04, 05 |
| 07 | Liste des sites re-stylée | 03, 05 |
| 08 | Synthèse re-stylée | 03, 05 |
| 09 | Fiche site re-stylée + graphes | 03, 04, 05 |
| 10 | Admin : grille + comptes | 05 |
| 11 | Admin : traceurs + journal imports + connexion | 05 |
| 12 | Nettoyage + docs + captures finales | 06, 07, 08, 09, 10, 11 |

## Testing Decisions

- **Un bon test assère un comportement externe.** Les composants Angular ne
  sont pas testés unitairement (règle du dépôt) : la fidélité structurelle
  passe par `ng build` + `npm run typecheck -w @dqa/web`, la fidélité visuelle
  par captures Playwright par écran.
- **La primitive `core/ressource` EST testée unitairement**, en environnement
  node, prior art `apps/web/src/app/core/valider-reponse.test.ts` :
  - retient la valeur précédente pendant un refetch (jamais `null` si une
    donnée existe) ;
  - `enCours()` vrai pendant le vol, faux à l'arrivée et sur échec ;
  - sur échec, la valeur précédente est conservée ;
  - la synchro URL écrit le query param **sans** déclencher de navigation
    (assertion sur un `Router` / `Location` mockés : `replaceState` appelé,
    `navigate` non appelé) ;
  - l'état de filtre est restauré depuis un query param au montage.
- **`conventions-source.test.ts`** — prior art : `typographie.test.ts` actuel
  (même scan récursif de `apps/web/src`, même style de rapport de lignes
  fautives).
- **`valider-reponse.test.ts` et `contracts-smoke.test.ts` restent verts** :
  aucun changement de contrat, aucune mise à jour de fixture attendue.
- **La suite API n'est pas touchée** (169 tests) : à faire tourner une fois en
  fin de tranche par sécurité, elle doit rester identique.
- **Par tranche** : `ng build` vert, typecheck vert, captures Playwright de
  **chaque** écran modifié committées à la revue, plus une vérification
  explicite — changer chaque filtre de l'écran ne vide ni ne fait clignoter la
  vue (le contenu précédent reste visible, seule la barre de progression
  bouge).

## Out of Scope

- Toute modification de `apps/api`, `packages/contracts`, `db/migrations`.
- Mode sombre, sélecteur de thème.
- Recherche globale ⌘K, `ConfigDrawer`, Clerk, TanStack Router — fonctions de
  shadcn-admin non reprises.
- Filtre région de la synthèse **entièrement** côté client (exigerait
  d'élargir le contrat `SyntheseNationale`).
- Barre latérale de navigation.
- Nouveaux écrans, nouvelles données, restructuration de l'information du
  tableau de bord (il garde ses blocs actuels, seulement re-stylés).
- Runner de test navigateur committé (Vitest browser / Playwright e2e).
- Migration de la logique métier ou des calculs vers le front.

## Further Notes

- spartan/ui 1.0 (stable, 55+ composants, Brain sur Angular CDK). La compat
  zoneless Angular 20 est à confirmer au T1 (spartan suit Angular récent) ;
  si un composant Brain pose problème, le signaler dans le ticket T1.
- `ng-apexcharts` revendique la compat zoneless et est testé sous
  `provideZonelessChangeDetection()` ; rendu SVG (net en projection).
- Cette migration **refait une grande partie** du travail visuel des tranches
  « refonte analytique » livrées la semaine du 2026-08-25. Coût acté dans
  l'ADR 0008.
- `shadcn-admin-1.0.0.zip` et `docs/reference/shadcn-admin/` sont locaux
  (gitignorés) ; à supprimer une fois `DESIGN_SYSTEM.md` validé par les
  captures (T8).
- La règle « un filtre ne recharge jamais la vue » et la synchro URL en place
  sont déjà écrites dans `CLAUDE.md §8` et `DESIGN_SYSTEM.md §10` (commit
  `251bae7`).
- Les 6 branches locales de l'ancienne refonte, toutes ancêtres de master,
  peuvent être supprimées avant de commencer.
