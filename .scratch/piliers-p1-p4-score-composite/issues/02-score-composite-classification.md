# 02: Score composite, classification et renormalisation

**What to build:** un site obtient un score composite sur 100 et une
classification (CONFORME ≥ 90, PARTIELLEMENT CONFORME 75–89, NON CONFORME < 75),
calculés à partir des piliers effectivement mesurés. Aujourd'hui seuls P5 et P6
ont un score de pilier ; la fiche site affiche « 2 piliers sur 6 » et aucun
score global.

Le score composite est la somme pondérée des scores de pilier. Un pilier dont
toutes les sous-composantes sont NON_CALCULABLE est retiré du calcul et les
poids des piliers restants sont renormalisés à 100 %. Avec P5 et P6 seuls
calculables, le composite se calcule sur ces deux piliers renormalisés.

Le score composite et la classification sont historisés et figés au rafraîchis-
sement, en référence à la grille active du mois. La couche indicateurs porte les
six colonnes de score de pilier ; celles de P1 à P4 restent nulles jusqu'à
l'arrivée de leur vue.

Écrans : la fiche site affiche le score composite en grand, le badge de
classification, et « score calculé sur N piliers sur 6 » quand N < 6. La liste
des sites affiche le score composite et la classification par site, et se trie
du score le plus faible au plus élevé (tri fait par l'API, les sites sans score
en dernier).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Une migration numérotée refond la vue de score de pilier avec six colonnes
      de score (une par pilier) et ajoute score composite + classification ;
      P1–P4 nuls pour l'instant.
- [ ] Le score composite applique la renormalisation des poids sur les seuls
      piliers calculables.
- [ ] La procédure de rafraîchissement fige les six scores de pilier, le score
      composite et la classification dans l'historique, en référençant la grille
      active.
- [ ] `GET /api/sites/:id` renvoie les six piliers (P1–P4 avec sous-composantes
      NON_CALCULABLE), le score composite, la classification, et le nombre de
      piliers couverts.
- [ ] `GET /api/sites` renvoie score composite + classification par site et les
      trie côté serveur du plus faible au plus élevé, sites sans score en
      dernier.
- [ ] La fiche site affiche le score composite, le badge de classification, et
      la mention « calculé sur N piliers sur 6 » lorsque N < 6.
- [ ] La liste des sites affiche score composite et classification et respecte
      l'ordre renvoyé par l'API.
- [ ] Un composant badge de classification est réutilisable entre les deux
      écrans.
- [ ] Couture B : test de la renormalisation (site avec un pilier non calculable
      → poids redistribués) et du seuil de classification (cas 90 / 89 / 75 /
      74). Couture A : bout en bout, un site P5+P6 renvoie un composite et une
      classe cohérents. Couture D : test du schéma de réponse enrichi.
