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

**Status:** done (branche piliers-p1-p4-score-composite)

- [x] Une migration numérotée refond la vue de score de pilier avec six colonnes
      de score (une par pilier) et ajoute score composite + classification ;
      P1–P4 nuls pour l'instant. → `db/migrations/0015_score_composite.sql`
- [x] Le score composite applique la renormalisation des poids sur les seuls
      piliers calculables. → `CROSS JOIN LATERAL` des 6 paires + poids grille.
- [x] La procédure de rafraîchissement fige les six scores de pilier, le score
      composite et la classification dans l'historique, en référençant la grille
      active. → `rafraichir_et_geler` réécrite.
- [x] `GET /api/sites/:id` renvoie les six piliers (P1–P4 avec sous-composantes
      NON_CALCULABLE), le score composite, la classification, et le nombre de
      piliers couverts (`piliersCouverts` = scores non nuls).
- [x] `GET /api/sites` renvoie score composite + classification par site et les
      trie côté serveur du plus faible au plus élevé (`ORDER BY h.score_composite
      ASC NULLS LAST`), sites sans score en dernier.
- [x] La fiche site affiche le score composite, le badge de classification, et
      la mention « Score calculé sur N piliers sur 6 » lorsque N < 6.
- [x] La liste des sites affiche score composite et classification et respecte
      l'ordre renvoyé par l'API.
- [x] Un composant badge de classification (`ui/badge-classification`) est
      réutilisable entre les deux écrans.
- [x] Couture B : renormalisation P5+P6 (composite 28.6 = 1000/35), bornes de
      `classer_composite` (90 / 89.9 / 75 / 74.9). Couture A : `lecture-indicateurs`
      et `import` vérifient composite + classe bout en bout. Couture D :
      `valider-reponse.test.ts` — DetailSite 6 piliers OK, composite hors [0,100]
      et classification inconnue rejetés.

## Comments

- Fonction SQL `classer_composite(numeric)` ajoutée pour isoler et tester les
  bornes de classification (réutilisée par les écrans nationaux à venir).
- `hist_score_site` avait déjà les colonnes `p_*` / `score_composite` /
  `classification` (migration 0007) : seule la procédure de gel a changé.
- Tests existants adaptés : `indicateurs`, `lecture-indicateurs`, `import` ne
  s'attendent plus à un `score_composite` NULL avec P5/P6 présents.
