# P4 et P5 reposent sur l'inventaire de clôture du mois

**Statut.** Accepté (2026-11-04). Amende l'ADR 0012 (« le silence est un
signal ») et l'ADR 0014 (P4 et P5 non calculables tant que le mois n'est pas
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
  derniers jours de n ou du 1er de n+1. S'il y en a plusieurs, le dernier
  (date, heure, numéro ; ADR 0016).
- **Inventaire d'ouverture du mois n** : l'inventaire de clôture retenu de
  n-1.
- Un inventaire hors de cette fenêtre ne compte ni pour P4 ni pour P5.
- **Sanction**, une fois le mois jugé :

  | Clôture | Ouverture | P4 | P5 |
  |---|---|---|---|
  | oui | oui | calculé | calculé |
  | oui | non | 0 | calculé |
  | non | - | 0 | 0 |

- **Mois jugé** : les données importées couvrent le 1er de n+1 (fin de
  fenêtre du dernier import validé). Avant, les sous-composantes déjà
  calculables sont affichées (provisoires) et les autres sont non
  calculables : aucune sanction.
- Un produit présent à la clôture mais absent de l'ouverture est écarté de
  l'écart de consommation, pour ce produit seulement, avec sa raison. Le
  dénominateur reste le nombre de produits inventoriés aux deux bornes.
- Application rétroactive à tous les mois : le système n'est pas encore
  déployé.

**Pourquoi.** Le but est d'installer l'habitude de l'inventaire de fin de mois,
pas de trouver une excuse à chaque date. Une fenêtre étroite et une sanction
explicite rendent la règle vérifiable par chaque site. La période de l'écart de
consommation devient la même partout (de clôture à clôture, environ 30 jours),
ce qui rend les sites comparables.

On juge sur la couverture des données, pas sur la date du jour : les données
arrivent chaque semaine, un inventaire du 1er peut n'être transmis qu'une
semaine plus tard.

**Alternatives écartées.**

- Rattacher les inventaires du 1er au 10 au mois précédent : offrait une
  excuse aux sites en retard.
- Exiger deux inventaires dans le mois : excluait le site qui inventorie
  correctement une fois par mois.
- Aligner P2 sur la même fenêtre : P2 mesure la promptitude et garde sa propre
  échéance (3 derniers jours du mois).

**Conséquences.** Environ la moitié des inventaires actuels de la démo tombent
dans la fenêtre : beaucoup de sites seront sanctionnés au début. La fenêtre et
la note de sanction deviendront des paramètres de la grille datée (ticket 03
de `.scratch/cloture-mois-et-composition-piliers`).
