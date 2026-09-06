# P4 et P5 non calculables tant que le mois n'est pas clos

**Statut.** Accepté. Amende l'ADR 0012 §3.

**Contexte.** L'ADR 0012 (« le silence est un signal ») a posé que P4 (écart
SDU) et P5 (concordance) valent **0 %** dès qu'un site du périmètre n'a aucun
inventaire finalisé daté dans le mois. L'intention était juste pour un mois
clos : un site qui n'a pas fait son inventaire de fin de mois a manqué une
échéance.

Elle est fausse pour un **mois en cours**. L'inventaire de fin de mois n'est
pas encore dû : le noter 0 % pénalise le site pour une échéance qui n'est pas
arrivée. Deux incohérences en découlaient :

- P1 et P2 sont déjà NON_CALCULABLE dans exactement ce cas (aucun inventaire
  ni réquisition transmis) ; P4 et P5 les contredisaient en affichant une
  ALERTE ferme.
- Le score composite d'un mois en cours plongeait dès le 1er du mois
  (P4 + P5 = 50 points de poids à 0), puis remontait à la clôture. La courbe
  de progression montrait une chute artificielle du dernier point.

**Décision.** Le discriminant est `dqa.mois_est_clos(mois)` — le même proxy de
clôture que P2 (délai de réquisition expiré, ADR 0010, ADR 0013).

Pour un site sans aucun inventaire finalisé daté dans le mois :

| État du mois | Écart SDU (P4) | Écart consommation (P4) | Concordance (P5) |
|--------------|----------------|-------------------------|------------------|
| clos         | 0 % (ALERTE)   | 0 % (ALERTE)            | 0 % (ALERTE)     |
| en cours     | NON_CALCULABLE | NON_CALCULABLE          | NON_CALCULABLE   |

- **P4** a deux sous-composantes. Si l'écart SDU tombe NON_CALCULABLE mais que
  l'écart consommation reste évaluable (le site a inventorié tôt dans le mois,
  il y a une borne), le score du pilier est celui de la seule sous-composante
  calculable — règle de renormalisation inchangée.
- **P5** n'a qu'une sous-composante : elle tombe NON_CALCULABLE, donc P5 aussi.
- Le pilier entièrement NON_CALCULABLE est exclu du dénominateur du score
  composite (renormalisation, ADR 0007). Un mois en cours est donc noté sur
  les seuls piliers réellement mesurables (P3 au fil de l'eau, P6, et P1/P2/P4
  dès qu'un inventaire ou une réquisition arrive).

**Ce qui ne change pas.**

- Un site qui **inventorie tôt** dans le mois reste évalué : il y a de la
  donnée, P4/P5 se calculent normalement.
- Le cas « a bien inventorié mais sans produit traceur exploitable » reste
  NON_CALCULABLE (il l'était déjà, quel que soit l'état du mois).
- Le cas « bornes présentes mais aucune consommation reconstituée positive »
  (donnée douteuse) reste NON_CALCULABLE.
- Un **mois clos** sans inventaire reste à 0 % : l'ADR 0012 §3 tient dès la
  clôture.
- P1, P2, P3, P6 : inchangés.

**Conséquences.**

- Migration `0042` : reconstruit `mv_p4_ecart`, `mv_p5_concordance` et
  `mv_score_pilier` (tombée par CASCADE), puis `rafraichir_et_geler(NULL)`.
  La seule branche modifiée est « aucun inventaire » : `ELSE 0.0` devient
  `WHEN dqa.mois_est_clos(mois) THEN 0.0 ELSE NULL`.
- `mv_p4_ecart` et `mv_p5_concordance` dépendent désormais de `CURRENT_DATE`
  (via `mois_est_clos`) comme `mv_p3_regularite` : un rafraîchissement après
  la date de clôture fige P4/P5 à 0 % pour un site resté silencieux. C'est
  cohérent avec le repère « score provisoire ».
- Courbe de progression (national et fiche site) : le dernier segment, s'il
  porte sur un mois non clos, est tracé **en pointillé**. Un mois en cours
  noté sur 2 piliers seulement peut afficher un score élevé ; le pointillé
  signale qu'il est provisoire et non comparable aux points pleins.
- L'API expose `moisClos` sur chaque point de progression (contrat
  `pointProgressionSchema`, `pointProgressionNationaleSchema`) et une raison
  dédiée sur la sous-composante NON_CALCULABLE : « Inventaire de fin de mois
  pas encore attendu (mois en cours) ».

**Alternatives écartées.**

- *Garder 0 % et tout miser sur le badge « score provisoire ».* Rejeté :
  c'est le même argument que l'ADR 0012 a tranché pour P3, mais ici le 0 %
  n'est pas un signal — le manquement n'existe pas encore. Un faux négatif,
  pas une alerte anticipée.
- *Repère « provisoire » plus visible plutôt qu'un pointillé sur la courbe.*
  Rejeté : le badge existe déjà sur la carte du mois ; c'est la courbe, où un
  point provisoire est juxtaposé à des points définitifs, qui avait besoin
  d'un marquage propre.
- *Discriminant = présence d'une réquisition du mois plutôt que
  `mois_est_clos`.* Rejeté : `mois_est_clos` est déjà la définition de
  clôture du produit (P2, gel ADR 0010) ; en introduire une seconde
  diverge à la première évolution de la grille.
