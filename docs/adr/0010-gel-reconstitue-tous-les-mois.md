# Le gel reconstitue tous les mois trouvables dans le core

**Contexte.** La fenêtre d'extraction (`specification_extraction_dap.md` §1)
est volontairement plus large que le mois PAQD mesuré — 45 jours glissants,
pour rattraper une semaine manquée. Un même classeur peut donc porter des
lignes datées de deux mois calendaires, alors que METADATA ne déclare qu'un
seul `mois_paqd` par import. Or `rafraichir_et_geler` ne figeait jusqu'ici que
**ce mois déclaré** (`WHERE mv_score_pilier.mois_paqd = import_lot.mois_paqd`
du lot en cours) : des données arrivées « en avance » pour l'autre mois
étaient bien promues dans le core, mais restaient sans score figé tant
qu'aucun import futur ne redéclarait explicitement ce mois-là.

Ce n'est pas une limite de reconnaissance de données : chaque vue de pilier
dérive déjà le mois d'une ligne à partir de sa propre date
(`to_char(date, 'YYYY-MM')`, ou `mois_couvert` pour les réquisitions),
indépendamment du lot qui l'a apportée. Le seul mois qui ne suivait pas cette
logique était celui retenu pour le **gel**.

**Décision.** `rafraichir_et_geler` fige désormais **tous** les
`(site, mois PAQD, programme)` que `mv_score_pilier` sait calculer à l'instant
de l'appel, pas seulement celui du lot qui vient d'être promu. `p_lot_id` ne
sert plus qu'à tracer quel import a déclenché le rafraîchissement
(`hist_score_site.lot_id`) ; un identifiant qui ne référence aucun lot réel
(rafraîchissement manuel, test) est tracé comme `NULL` plutôt que de faire
échouer l'appel. La grille appliquée (`grille_id`) est recalculée par ligne
via `grille_pour_mois(mois_paqd)`, plus par lot entier : un même appel peut
désormais figer des mois relevant de grilles différentes.

Une fonction `dqa.mois_est_clos(mois, référence)` accompagne ce changement :
vraie une fois dépassée l'échéance de réquisition la plus tardive (10 jours de
M+1). Avant cette date, un site peut encore soumettre « à l'heure » : geler
son P2 serait prématuré, même si rien n'empêche techniquement de le calculer.
Elle sert à distinguer, côté écran, un score définitif d'un score encore
provisoire (mois en cours de mesure) — cf. `TableauDeBord.moisClos` et
`DetailSite.moisClos`.

**Pourquoi ne pas juste attendre le lot qui déclare le bon mois.** Ça
fonctionnait, mais faisait reposer la fraîcheur du tableau de bord sur la
discipline de la DAP à redéclarer chaque mois en cours à chaque envoi
hebdomadaire. Le produit n'est pas qu'un cliché mensuel : il doit permettre de
repérer un mauvais usage de mSupply **au fil de l'eau**, avant que le mois ne
se referme. Un mois qui progresse (inventaires, dispensations) doit se voir
progresser à l'écran d'un import à l'autre, sans dépendre de ce que la DAP a
choisi d'écrire dans une case METADATA.

**Ce que ça ne change pas.** L'immutabilité des cycles clos (ADR 0003) tient
entièrement à la règle de validation `MOIS_PAQD_TROP_ANCIEN`, qui empêche de
*déclarer* un mois trop ancien — jamais au fait que le gel le touchait ou non.
Une fois qu'un mois sort de sa fenêtre d'import, plus aucune donnée ne peut
l'atteindre, gelé automatiquement ou non : le dernier gel effectué avant cette
limite reste définitif, exactement comme avant.

**Conséquence.** Un site dont le score progresse en cours de mois (P3, P4…) le
voit progresser au fil des imports, avant même la clôture du mois. L'écran
affiche un repère « mois en cours, score provisoire » tant que
`mois_est_clos` est faux, pour qu'un score partiel ne soit pas lu comme un
verdict final.
