# Gel des comptes bruts des piliers

**Contexte.** `hist_score_site` fige, par site et par mois PAQD, les scores de
pilier, le score composite, la classification (ADR 0003) et les dix valeurs
mesurées de sous-composante `sc_*` (ADR 0007). Ce qui n'était nulle part figé,
c'est le **couple de chiffres qui produit chaque taux** : « 3 réceptions
finalisées sur 5 factures fournisseur », « 4 inventaires sur 5 programmes
gérés », « 14 jours avec une sortie de stock sur 31 ». La coordination et les
équipes district en ont besoin pour vérifier une note, l'expliquer à un site,
et lire au niveau national la complétude et la promptitude des réquisitions et
des inventaires par strate de structure.

Les vues `mv_p1..mv_p6` calculaient déjà ces numérateurs et dénominateurs dans
leurs CTE, puis les jetaient au `SELECT` final (corrigé par la migration 0028).
Comme les valeurs `sc_*` avant l'ADR 0007, ils seraient sinon relus à la volée
et bougeraient rétroactivement à chaque évolution de règle ou ré-import — une
donnée brute qui contredit la note qu'elle est censée expliquer n'aide
personne.

**Décision.** Une table compagne `hist_pilier_brut`, en **lignes longues** :
une ligne par `(site, mois PAQD, programme, mesure)`, colonnes `nb_attendu`,
`nb_realise`, `nb_a_lheure` (ce dernier seulement pour P2, qui porte un délai).
`rafraichir_et_geler` la peuple au même passage que `hist_score_site` ; une
mesure NON_CALCULABLE (taux nul) n'est pas figée. Rattrapage one-shot des mois
déjà clos depuis les vues courantes, comme l'ADR 0007.

Ce qui est figé : les **couples agrégés**. Ce qui reste **lu en direct du
core** : le détail transaction par transaction derrière un couple (la liste des
inventaires du mois avec leur date, des réquisitions avec leur date de
soumission…). Recopier chaque ligne d'inventaire ou de mouvement à chaque
import gonflerait la base sans bénéfice : le détail sert à voir l'état
*courant* de mSupply. Quand le core a été ré-importé après le gel du mois
consulté (`hist_pilier_brut.calcule_le` antérieur au `maj_le` des lignes de
core), un avertissement signale que le détail live peut diverger des comptes
figés.

**Pourquoi lignes longues plutôt que colonnes larges façon `sc_*`.** Les dix
`sc_*` étaient un jeu fermé de dix valeurs de même nature (un taux). Ici le jeu
de mesures va bouger — P2..P6 après le ticket d'introduction, éventuellement de
nouveaux compteurs — et chaque mesure porte deux ou trois compteurs, pas un.
Une table en lignes longues encaisse une mesure de plus sans `ALTER TABLE`, et
s'agrège nativement par `GROUP BY strate` pour la vue nationale « Rapports &
inventaires ». L'alternative colonnes larges (≈ 25 colonnes `p1_inv_attendu`,
`p2_req_a_lheure`…) sur `hist_score_site` a été écartée pour cette raison.

**Conséquence.** `DetailSite.piliers[]` porte `comptesBruts`, le couple figé de
chaque sous-composante mesurée, affiché dans la carte du pilier à côté du taux.
Le détail ligne à ligne est servi à la demande par
`GET /api/sites/:id/piliers/:code`. La vue nationale `mv_synthese_rapports`
agrège `hist_pilier_brut` (mesures P1 et P2) par strate. L'« attendu » national
est compté par programme géré, dénominateur de P1 / P2 : les chiffres bruts se
réconcilient avec les scores.
