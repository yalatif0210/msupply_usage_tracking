# 04: Composants de graphe ApexCharts

**What to build:** trois composants de graphe réutilisables, au registre
shadcn-admin, dont **toutes les légendes et graduations sont lisibles en
projection**. Ils remplaceront les graphes SVG maison.

**Blocked by:** 01

**Status:** done (fusionné dans master)

- [x] Composant **radar** : 6 ou 10 axes, chaque axe étiqueté sans troncature ;
      valeur = taux d'atteinte du seuil (0..100).
- [x] Composant **courbe multi-séries** : plusieurs séries sur un axe X commun,
      repères de seuil (65 / 75 / 90) en annotations pointillées, un mois sans
      donnée reste un trou (pas de segment tiré entre points non consécutifs).
- [x] Composant **sparkline** : courbe compacte pour carte ou cellule.
- [x] Règles `DESIGN_SYSTEM §8` respectées : légende toujours complète et
      jamais tronquée ; au-delà de 6 séries la légende passe sous le graphe et
      s'enroule ; graduations d'axe en rotation ou éclaircies plutôt que
      rognées ; palette `--chart-1..5` (jamais les couleurs de statut) ;
      `chart.animations.enabled: false`.
- [x] `aria-label` décrivant le contenu pour les lecteurs d'écran.
- [x] Rendu vérifié sous zoneless ; harnais de démo (page ou story) montrant
      chaque composant avec 2, 6 et 10 séries pour la revue.
- [x] `ng build` + typecheck verts.
