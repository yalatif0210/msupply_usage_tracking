# P4 et P5 reposent sur l'inventaire de clôture du mois

**Statut.** Accepté (2026-11-04), complété le 2026-11-05 après revue
(migration 0062). Amende l'ADR 0012 (« le silence est un signal ») et
remplace l'ADR 0014 (P4 et P5 non calculables tant que le mois n'est pas
clos) pour P4 et P5. P2 n'est pas concerné.

**Contexte.** P4 et P5 prenaient l'inventaire « du mois » au sens calendaire.
Sur la démo, 66 des 152 inventaires sont faits entre le 1er et le 10 du mois :
un inventaire du 3 novembre décrit le stock de fin octobre mais comptait pour
novembre. Un inventaire du 15 servait de borne. Un site qui inventoriait à une
date quelconque échappait à la sanction ; seul le site sans aucun inventaire
dans le mois prenait 0. L'écart de consommation prenait pour ouverture le
dernier inventaire du mois précédent, quelle que soit sa date, ou à défaut le
premier du mois : la période mesurée variait d'un site à l'autre.

**Décision.**

- **Inventaire de clôture du mois n** : un inventaire finalisé daté des 3
  derniers jours de n ou du 1er de n+1, **qui porte au moins un produit
  traceur actif**. Un inventaire sans traceur ne vaut pas clôture. S'il y en
  a plusieurs, le dernier (date, heure, numéro ; ADR 0016). Un produit
  est identifié par son code ; chaque article d'un code est contrôlé à part
  (ADR 0016).
- **Inventaire d'ouverture du mois n** : l'inventaire de clôture retenu de
  n-1. Il n'y a pas de deuxième inventaire à faire dans le mois.
- Un inventaire hors de cette fenêtre ne compte ni pour P4 ni pour P5 ; la
  fiche site le signale avec sa date.
- **Mois jugé** : chaque jour de la fenêtre de clôture, **prolongée de la
  marge de jugement** (3 jours), est couvert par la fenêtre d'un import
  validé. Un trou entre deux imports suspend le jugement, deux imports
  contigus le permettent. Sans aucune fenêtre d'import, la date du jour en
  tient lieu. Avant le jugement, aucune sanction : les sous-composantes déjà
  calculables sont affichées, les autres sont non calculables.
- **Sanction**, une fois le mois jugé. La sous-composante sanctionnée prend la
  note de sanction de la grille (0 par défaut, toujours sous 100) :

  | Clôture | Ouverture | Produit commun | Conformité consommation (P4) | Concordance (P5) |
  |---|---|---|---|---|
  | oui | oui | oui | calculée | calculée |
  | oui | oui | aucun | sanction | calculée |
  | oui | non, n-1 jugé | - | sanction | calculée |
  | oui | non, n-1 non jugé | - | non calculable | calculée |
  | non | - | - | sanction | sanction |

  La conformité SDU suit la règle de P5 ; elle est mesurée mais non retenue
  dans P4 par la grille par défaut.
- **Grain programme (décision explicite)** : la même règle vaut pour chaque
  programme éligible du site (`dim_site_programme` actif), sur ses propres
  inventaires, **même quand ce programme n'a aucun traceur**. Le site pour
  lequel un programme est éligible doit le clôturer. Un programme inventorié
  sans être éligible n'a une ligne que le mois de sa clôture.
- **Univers du score** : un site (ou programme) reçoit un score pour un mois
  où il a une activité : une mesure P1, P2, P3 ou P6, ou un inventaire avec
  traceur, dans la fenêtre ou hors d'elle. Sans aucune activité, il reste
  « sans mesure » : une sanction seule ne fait pas un score.
- **Produits retenus dans la conformité consommation** : le dénominateur est
  le nombre de produits présents aux deux inventaires ; une consommation
  reconstituée ≤ 0 y compte non conforme. Un produit présent à la clôture et
  absent de l'ouverture est écarté pour ce produit seulement, avec sa raison
  (absent de l'ouverture ; ou code présent à l'ouverture sous un autre
  article). Un produit absent de la clôture sort de P4 et de P5. Ces absences
  sont qualifiées (oubli démontré, oubli probable, épuisé, indéterminé) à
  partir de toutes les entrées et sorties enregistrées entre les deux
  inventaires, et historisées. La qualification n'agit pas sur le score.
- Fenêtre de clôture, marge de jugement, note de sanction et bornes de
  classification sont des paramètres de la grille datée (migrations 0058,
  0062). Les valeurs ci-dessus sont celles de la grille v1.
- Application rétroactive à tous les mois : le système n'est pas encore
  déployé.

**Pourquoi.** Le but est d'installer l'habitude de l'inventaire de fin de mois,
pas de trouver une excuse à chaque date. Une fenêtre étroite et une sanction
explicite rendent la règle vérifiable par chaque site. La période de l'écart de
consommation devient la même partout (de clôture à clôture, environ 30 jours),
ce qui rend les sites comparables.

On juge sur la couverture des données, pas sur la date du jour : les données
arrivent chaque semaine, un inventaire du 1er peut n'être transmis qu'une
semaine plus tard. La marge absorbe le délai de synchronisation de mSupply
entre le site et le serveur.

Une clôture sans traceur ne mesure rien de ce que P4 et P5 contrôlent : la
compter comme clôture laisserait un site échapper à la sanction avec un
inventaire vide de sens. Une ouverture et une clôture sans produit commun
ne permettent aucun écart de consommation : c'est un défaut de saisie, pas une
absence de mesure.

**Alternatives écartées.**

- Rattacher les inventaires du 1er au 10 au mois précédent : offrait une
  excuse aux sites en retard.
- Exiger deux inventaires dans le mois : excluait le site qui inventorie
  correctement une fois par mois.
- Aligner P2 sur la même fenêtre : P2 mesure la promptitude et garde sa propre
  échéance (3 derniers jours du mois).
- Ne sanctionner un programme éligible que s'il a des traceurs : l'éligibilité
  d'un programme engage à le clôturer ; un programme sans traceur se corrige
  dans l'écran Programmes, pas par une exemption silencieuse.
- Sanctionner aussi un site sans aucune activité du mois : il serait noté sur
  P4 et P5 seuls, à 0, ce qui confondrait « rien reçu » et « inventaire
  manqué ». Il reste « sans mesure ».

**Conséquences.** Environ la moitié des inventaires actuels de la démo tombent
dans la fenêtre : beaucoup de sites seront sanctionnés au début. Un mois
récent reste provisoire tant que les imports ne couvrent pas sa fenêtre et sa
marge. La fiche site donne pour chaque sanction sa cause (hors fenêtre, sans
clôture, sans ouverture, sans produit commun) et la note appliquée.
