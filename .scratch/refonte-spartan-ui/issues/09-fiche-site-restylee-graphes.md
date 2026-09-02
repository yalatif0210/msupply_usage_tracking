# 09: Fiche site re-stylée + graphes ApexCharts

**What to build:** l'écran `/sites/:id` prend le registre shadcn-admin, ses
graphes deviennent lisibles en projection, et « Analyse fine » ne clignote
plus au changement de période.

**Blocked by:** 03, 04, 05

**Status:** done (fusionné dans master)

- [ ] Radar « forces / faiblesses » via le composant radar ApexCharts (04),
      bascule 6 piliers / 10 sous-composantes, tous les axes étiquetés.
- [ ] Courbe d'évolution via le composant courbe multi-séries ApexCharts (04) :
      granularité composite / par pilier / par sous-composante, repères de
      seuil, trous préservés, légende complète (enroulée sous le graphe en mode
      « par pilier », 6 séries).
- [ ] Cartes de pilier au style `card` shadcn ; libellé P4 = « Taux de
      conformité ».
- [ ] Tableau à plat des 10 sous-composantes et drill-down P4 en `table`
      spartan, tri conservé.
- [ ] `select` de plage de mois / programme / granularité au style spartan.
- [ ] Changer `de` / `a` / programme : le score composite et les cartes de
      pilier restent en place, seule « Analyse fine » montre l'attente ; URL
      suit (déjà via 03).
- [ ] `n/d` / `s/o` pour les valeurs absentes ; aucun tiret long.
- [ ] Captures Playwright (radar 6 et 10, chaque granularité de courbe, une
      plage multi-cycles) ; `ng build` + typecheck verts ;
      `conventions-source.test.ts` verte.
