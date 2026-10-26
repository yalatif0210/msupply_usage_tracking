# Suivi des stocks : CMM reconstituée et stock projeté

**Status:** ready-for-agent

## Problem Statement

La coordination et les équipes district voient, pour chaque site, des scores
de qualité de données, mais rien ne leur dit où un produit traceur va manquer.
mSupply ne transmet pas sa consommation moyenne mensuelle (CMM), et son stock
théorique ignore les pertes non saisies : un site peut afficher du stock dans
mSupply alors que le stock physique s'épuise. Les analyses de BOUAFLA et de
SOKOURA l'ont montré : sur l'ARV de SOKOURA en septembre, 90 unités dispensées
pour 360 sorties physiques.

## Solution

Un nouveau menu « Suivi des stocks » calcule, pour chaque site et chaque
produit traceur :

- une **CMM reconstituée** (sorties physiques réelles, pertes comprises) :
  `(stock compté au début + réceptions - stock compté à la fin) ÷ jours × 30,4`,
  entre deux inventaires distants d'environ 90 jours ;
- une **CMM déclarée** (dispensations, distributions pour un district) sur la
  même période, pour comparaison ;
- un **stock projeté au jour le jour**, linéaire : dernier stock compté, plus
  les réceptions connues, moins la consommation journalière (CMM reconstituée
  ÷ 30,4), jusqu'à la rupture ou 90 jours après la date de référence ;
- la **date de rupture prévue** et les **jours de couverture** ;
- la comparaison du stock projeté avec les **photos de stock mSupply** (stock
  théorique) : l'écart cumule les pertes non saisies depuis le dernier
  inventaire.

Tout se calcule à une **date t choisie** (par défaut, la fin de fenêtre du
dernier import) : on peut ainsi conjecturer le stock disponible à n'importe
quelle date, passée ou future, avec les seules données connues à cette date.

L'écran se lit site, puis programme, puis produit, avec un encadré des couples
site × produit à signaler (couverture de 15 jours ou moins) ou à surveiller. Aucun effet sur
le score.

## User Stories

1. En tant que coordination, je veux un menu « Suivi des stocks », afin de suivre les stocks séparément de la qualité des données.
2. En tant que coordination, je veux, pour chaque site et chaque produit traceur, une CMM reconstituée, afin d'estimer ce que le site consomme réellement, pertes comprises.
3. En tant que coordination, je veux la CMM déclarée à côté de la CMM reconstituée, afin de voir l'écart dû aux pertes non saisies.
4. En tant que lecteur, je veux voir sur combien de mois porte la CMM (« CMM sur 2 mois »), afin de savoir si elle repose sur assez d'historique.
5. En tant que lecteur, je veux les deux inventaires utilisés comme bornes, avec leurs dates et leurs stocks comptés, afin de vérifier le calcul.
6. En tant que coordination, je veux choisir une date t et obtenir le stock projeté à cette date, afin de conjecturer le stock disponible à n'importe quel jour sans attendre le prochain inventaire.
6 bis. En tant que coordination, je veux qu'une date t passée n'utilise que les données connues à t, afin de comparer après coup la conjecture au stock réellement compté.
7. En tant que coordination, je veux la date de rupture prévue, afin d'anticiper un réapprovisionnement.
8. En tant que coordination, je veux les jours de couverture, afin de comparer les sites entre eux.
9. En tant que coordination, je veux l'écart entre le stock projeté et la photo de stock mSupply, afin de repérer les sites où mSupply surestime le stock.
10. En tant que district, je veux la lecture site, puis programme, puis produit, afin de suivre un site sans me perdre dans les produits des autres.
11. En tant que coordination, je veux regrouper par programme, afin de suivre un programme sur tous ses sites.
12. En tant que coordination, je veux un encadré des couples site × produit en alerte, afin de traiter d'abord les ruptures imminentes.
13. En tant que lecteur, je veux filtrer par région, district, site et programme, filtres reflétés dans l'adresse de la page, afin de partager une lecture en réunion.
14. En tant que lecteur, je veux, pour un couple site × produit, la courbe du stock projeté jour par jour avec les inventaires, les réceptions et les photos mSupply, afin de comprendre la projection.
15. En tant que lecteur, je veux qu'un couple sans CMM calculable le dise et dise pourquoi (pas deux inventaires, sorties nulles ou négatives), afin de ne pas lire un vide comme une absence de risque.
16. En tant que coordination, je veux régler le seuil de couverture qui fait signaler une rupture (15 jours par défaut), afin de l'adapter aux délais de livraison.
17. En tant que coordination, je veux voir à part les couples « à surveiller » (rupture prévue au-delà du seuil), afin d'anticiper sans les confondre avec l'urgence.

## Implementation Decisions

- **Grain** : site × produit traceur, tous programmes (le stock physique est
  commun). Le programme parent d'un produit sur un site est celui sous lequel
  le site l'inventorie (dernier inventaire du produit), à défaut celui de son
  dernier mouvement, à défaut « Programme non renseigné ». Il sert à grouper,
  jamais à filtrer le calcul.
- **Date t** : choisie à l'écran (sélecteur de date, dans l'URL), par défaut
  la fin de fenêtre du dernier import validé. Le calcul se fait « comme si
  l'on était à t » : seuls comptent les inventaires et les réceptions datés
  au plus tard de t ; un inventaire ou une réception postérieurs à t sont
  ignorés.
- **Bornes de la CMM reconstituée à t** : fin = dernier inventaire finalisé du
  produit au site au plus tard à t ; début = l'inventaire le plus proche du début du
  mois situé 3 mois avant le mois de la borne de fin (avec un inventaire par
  mois, le 4e en remontant). S'il manque, le plus ancien inventaire
  disponible dans ces 90 jours ; la CMM porte alors sur moins de mois. Les
  inventaires sont ceux du P4 : dernier finalisé du jour, lots sommés,
  quantité comptée.
- **CMM reconstituée** = `(compté début + réceptions - compté fin) ÷ jours
  entre bornes × 30,4`. Réceptions = factures fournisseur finalisées, datées de
  leur réception, hors lignes d'ajustement, entre les bornes (même règle que
  la consommation reconstituée de P4). Approximation assumée : retours et
  transferts non déduits, ruptures non corrigées.
- **CMM déclarée** = dispensations (distributions pour un district)
  finalisées entre les mêmes bornes ÷ jours × 30,4.
- **Nombre de mois affiché** = jours entre bornes ÷ 30,4, arrondi.
- **Non calculable** : moins de deux inventaires, ou sorties reconstituées
  nulles ou négatives ; la raison est servie.
- **Stock projeté au jour j** (de la borne de fin jusqu'à t + 90 jours) =
  compté à la borne de fin + réceptions connues entre la borne de fin et
  min(j, t) - CMM reconstituée ÷ 30,4 × jours écoulés, plancher 0. Aucune
  réception après t supposée. Le **stock disponible conjecturé à t** est la
  valeur au jour t.
- **Rupture prévue** = premier jour où le stock projeté atteint 0 ;
  **couverture** = stock projeté à t ÷ (CMM ÷ 30,4), en jours.
- **Statut d'un couple à t**, calculé en base :
  - `en_rupture` : stock projeté à 0 à t ;
  - `rupture_signalee` : couverture de 15 jours ou moins (seuil inclus) ;
  - `a_surveiller` : couverture au-delà de 15 jours, mais rupture prévue dans
    l'horizon de projection (t + 90 jours) ;
  - `sans_risque` : aucune rupture prévue dans l'horizon ;
  - `non_calculable` : CMM non calculable.
  Seuil dans `parametre_suivi` (`seuil_couverture_rupture_jours`, 15).
- **Comparaison aux photos** : pour chaque date de photo mSupply postérieure à
  la borne de fin, stock projeté, stock mSupply (somme des lots) et écart,
  affichés sans seuil.
- **Calculs en base** : t étant libre, une vue matérialisée ne suffit pas.
  Une fonction SQL `dqa.stocks_a_date(t)` rend, par couple site × produit, la
  CMM, les bornes, le stock à t, la rupture, la couverture, l'alerte et le
  programme parent ; une fonction `dqa.serie_stock(site, produit, t)` rend la
  série journalière d'un couple. Elles lisent le core (`fact_*`) avec les
  mêmes règles d'inventaire et de réception que `mv_p4_ecart_produit`. L'API
  les appelle, ne recalcule rien.
- **API** : liste des couples (filtres région, district, site, programme,
  alerte ; arborescence site, programme, produit), détail d'un couple (série
  journalière, inventaires, réceptions, photos). Contrats Zod dans
  `@dqa/contracts`.
- **Écran** : nouveau menu « Suivi des stocks » dans la barre de navigation.
  Encadré des couples en alerte en tête ; tableau site, programme, produit
  dépliable ; bascule de regroupement par programme ; détail d'un couple avec
  courbe ApexCharts (stock projeté, inventaires et photos en points). Style
  des tableaux produit de la fiche site. Filtres dans l'URL, sans démonter
  la vue.

## Testing Decisions

- Tests d'intégration sur base éphémère, au niveau du repository et de l'API,
  avec des inventaires, réceptions et dispensations fabriqués à la main
  (modèle : `p4-produit.test.ts`) :
  - bornes : 4e inventaire en remontant ; moins de 90 jours d'historique,
    CMM sur moins de mois ; un seul inventaire, non calculable ;
  - CMM reconstituée et déclarée chiffrées à la main ; sorties ≤ 0, non
    calculable ;
  - stock projeté : réception après la borne de fin, plancher 0, date de
    rupture, couverture ;
  - date t passée : inventaire et réception postérieurs à t ignorés ; date t
    future : aucune réception supposée ;
  - statuts : couverture de 15 jours pile signalée, 16 jours à surveiller, au-delà de l'horizon sans risque, stock à 0 en rupture ;
  - programme parent ; site district (distributions) ;
  - écart à une photo mSupply.
- Tests unitaires web des fonctions de mise en forme et d'arborescence.
- Contrôle indépendant : sur la démo, recalcul à la main de deux couples
  (BOUAFLA, SOKOURA).

## Out of Scope

- Correction des mois de rupture, CMM ajustée.
- Déduction des retours et transferts.
- Prise en compte des commandes ou réceptions futures.
- Extraction de la CMM calculée par mSupply (lignes de réquisition).
- Effet sur le score ou les piliers.
- Produits non traceurs (non extraits).

## Further Notes

- Historique actuel : du 1er août au 22 octobre 2026. Aujourd'hui les CMM
  porteront sur environ 1 à 2 mois ; elles atteindront 3 mois au fil des
  imports.
- Les photos mSupply (14 et 22 octobre) sont le stock théorique du logiciel,
  pas un comptage : un stock projeté inférieur signale des pertes non saisies.
- Les sites qui inventorient le 1er du mois ne posent pas de problème ici :
  la CMM est glissante sur des dates réelles, sans rattachement au mois.
