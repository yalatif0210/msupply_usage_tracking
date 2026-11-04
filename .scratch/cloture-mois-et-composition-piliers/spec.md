# Clôture de mois, composition paramétrable des piliers et transparence du score

**Status:** ready-for-agent

## Problem Statement

P4 (taux de conformité) et P5 (concordance) prennent aujourd'hui l'inventaire
« du mois » au sens calendaire : un inventaire du 3 novembre décrit pourtant
le stock de fin octobre, un inventaire du 15 n'est ni une ouverture ni une
clôture, et un site qui n'inventorie pas en fin de mois n'est sanctionné que
s'il n'inventorie pas du tout. Les sites en tirent une excuse au lieu d'une
habitude.

Dans P4, l'écart SDU mesure le même écart stock théorique - stock compté que
P5, sur le même inventaire : une perte non saisie est comptée deux fois. La
composition des piliers est figée dans le SQL : la changer exige une
migration.

Enfin, un score affiché ne dit pas comment il a été obtenu. En réunion, un
district qui conteste un chiffre ne peut pas remonter de la note composite aux
sous-composantes.

## Solution

1. **Clôture de mois (P4, P5).** Le mois n est clôturé par un inventaire fait
   dans les 3 derniers jours de n ou le 1er de n+1 (le dernier de la fenêtre
   est retenu). L'ouverture de n est la clôture retenue de n-1.
   - clôture et ouverture : P4 et P5 calculés ;
   - clôture sans ouverture : P5 calculé, P4 à 0 (sanction) ;
   - pas de clôture : P4 et P5 à 0 (sanction) ;
   - mois dont la date de clôture n'est pas encore couverte par les données :
     non calculable.
   Un inventaire hors fenêtre ne compte pas pour P4 ni P5. P2 garde sa propre
   fenêtre (3 derniers jours du mois). Application rétroactive : le système
   n'est pas encore déployé.
2. **Composition des piliers paramétrable.** La grille datée porte, par
   pilier, les sous-composantes activées et leur poids. Une sous-composante
   activée compte dans le score de son pilier. Grille actuelle : P4 = écart de
   consommation 100 %, écart SDU désactivé.
3. **Valeurs des règles dans la grille.** Jours de fin de mois et jours du
   mois suivant de la fenêtre de clôture, note de sanction, bornes de
   classification (90, 75). Modifiables dans l'écran d'administration.
4. **Transparence.** L'API renvoie la décomposition de chaque score
   (sous-composantes, valeurs, seuils, notes, poids, grille et version,
   agrégation). Fiche site : un dépliable par pilier et pour le composite,
   avec les valeurs du site. Écrans de liste et de synthèse : un dépliable
   « Comment ces scores sont calculés » qui décrit la grille du mois affiché.
5. **Statistiques des produits écartés.** Produits présents à la clôture mais
   absents de l'ouverture (et l'inverse), écartés de P4 pour ce seul produit ;
   comptés par site et mois, affichés dans la fiche site et la synthèse
   nationale, sans effet sur le score.

## User Stories

1. En tant que coordination nationale, je veux qu'un mois ne soit clôturé que
   par un inventaire de fin de mois, pour installer l'habitude de l'inventaire
   de clôture.
2. En tant que coordination, je veux qu'un site sans inventaire de clôture
   perde les points de P4 et P5, pour que l'absence d'inventaire ne soit plus
   neutre.
3. En tant que coordination, je veux qu'un site sans ouverture perde P4 mais
   garde P5, parce que la concordance ne dépend que de la clôture.
4. En tant qu'équipe district, je veux qu'un inventaire du 1er du mois compte
   comme clôture du mois précédent, parce que c'est l'usage de nombreux sites.
5. En tant qu'équipe district, je veux qu'un mois dont la clôture n'est pas
   encore passée reste « non calculable », pour ne pas sanctionner trop tôt.
6. En tant que coordination, je veux que P4 ne mesure que l'écart de
   consommation, pour qu'une perte non saisie ne soit pas comptée deux fois
   avec P5.
7. En tant que coordination, je veux activer ou désactiver une sous-composante
   et régler son poids dans une grille datée, sans migration.
8. En tant que coordination, je veux régler la fenêtre de clôture, la note de
   sanction et les bornes de classification dans la grille.
9. En tant que participant à une réunion, je veux déplier un score de la fiche
   site et voir ses sous-composantes, leurs valeurs, seuils, notes et poids
   jusqu'à la note composite.
10. En tant que lecteur d'un écran de synthèse, je veux un rappel de la
    méthode de calcul du mois affiché.
11. En tant que coordination, je veux voir par site combien de produits ont été
    écartés de P4 faute d'apparaître dans les deux inventaires, pour repérer les
    oublis récurrents.
12. En tant qu'équipe district, je veux que l'écran explique pourquoi un
    produit ou un site a été écarté ou sanctionné.

## Implementation Decisions

- Fenêtre de clôture : une fonction SQL unique, lue par P4 et P5, paramétrée
  par la grille du mois (ticket 03 ; valeurs en dur 3 et 1 au ticket 01).
- « Mois couvert par les données » : la fin de fenêtre du dernier import
  validé atteint le 1er de n+1. On ne juge pas sur la date du jour : les
  données arrivent chaque semaine, un site ne doit pas être sanctionné avant
  que son inventaire du 1er ait pu être transmis.
- Plusieurs inventaires dans la fenêtre : le dernier (date, heure, numéro),
  selon la règle d'inventaire retenu existante (ADR 0016).
- Produit absent d'un des deux inventaires : écarté de l'écart de consommation
  pour ce produit, raison affichée ; dénominateur = produits présents dans les
  deux.
- Composition : nouvelle table de grille (pilier, sous-composante, active,
  poids). Le score d'un pilier est la moyenne pondérée des notes des
  sous-composantes actives calculables.
- La décomposition du score est produite par la base (vues ou fonctions) et
  transportée par un contrat Zod ; l'écran ne recalcule rien.
- ADR 0022 : clôture de mois et sanction (amende les ADR 0012 et 0014).

## Testing Decisions

- Tests d'intégration sur base éphémère, au niveau de l'API (seam existant des
  tests piliers) : un cas par règle, passant et échouant.
- Clôture : inventaire le dernier jour, le 1er de n+1, le 4e jour avant la fin
  (hors fenêtre), deux inventaires dans la fenêtre, ouverture manquante,
  clôture manquante, mois non couvert.
- Composition : une grille où l'écart SDU est actif retrouve l'ancien calcul.
- Transparence : la décomposition renvoyée redonne exactement le score
  affiché.

## Out of Scope

- Paramétrage des formules elles-mêmes (méthode d'inventaire retenu, de
  reconstitution de la consommation) : migrations et ADR.
- Changement de P2.
- Fusion des codes produit (un code = un produit).

## Further Notes

Le dénominateur de P4 reste le nombre de produits inventoriés (présents dans
les deux inventaires) : un produit non inventorié ne cache pas forcément une
mauvaise intention.
