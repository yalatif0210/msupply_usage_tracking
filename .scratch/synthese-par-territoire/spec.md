# Synthèse nationale par territoire

## Problem Statement

La synthèse nationale lit les rapports (réquisitions) et les inventaires de fin
de mois par **strate** de structure, et les scores par **district** sur une
seule ligne. La coordination et les équipes régionales ne peuvent pas
descendre d'une région à ses zones de district, puis aux sites, pour repérer
où les rapports manquent ou arrivent en retard, ni comparer des territoires de
tailles différentes : la synthèse ne donne que des comptes, pas de taux. Les
sites sans région ou sans district dans mSupply disparaissent des lectures
régionales sans le dire.

## Solution

Une lecture **par territoire** (Région, puis zone de district, puis site) dans
les deux onglets de la synthèse :

- onglet « Rapports & inventaires » : la vue par strate reste, une vue « Par
  territoire » s'ajoute ;
- onglet des scores : la ligne par district devient la même arborescence.

L'arborescence se déplie niveau par niveau ; les sites d'une zone ne se
chargent qu'au dépli. Chaque niveau porte ses comptes et ses taux, trié du plus
faible au plus élevé. Un filtre de strate (par exemple « ESPC ») s'ajoute aux
filtres mois, programme et région, tous reflétés dans l'URL.

## User Stories

1. En tant que coordination nationale, je veux voir les rapports et
   inventaires par région, afin de repérer les régions en retard.
2. En tant que coordination nationale, je veux déplier une région en zones de
   district, afin de trouver la zone qui fait baisser la région.
3. En tant que coordination nationale, je veux déplier une zone de district en
   sites, afin de savoir quel établissement relancer.
4. En tant qu'équipe de district, je veux que la ligne de ma zone compte tous
   les sites rattachés, magasin du district sanitaire compris, afin que le
   total corresponde à mon périmètre réel.
5. En tant que lecteur, je veux, à chaque niveau, les réquisitions et les
   inventaires attendus, réalisés et à l'heure, afin de lire les volumes.
6. En tant que lecteur, je veux les taux « % réalisés » et « % à l'heure »,
   afin de comparer une grande région à une petite zone.
7. En tant que coordination, je veux les territoires triés du plus faible taux
   de réquisitions à l'heure au plus élevé, afin de voir d'abord les
   difficultés.
8. En tant que coordination, je veux que les niveaux sans aucun attendu
   passent en fin de liste, afin qu'ils ne masquent pas les retards.
9. En tant que coordination, je veux garder la vue par strate, afin de
   conserver la lecture par palier de la pyramide sanitaire.
10. En tant que coordination, je veux filtrer la vue par territoire sur une
    strate (par exemple les ESPC seulement), afin de comparer des
    établissements comparables.
11. En tant que coordination, je veux, dans l'onglet des scores, la même
    arborescence Région, zone, site, afin de lire les scores au même grain
    que les rapports.
12. En tant que coordination, je veux pour une région ou une zone le score
    composite moyen, le nombre de sites mesurés et la répartition des
    classifications.
13. En tant que coordination, je veux pour un site son score composite, sa
    classification et le nombre de piliers couverts, avec un lien vers sa
    fiche.
14. En tant que lecteur, je veux que les sites sans région ou sans district
    apparaissent sous « Région non renseignée » / « District non renseigné »,
    afin qu'aucun site ne disparaisse en silence.
15. En tant que lecteur, je veux garder les filtres mois, programme et région ;
    une région filtrée s'affiche seule et déjà dépliée.
16. En tant que lecteur, je veux que l'état des filtres et des niveaux dépliés
    utiles se retrouve dans l'URL, afin de partager une lecture en réunion.
17. En tant que lecteur, je veux que la synthèse s'ouvre sur le dernier mois
    clos, afin de ne pas lire un mois provisoire par défaut.
18. En tant que lecteur, je veux, pour un mois dont l'échéance n'est pas
    passée, la mention « pas encore dû (échéance le JJ/MM) » plutôt que des
    zéros.
19. En tant que lecteur, je veux qu'un changement de filtre ne démonte pas la
    vue et ne vide pas l'arborescence (CLAUDE.md §8).
20. En tant que projection en réunion, je veux des chiffres en `tabular-nums`,
    au format français, et des taux lisibles à distance.

## Implementation Decisions

- **Grain source.** Les comptes de rapports et d'inventaires viennent de
  `hist_pilier_brut` (mesures `p1_requisitions`, `p2_requisitions`,
  `p2_inventaires`), au grain site x mois x programme, comme la vue par strate
  actuelle. Les scores viennent de `hist_score_site`. Aucun recalcul de pilier.
- **Vues SQL.** Une vue matérialisée « rapports par territoire » agrège au
  grain région, zone et site (`GROUPING SETS`), par mois, programme (NULL =
  tous) et strate (NULL = toutes). La synthèse des scores est étendue de la
  même façon (niveau site, dimension strate). Région et district vides sont
  remplacés par les libellés « Région non renseignée » / « District non
  renseigné » au lieu d'être écartés par le `HAVING`. Rafraîchies par
  `rafraichir_et_geler`, comme les autres synthèses.
- **Taux.** Calculés dans la vue : `réalisés / attendus` et `à l'heure /
  attendus`, NULL si rien d'attendu. Le tri du front s'appuie dessus.
- **API.** Deux lectures par onglet : les régions et zones d'un mois (une
  requête), puis les sites d'une zone à la demande. Mêmes paramètres que la
  synthèse (mois, programme, région) plus `strate`. Le mois par défaut est le
  dernier mois clos ; la réponse indique si le mois est dû (`moisClos`, date
  d'échéance la plus tardive) pour le message « pas encore dû ».
- **Contrats.** Nouveaux schémas dans `@dqa/contracts` : ligne de territoire
  (niveau, libellé, comptes, taux, nombre de sites), ligne de site (avec
  identifiant pour le lien vers la fiche), variantes « rapports » et
  « scores ». `parDistrict` laisse place à l'arborescence ; la vue par strate
  garde son contrat.
- **Front.** Une arborescence dépliable sur le modèle de l'écran Programmes :
  une ligne par région, dépliable en zones, puis en sites chargés à la
  demande. Filtres mois, programme, région, strate dans l'URL ; une région
  filtrée s'ouvre dépliée. Les taux s'affichent en pourcentage au format
  français.

## Testing Decisions

- Un bon test vérifie un comportement observable : les comptes et taux d'un
  niveau, le regroupement « non renseigné », le filtre de strate, le tri ; pas
  la forme interne des requêtes.
- **SQL / API** (base éphémère, jamais de mock, CLAUDE.md §3) : sur le modèle
  de `test/synthese-rapports.test.ts` et `test/synthese.test.ts` :
  - une zone compte tous ses sites, magasin du district compris ;
  - un site sans région est rangé sous « Région non renseignée » ;
  - le filtre de strate ne garde que les sites de cette strate ;
  - la somme des zones d'une région égale la région (pas une moyenne de
    moyennes) ;
  - un mois non dû est signalé, pas rendu à zéro.
- **Front** : tri et formatage des taux en tests unitaires (sur le modèle de
  `affichage-fr.test.ts`), parcours visuel sur la démo.
- Le recalcul indépendant (`db/audit/recalcul_independant.sql`) gagne un
  contrôle : somme des sites d'une zone = ligne de la zone.

## Out of Scope

- Changer le calcul des piliers ou des comptes bruts.
- Une lecture par territoire des sous-composantes ou des programmes.
- Les exports (CSV, PDF) de la synthèse.
- Un découpage géographique autre que Région, district (pas de commune ni
  d'aire de santé).

## Further Notes

- Glossaire : *Territoire* et *Zone de district* ajoutés à CONTEXT.md ;
  « district » seul est à éviter quand il peut désigner le magasin du district
  sanitaire.
- Volumétrie : à 40 sites tout tient en mémoire, mais le chargement des sites
  au dépli garde la lecture fluide si le périmètre grandit.
