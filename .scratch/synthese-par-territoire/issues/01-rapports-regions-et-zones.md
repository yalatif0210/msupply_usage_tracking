# 01: Rapports et inventaires par territoire : régions et zones de district

**What to build:** dans l'onglet « Rapports & inventaires », une vue « Par
territoire » à côté de la vue par strate : une ligne par région, dépliable en
zones de district, avec à chaque niveau les réquisitions et inventaires de fin
de mois attendus, réalisés, à l'heure, et les taux « % réalisés » et
« % à l'heure ». Tri du plus faible taux de réquisitions à l'heure au plus
élevé, niveaux sans attendu en fin de liste.

**Blocked by:** aucun (peut démarrer).

**Status:** done

- [x] Vue matérialisée au grain région / zone (et site, utilisé au ticket 02),
  par mois et programme, à partir de `hist_pilier_brut` ; rafraîchie par
  `rafraichir_et_geler`.
- [x] Région ou district vide : « Région non renseignée » / « District non
  renseigné », jamais écartés.
- [x] Une zone compte tous les sites rattachés, magasin du district sanitaire
  compris ; une région = somme de ses zones (pas une moyenne de moyennes).
- [x] Taux calculés dans la vue, NULL si rien d'attendu.
- [x] API et contrat : régions et zones d'un mois, filtres mois / programme /
  région ; mois par défaut = dernier mois clos ; mois non dû signalé.
- [x] Front : bascule « Par strate » / « Par territoire », arborescence
  dépliable, taux au format français, « pas encore dû (échéance le JJ/MM) »
  pour un mois non dû, filtres dans l'URL, une région filtrée s'ouvre dépliée.
- [x] Tests : zone avec magasin du district, site sans région, somme des zones
  = région, mois non dû ; tri et taux côté front.
