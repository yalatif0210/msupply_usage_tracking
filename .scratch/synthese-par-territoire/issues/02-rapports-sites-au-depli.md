# 02: Rapports et inventaires par territoire : sites d'une zone au dépli

**What to build:** déplier une zone de district affiche ses sites (tous types
de structure), chargés à la demande, avec les mêmes comptes et taux, le type
de structure de chaque site et un lien vers sa fiche.

**Blocked by:** 01

**Status:** done

- [x] API : sites d'une zone pour un mois, mêmes filtres que la vue.
- [x] Front : chargement au dépli, sans démonter la vue ; lien vers la fiche
  site au même mois.
- [x] Tests : la somme des sites d'une zone égale la ligne de la zone ;
  contrôle ajouté au recalcul indépendant (`db/audit/recalcul_independant.sql`).
