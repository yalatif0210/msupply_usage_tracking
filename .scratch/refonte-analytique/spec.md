# Refonte analytique et visuelle du tableau de bord

Spec issue de la session `/grill-with-docs` du 2026-08-31. Couvre six demandes
liées : lecture par sous-composante, relibellé P4, purge typographique, courbes
d'évolution fines, diagramme en araignée par site, et adoption du registre
visuel StarAdmin.

## Problem Statement

La coordination et la DAP pilotent 40 sites sur six piliers PAQD. Aujourd'hui :

- On ne peut **lire finement que sur la fiche d'un site** : la synthèse
  nationale s'arrête au pilier, impossible de dire « quelle sous-composante
  fait décrocher le plus de sites » d'un coup d'œil.
- Le pilier P4 s'appelle **« Écart SDU produits traceurs »** alors qu'on
  n'affiche pas une amplitude d'écart mais un **taux de conformité** (part des
  produits dans la tolérance). Le libellé induit en erreur en réunion.
- La console est parsemée de **tirets cadratins** (`—`), y compris comme
  substitut de valeur manquante, ce qui nuit à la lecture à distance quand
  l'écran est projeté.
- On voit la **progression du score composite** d'un site sur un cycle, mais
  pas l'évolution **par pilier ni par sous-composante**, et pas sur une plage
  de mois choisie.
- Aucune vue ne présente en un écran les **points forts et faibles** d'un
  site (diagramme en araignée).
- L'habillage visuel est minimal ; la coordination veut le registre d'un
  vrai outil d'administration (référence : StarAdmin), avec une page
  d'accueil qui donne l'état national immédiatement.

## Solution

1. **Lecture par sous-composante partout.** Une vue nationale des dix
   sous-composantes (moyenne du taux d'atteinte du seuil, répartition
   CONFORME / ALERTE) en onglet de la synthèse ; un tableau à plat triable
   des dix sous-composantes sur la fiche site.
2. **P4 relibellé « Taux de conformité »** (libellé de pilier uniquement ;
   l'enum technique `ecart_sdu` / `ecart_consommation` ne bouge pas).
3. **Aucun tiret long dans la console** (`—` `–` `−`), remplacements définis
   ci-dessous ; retrait des citations d'ADR des textes d'écran.
4. **Courbes d'évolution fines** sur la fiche site : un widget SVG avec
   sélecteur de granularité (composite / par pilier / par sous-composante),
   piloté par un **sélecteur de plage de mois posé dans l'écran**.
5. **Diagramme en araignée** sur la fiche site : bascule 6 piliers ↔ 10
   sous-composantes, métrique = taux d'atteinte du seuil, plus une liste
   « forces / faiblesses » (3 + 3).
6. **Registre visuel StarAdmin recréé en composants maison** : schéma de
   couleurs, coquille à deux barres horizontales (aucune sidebar), page
   d'accueil `/` transformée en tableau de bord national dense, liste des
   sites déplacée sur `/sites`. Aucun fichier ni asset tiers importé ;
   graphes en SVG inline maison, aucune librairie.

Prérequis transverse : les **valeurs de sous-composante sont gelées mois par
mois** dans `hist_score_site`, comme les scores de pilier (ADR 0003), pour que
courbes et araignées historiques soient immuables.

## User Stories

1. En tant que coordination nationale, je veux une vue nationale des dix
   sous-composantes, afin d'identifier celle qui fait décrocher le plus de
   sites sans ouvrir chaque fiche.
2. En tant que coordination, je veux voir pour chaque sous-composante le
   nombre de sites CONFORME et ALERTE, afin de cibler l'accompagnement.
3. En tant que coordination, je veux que cette vue nationale respecte les
   filtres mois / programme / région de la synthèse, afin de croiser les axes.
4. En tant que membre de la DAP, je veux que la vue nationale par
   sous-composante affiche une moyenne comparable entre sous-composantes
   (taux d'atteinte du seuil, 0–100), afin de les classer sur une même échelle.
5. En tant qu'équipe district, je veux sur la fiche d'un site un tableau à
   plat de ses dix sous-composantes (valeur, seuil, écart au seuil, statut),
   afin de trier d'un clic les plus faibles.
6. En tant qu'équipe district, je veux que ce tableau se replie (comme le
   drill-down P4), afin de ne pas alourdir la fiche par défaut.
7. En tant que coordination, je veux que le pilier « Écart SDU produits
   traceurs » s'appelle « Taux de conformité » sur tous les écrans et dans la
   documentation, afin que le libellé reflète ce qui est mesuré.
8. En tant que développeur, je veux que le renommage n'affecte pas l'enum
   `sous_composante` en base ni les contrats Zod, afin d'éviter une migration
   et une refonte de contrat pour un simple libellé.
9. En tant qu'utilisateur qui projette le tableau de bord en réunion, je ne
   veux voir aucun tiret cadratin, demi-cadratin ni signe moins typographique
   dans l'interface.
10. En tant qu'utilisateur, je veux qu'une valeur absente s'affiche `n/d` et
    non `—`, afin de lever l'ambiguïté avec un séparateur.
11. En tant qu'utilisateur, je veux que les titres composés (« P1 · Complétude
    des transactions ») utilisent le point médian déjà employé dans les méta.
12. En tant qu'utilisateur, je veux qu'un delta négatif s'affiche `-3 pts`
    (trait d'union), la couleur portant déjà le sens.
13. En tant que lecteur, je ne veux voir aucune référence à un numéro d'ADR
    dans les textes d'écran.
14. En tant que développeur, je veux un test qui échoue si un tiret long
    réapparaît dans `apps/web/src`, afin de garder la règle dans le temps.
15. En tant que coordination, je veux voir l'évolution du score de chaque
    pilier d'un site dans le temps, pas seulement le composite.
16. En tant que coordination, je veux voir l'évolution d'une sous-composante
    donnée d'un site dans le temps, afin de savoir si un plan d'action porte.
17. En tant qu'analyste, je veux choisir la granularité de la courbe
    (composite / pilier / sous-composante d'un pilier choisi) dans un seul
    widget, afin de ne pas multiplier les graphiques.
18. En tant qu'analyste, je veux choisir la plage de mois affichée par les
    courbes, afin de regarder une fenêtre plus longue qu'un cycle.
19. En tant qu'analyste, je veux que le sélecteur de plage soit dans l'écran
    et non dans la barre de navigation, afin qu'il reste contextuel à la page.
20. En tant qu'analyste, je veux que la courbe « par sous-composante » soit
    cadrée à un pilier à la fois (au plus trois séries), afin qu'elle reste
    lisible.
21. En tant qu'analyste, je veux que l'axe Y des courbes fines soit le taux
    d'atteinte du seuil (0–100), avec des repères à 65 / 75 / 90, afin que la
    hauteur ait un sens comparable.
22. En tant que coordination, je veux un diagramme en araignée par site
    montrant ses six piliers, afin de voir sa forme (forts / faibles) d'un
    coup d'œil.
23. En tant qu'analyste, je veux basculer ce diagramme vers les dix
    sous-composantes, afin de descendre au niveau fin.
24. En tant qu'utilisateur, je veux que chaque axe du diagramme soit coloré
    selon le statut CONFORME / ALERTE, afin que la couleur double la position.
25. En tant que coordination, je veux sous le diagramme une liste des trois
    sous-composantes les plus loin sous le seuil et des trois avec le plus de
    marge, afin d'avoir l'identification explicite et pas seulement la forme.
26. En tant qu'analyste, je veux que le diagramme suive la plage de mois
    choisie et montre le dernier mois de cette plage, afin de rester cohérent
    avec les courbes.
27. En tant que coordination, je veux que la page d'accueil soit un tableau de
    bord national, afin d'avoir l'état d'ensemble sans naviguer.
28. En tant que coordination, je veux sur cette page des tuiles clés (nombre
    de sites du périmètre, score composite moyen, répartition des
    classifications, nombre de sites sans mesure).
29. En tant que coordination, je veux sur cette page une mini-courbe de la
    progression nationale du score composite moyen.
30. En tant que coordination, je veux sur cette page les cinq sous-composantes
    qui mettent le plus de sites en ALERTE, afin de prioriser.
31. En tant qu'utilisateur, je veux un lien clair « Voir les 40 sites » vers
    `/sites`, afin de retrouver la liste.
32. En tant qu'utilisateur habitué, je veux que la liste des sites reste
    accessible à une URL stable (`/sites`).
33. En tant qu'utilisateur, je veux une coquille à deux barres horizontales :
    une barre de titre et compte, une barre de navigation de sections.
34. En tant qu'utilisateur, je ne veux aucune barre latérale.
35. En tant qu'utilisateur, je veux que les filtres (mois, plage, programme,
    région) restent dans les écrans et jamais dans les barres.
36. En tant qu'utilisateur selon mon rôle, je veux que la barre de navigation
    ne montre que les sections auxquelles j'ai droit (Grille pour
    coordination, Comptes pour admin, Traceurs pour coordination et admin).
37. En tant qu'administrateur, je veux disposer d'un compte capable de créer,
    modifier et désactiver les utilisateurs (déjà en place ; confirmé hors
    périmètre de développement).
38. En tant que responsable du produit, je veux que le schéma de couleurs
    reprenne celui de StarAdmin, recréé en tokens maison.
39. En tant que responsable du produit, je veux qu'aucun fichier SCSS ni asset
    (logo, illustration) de StarAdmin n'entre dans le dépôt.
40. En tant que développeur, je veux que `DESIGN_SYSTEM.md` soit réécrit pour
    décrire le nouveau registre (palette, deux barres, page d'accueil,
    graphes SVG étendus, règle « aucun tiret long »).
41. En tant que développeur, je veux un ADR qui explique pourquoi on adopte le
    registre StarAdmin en rupture avec le design system initial.
42. En tant que développeur, je veux un ADR qui explique le gel des valeurs de
    sous-composante.
43. En tant que coordination, je veux que les scores et valeurs déjà gelés ne
    changent jamais, même après le gel des sous-composantes (ADR 0003).
44. En tant que développeur, je veux que `rafraichir_et_geler` fige les dix
    valeurs de sous-composante en même temps que les scores de pilier.
45. En tant que coordination, je veux que les mois déjà importés disposent
    rétroactivement de leurs valeurs de sous-composante gelées, afin que les
    courbes et araignées aient de l'historique dès la livraison.
46. En tant que développeur, je veux que ce rattrapage soit un one-shot
    documenté (valeurs recalculées avec les règles courantes au moment du gel).
47. En tant que membre de la DAP, je veux que le « taux d'atteinte du seuil »
    soit sens-conscient : pour un seuil plancher, valeur / seuil ; pour un
    seuil plafond (P6), seuil / valeur ; borné à 100.
48. En tant que développeur, je veux que le taux d'atteinte soit calculé par
    une vue de reshaping non matérialisée (comme `v_mois_cycle`) et non figé,
    puisqu'il se déduit des valeurs déjà gelées et du seuil du moment.
49. En tant qu'analyste, je veux que la vue nationale par sous-composante et
    la fiche site utilisent la même définition du taux d'atteinte, afin que
    les chiffres concordent.
50. En tant qu'équipe district, je veux que la fiche site continue de montrer
    les cartes de pilier lisibles pour la projection, le tableau à plat
    n'étant qu'un complément d'analyse.
51. En tant qu'utilisateur sur mobile ou écran étroit, je veux que la
    coquille à deux barres et les graphes restent lisibles (barres qui se
    replient, SVG responsive).
52. En tant que développeur, je veux que `ng build` et les captures Playwright
    des écrans touchés valident chaque tranche visuelle, faute de tests de
    composant dans ce dépôt.

## Implementation Decisions

### Découpage en tranches et ordre

Ordre : **1 → 2 → 3 → (4 ∥ 5) → 6**. Une branche par tranche, `/tdd` aux
coutures métier, typecheck + tests ciblés + commit par ticket, `/code-review`
deux axes en fin de tranche, fusion `ff` vers master, captures des pages
touchées.

| Tranche | Tickets | Dépend de |
|---|---|---|
| 1. Nettoyage console | 01, 02 | — |
| 2. Gel des sous-composantes | 03, 04 | — |
| 3. Coquille visuelle | 05, 06 | — |
| 4. Tableau de bord `/` | 07, 08 | 2, 3, 5 |
| 5. Synthèse par sous-composante | 09, 10 | 2 |
| 6. Fiche site analytique | 11, 12, 13, 14, 15 | 2, 3 |

### Tranche 1 — Nettoyage console

- **Libellé P4** : `LIBELLES_PILIER.P4` dans `@dqa/contracts` passe à
  « Taux de conformité ». Répercussion documentaire : `CLAUDE.md` §5,
  `CONTEXT.md` (glossaire + table des six piliers), `docs/guide_module_indicateurs.md`,
  `docs/canevas_extraction_v2.md`. Le code de pilier reste `P4`. Les
  sous-composantes gardent leurs libellés « écart SDU » / « écart
  consommation » et l'enum `ecart_sdu` / `ecart_consommation` est inchangé.
- **Tirets** : suppression de `—` (U+2014), `–` (U+2013) et `−` (U+2212) de
  tout `apps/web/src`. Remplacements :
  - valeur absente (`{{ x ?? '—' }}`) → `n/d`
  - séparateur de titre (« P1 — Libellé ») → `·` (« P1 · Libellé »)
  - apposition en ligne (« non évaluable — {raison} », « / 100 — score
    composite moyen ») → deux-points
  - delta négatif (`−3 pts`) → `-3 pts` (trait d'union U+002D)
- **Citations d'ADR** : retrait de « (ADR 0003) » et de toute mention de
  numéro de décision des textes d'écran (une occurrence connue :
  `admin-grille.ts`). La justification métier reste, sans la référence.
- Aucun changement de schéma, de contrat structurel ni d'API.

### Tranche 2 — Gel des valeurs de sous-composante

- **Migration numérotée** : ajoute dix colonnes `numeric` à `hist_score_site`,
  préfixe `sc_`, une par sous-composante
  (`sc_completude_inventaires`, `sc_completude_requisitions`,
  `sc_completude_receptions`, `sc_promptitude_inventaires`,
  `sc_promptitude_requisitions`, `sc_regularite_saisie`, `sc_ecart_sdu`,
  `sc_ecart_consommation`, `sc_concordance`, `sc_ratio_ajustements`).
- La colonne porte la **valeur mesurée** de la sous-composante (ex.
  `taux_regularite_pct`). Le seuil du moment reste retrouvable via `grille_id`
  ; on ne fige pas le seuil ni le statut (déductibles).
- **`rafraichir_et_geler`** recréée : l'`INSERT ... ON CONFLICT` de
  `hist_score_site` renseigne aussi les dix `sc_*`, lues depuis les vues
  `mv_p1..mv_p6` du mois gelé.
- **Rattrapage** : la migration exécute un `UPDATE hist_score_site SET sc_* =
  (SELECT ... FROM mv_* ...)` pour toutes les lignes existantes. One-shot,
  valeurs recalculées avec les vues courantes ; commenté dans la migration.
- **ADR 0007** « Gel des valeurs de sous-composante » (même logique que
  l'ADR 0003).
- **Contrats** : `pointProgressionSchema` gagne les valeurs de sous-composante
  du mois (forme : réutiliser `mesureSousComposanteSchema` ou une variante
  brève `{ sousComposante, valeur, seuil, statut }` — dix entrées).
  `detailSiteSchema` inchangé (les cartes de pilier portent déjà les
  sous-composantes du mois courant depuis les vues live ; on peut basculer
  leur source sur `hist_score_site.sc_*` pour cohérence — décision au ticket).
- **Repository** : `historiqueSite` lit les `sc_*` gelés en plus des scores de
  pilier.

### Tranche 3 — Coquille visuelle

- **Palette** : schéma de couleurs de StarAdmin **recréé** en tokens CSS
  maison (variables dans `styles.css` ou un fichier de tokens dédié). Aucun
  fichier SCSS, image ou police de StarAdmin n'entre dans le dépôt. Les rôles
  de `DESIGN_SYSTEM.md` §1 (fond, surface, texte, bordure, accent, statuts)
  sont réattribués aux nouvelles valeurs.
- **Coquille à deux barres** : nouveau composant remplaçant `<dqa-entete>`.
  - Barre 1 : titre à gauche ; utilisateur + bouton Déconnexion à droite.
  - Barre 2 : navigation de sections
    (Tableau de bord · Sites · Sous-composantes · Imports · Traceurs · Grille ·
    Comptes), filtrée par rôle comme l'actuel `entete`.
  - Aucune sidebar. Aucun sélecteur global (mois / programme) dans les barres.
  - Repli des barres sur écran étroit.
- **`DESIGN_SYSTEM.md`** réécrit : palette, deux barres, `/` = tableau de
  bord, graphes SVG étendus (radar + multi-séries, toujours sans librairie),
  règle « aucun tiret long » avec le tableau des remplacements.
- **ADR 0006** « Adoption du registre visuel StarAdmin ».
- Pas de dépendance ajoutée. Angular reste standalone, zoneless, OnPush.

### Tranche 4 — Tableau de bord national `/`

- **Route** : `/` charge un nouveau composant `TableauDeBordPage` ; la liste
  des sites déménage sur `/sites` (l'ancien `ListeSitesPage`). Le lien
  « Tableau de bord » de la barre 2 pointe `/`, « Sites » pointe `/sites`.
  La redirection `**` reste vers `/`.
- **Données** : un endpoint d'agrégat national. Réutiliser au maximum
  `mv_synthese_nationale` (déjà national + répartition + moyennes piliers) ;
  y ajouter la mini-série de progression (score composite moyen par mois) et,
  pour le bloc « sous-composantes en difficulté », `mv_synthese_sous_composante`
  (tranche 5). Décision au ticket : nouvel endpoint `GET /tableau-de-bord`
  vs extension de `GET /synthese`.
- **Contenu de la page** : tuiles (nb sites périmètre, score composite moyen,
  répartition, nb sans mesure) ; mini-courbe nationale ; top 5 des
  sous-composantes par nombre de sites en ALERTE ; lien « Voir les 40 sites ».
  Pas de radar national en v1.

### Tranche 5 — Synthèse par sous-composante

- **Vue matérialisée** `mv_synthese_sous_composante` : par (mois PAQD, +
  éventuellement région / programme selon le grain de `mv_synthese_nationale`),
  pour chacune des dix sous-composantes : nombre de sites CONFORME, nombre
  ALERTE, nombre NON_CALCULABLE, et moyenne du **taux d'atteinte du seuil**
  (via la vue de la tranche 6, ou définition inline si la tranche 6 n'est pas
  encore mergée — à arbitrer selon l'ordre réel de merge). Filtre
  `dim_site.dans_perimetre_dqa`. Rafraîchie dans `rafraichir_et_geler`.
- **Contrat** : `syntheseNationaleSchema` gagne un champ `parSousComposante`
  (dix lignes), ou un DTO / endpoint dédié. Respecte les filtres mois /
  programme / région existants.
- **Écran** : onglet « Sous-composantes » dans `/synthese` (pas de route
  séparée). Tableau : sous-composante, pilier, taux d'atteinte moyen, nb
  CONFORME, nb ALERTE, nb NON_CALCULABLE ; triable.

### Tranche 6 — Fiche site analytique

- **Vue de reshaping non matérialisée** `v_sous_composante_atteinte` :
  à partir de `hist_score_site.sc_*` + `grille_seuil_sous_composante`
  (joint via `grille_id`), calcule le **taux d'atteinte du seuil** (0–100) :
  - sens `sup` (plancher) : `least(sc_valeur / seuil, 1) * 100`
  - sens `inf` (plafond, P6) : `least(seuil / nullif(sc_valeur, 0), 1) * 100`
  - `ecart_sdu` / `ecart_consommation` : la valeur gelée **est** déjà un taux
    de conformité 0–100, reprise telle quelle
  - `sc_valeur` NULL → atteinte NULL (NON_CALCULABLE)
  Une ligne par (site, mois PAQD, programme, sous-composante).
- **`CONTEXT.md`** : nouvelle entrée « Taux d'atteinte du seuil » ; entrée
  « Valeur de sous-composante gelée ».
- **Endpoint historique** (`GET /sites/:id/historique`) étendu :
  - accepte une **plage** de mois (`de` / `a`, mois PAQD) au lieu du seul
    `cycle` ; `cycle` reste accepté comme préréglage. Défaut : le cycle
    courant. L'axe X devient le mois calendaire quand la plage traverse
    plusieurs cycles.
  - chaque point porte : score composite, les six scores de pilier (déjà là),
    et les dix `{ sousComposante, valeur, atteinte, statut }`.
- **Endpoint fiche site** : expose, pour le mois affiché, les dix
  sous-composantes avec leur taux d'atteinte (pour le tableau à plat et le
  radar). Peut réutiliser `v_sous_composante_atteinte`.
- **Tableau à plat** (`<details>` sous les cartes de pilier) : dix lignes
  (pilier, sous-composante, valeur, seuil, écart au seuil, taux d'atteinte,
  statut), triable par colonne. Les cartes de pilier restent inchangées.
- **Radar SVG** (nouveau composant, pas de librairie) : bascule 6 piliers ↔
  10 sous-composantes ; rayon = taux d'atteinte 0–100 ; étiquette d'axe
  colorée par le statut. Sous le radar, liste « forces / faiblesses » : 3
  sous-composantes au plus bas taux d'atteinte < 100, 3 au plus haut. Montre
  le **dernier mois de la plage** sélectionnée.
- **Widget courbes** (extension de `courbe-progression` ou nouveau composant) :
  sélecteur de granularité (composite / par pilier / par sous-composante) ;
  en mode sous-composante, sélecteur du pilier (≤ 3 séries) ; axe Y 0–100 ;
  repères 65 / 75 / 90 ; piloté par la plage de mois.
- **Sélecteur de plage de mois** dans l'écran (pas la barre) : deux listes
  « de / à » depuis les mois disponibles + préréglages (« cycle courant »,
  « 12 derniers mois », « tout »). Pilote courbes **et** radar.
- **ADR 0001** : note d'amendement (le cycle n'est plus la seule fenêtre de
  progression ; il reste le préréglage par défaut).

### Modules touchés

- `packages/contracts` : `LIBELLES_PILIER`, `pointProgressionSchema`,
  `historiqueSiteSchema` / `historiqueQuerySchema`, `syntheseNationaleSchema`
  (+ éventuels nouveaux DTO tableau de bord / sous-composante).
- `apps/api` : `db/migrations` (colonnes `sc_*`, `mv_synthese_sous_composante`,
  `v_sous_composante_atteinte`, `rafraichir_et_geler`) ;
  `indicateurs.repository` + `indicateurs.controller` (historique étendu,
  synthèse sous-composante, agrégat tableau de bord).
- `apps/web` : nouveau composant coquille (remplace `ui/entete`), nouveau
  `pages/tableau-de-bord`, `pages/liste-sites` déplacé sur `/sites`,
  `pages/synthese` (onglet), `pages/detail-site` (tableau à plat, radar,
  courbes, plage), nouveaux composants `ui/radar` et widget courbes,
  `app.routes.ts`, `styles.css` / tokens.
- Docs : `CLAUDE.md` §5, `CONTEXT.md`, `DESIGN_SYSTEM.md`,
  `docs/guide_module_indicateurs.md`, `docs/canevas_extraction_v2.md`,
  `docs/adr/0006-*`, `docs/adr/0007-*`.

## Testing Decisions

Un bon test ici assère un **comportement externe** : la sortie d'une vue
`mv_*` / `hist_score_site` ou d'un endpoint, contre des données chargées par
le **vrai chemin d'import** (`construireClasseur` + promotion +
`rafraichir_et_geler`). Jamais de mock de PostgreSQL. Les composants Angular
ne sont pas testés unitairement (règle du dépôt) : validation par `ng build`
et captures Playwright.

- **Tranche 1** :
  - `packages/contracts` : `LIBELLES_PILIER.P4 === 'Taux de conformité'`.
  - Nouveau fichier de garde (un seul) : parcourt `apps/web/src` et échoue si
    `—`, `–` ou `−` apparaît. Prior art : aucun, mais mécanisme trivial
    (lecture de fichiers + assertion).
- **Tranche 2** (couture intégration API, prior art `import.test.ts`,
  `indicateurs.test.ts`) :
  - un import + `rafraichir_et_geler` → `SELECT sc_* FROM hist_score_site`
    renseigne les valeurs attendues (une assertion par sous-composante
    calculable, plus le cas NULL pour une non calculable) ;
  - rattrapage : insérer / geler un mois, mettre les `sc_*` à `NULL`, rejouer
    la requête de backfill, vérifier qu'elles reviennent identiques ;
  - immuabilité : geler un mois, ré-importer, vérifier que les `sc_*` d'un
    mois antérieur non ré-importé sont inchangés.
- **Tranche 3** : pas de test automatisé. `ng build` + captures.
- **Tranche 4** (couture intégration API, prior art `synthese.test.ts`) :
  - l'agrégat tableau de bord renvoie les bons comptes (périmètre, mesures,
    répartition) et la mini-série de progression sur données de fixture ;
  - le top des sous-composantes en difficulté est ordonné par nb ALERTE.
- **Tranche 5** (couture intégration API, prior art `synthese.test.ts`) :
  - `mv_synthese_sous_composante` : comptes CONFORME / ALERTE /
    NON_CALCULABLE et moyenne du taux d'atteinte, sur un jeu à ≥ 2 sites ;
  - respect des filtres mois / programme / région ;
  - filtre périmètre (un site hors périmètre n'entre pas dans les comptes).
- **Tranche 6** (couture intégration API, prior art `historique.test.ts`,
  `p4-produit.test.ts`) :
  - `v_sous_composante_atteinte` : un test par sens — plancher (P3 à 71 %,
    seuil 65 → atteinte 100 ; P3 à 52 %, seuil 65 → 80) ; plafond (P6 à 3 %,
    seuil 5 → 100 ; P6 à 8 %, seuil 5 → 62,5) ; P4 (valeur reprise telle
    quelle) ; valeur NULL → atteinte NULL ;
  - endpoint historique : une plage `de`/`a` traversant deux cycles renvoie
    les points ordonnés par mois calendaire ; chaque point porte les dix
    sous-composantes avec `atteinte` ;
  - endpoint fiche site : les dix sous-composantes du mois affiché avec leur
    taux d'atteinte ;
  - couture D (`valider-reponse.test.ts`) : fixtures passante + échouante pour
    chaque contrat étendu (`pointProgression`, `historiqueSite`,
    synthèse sous-composante, agrégat tableau de bord).

## Out of Scope

- Renommer l'enum `sous_composante` en base ou dans les contrats Zod (le
  renommage P4 est un libellé d'affichage uniquement).
- Superposition « site vs moyenne nationale » sur le radar (fast-follow après
  la tranche 6).
- Radar national sur la page d'accueil.
- Librairie de graphes (chart.js ou autre) : tout reste en SVG inline maison.
- Import de fichiers SCSS, polices, icônes ou illustrations de StarAdmin.
- Tests de composant Angular (le dépôt n'en a pas ; on garde cette règle).
- Modification du calcul des six piliers ou du score composite.
- Gestion des comptes utilisateurs : déjà livrée (rôle `admin`,
  `/admin/comptes`), hors périmètre.
- Rétro-recalcul des scores de pilier déjà gelés (seules les nouvelles
  colonnes `sc_*` sont rattrapées, une fois).

## Further Notes

- Le rattrapage des `sc_*` sur les mois clos utilise les vues `mv_*`
  courantes : les valeurs de P3 des mois antérieurs refléteront la règle
  « jours calendaires » (migration 0024), pas la règle « jours ouvrables »
  en vigueur quand ces mois ont été gelés la première fois. C'est assumé et
  commenté dans la migration — c'est le prix d'introduire le gel après coup.
- Le « taux d'atteinte du seuil » n'est **pas** gelé : il se déduit d'une
  valeur gelée et d'un seuil retrouvable. La vue `v_sous_composante_atteinte`
  est un reshaping déterministe, au même titre que `v_mois_cycle`
  (cf. `ARCHITECTURE.md` §2).
- La palette exacte de StarAdmin (valeurs hex) sera relevée depuis son dépôt
  au moment de la tranche 3 et transcrite en tokens maison ; elle n'est pas
  figée dans cette spec.
- Faute de capture d'écran de la page Dashboard de StarAdmin fournie pendant
  la session, la répartition précise des deux barres (titre + compte / nav de
  sections) est une hypothèse à confirmer visuellement au début de la
  tranche 3.
- Ordre de merge réel entre tranches 4, 5 et 6 : si la tranche 5 est mergée
  avant la 6, `mv_synthese_sous_composante` définit le taux d'atteinte inline
  puis est refactorée pour lire `v_sous_composante_atteinte` à la tranche 6 ;
  si la 6 passe d'abord, la 5 lit directement la vue. Le ticket 09 porte ce
  choix.
