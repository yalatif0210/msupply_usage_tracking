# Manuel utilisateur · Tableau de bord DQA mSupply

**Destinataires :** toute personne autorisée à consulter le tableau de bord
(équipes district, coordination nationale, DAP).
**Version :** 1.0 (2026-09).

Ce manuel explique ce que montre l'application, comment naviguer d'un écran à
l'autre, et surtout comment chaque chiffre affiché est calculé, formule par
formule, avec un exemple chiffré réel repris du jeu de démonstration.

---

## 1. Ce que fait l'application

Le tableau de bord suit la qualité des données saisies dans mSupply par les
sites sanitaires de son périmètre (40 actuellement, une liste tenue par la
mission DQA et amenée à évoluer). Chaque semaine, la DAP transmet un classeur
Excel extrait de
mSupply ; l'application le valide, l'intègre, puis calcule un **score
composite sur 100** pour chaque site, décomposé en **six piliers** appelés
PAQD (Plan d'Amélioration de la Qualité des Données).

**Point important : les données ne sont pas en temps réel.** Un score reflète
l'état des systèmes au moment du dernier import traité, pas l'instant présent.
L'application affiche toujours la date du mois PAQD auquel un chiffre se
rapporte, pour qu'on ne confonde jamais « ce qui est affiché » et
« aujourd'hui ».

### Le mois PAQD et le cycle PAQD

Un **mois PAQD** est le mois calendaire sur lequel porte une extraction (par
exemple juin 2026). Les mois PAQD sont regroupés par **cycle** de quatre mois
consécutifs, numérotés M+1 à M+4, calés sur l'année civile : C1 (janvier à
avril), C2 (mai à août), C3 (septembre à décembre).

### Les scores sont figés, pas recalculés

Une fois qu'un mois est **clos**, son score ne bouge plus, même si la grille de
poids et de seuils change ensuite : un score de conformité doit rester
défendable en audit (« le score de juin a été calculé avec la grille en
vigueur en juin »). Une modification de la grille par la coordination ne
s'applique donc jamais rétroactivement, seulement aux mois futurs.

### Le tableau de bord n'est pas un cliché mensuel

Le mois en cours n'attend pas d'être terminé pour apparaître : chaque import
hebdomadaire recalcule et met à jour le score de **tous** les mois pour
lesquels il existe des données dans mSupply, y compris le mois qui n'est pas
encore fini. L'objectif est de repérer un mauvais usage de mSupply au fil de
l'eau (aucune saisie depuis plusieurs jours, inventaire toujours pas
enregistré alors que le mois avance), pas seulement de constater après coup
qu'un mois s'est mal passé.

Un score affiché pour le mois en cours reste **provisoire** : il évoluera
encore à mesure que le mois se remplit. Un repère « Mois en cours · score
provisoire » apparaît alors à côté du sélecteur de mois, sur le tableau de
bord national comme sur la fiche site. Il disparaît une fois le mois
**clos** : passé le 10 du mois suivant (l'échéance de réquisition la plus
tardive), plus aucune donnée ne peut encore arriver pour ce mois, et le score
affiché est définitif.

La régularité de saisie (P3) est un **compteur au fil de l'eau** : sur un mois
en cours, elle est mesurée sur les jours déjà écoulés (un site qui dispense
chaque jour ouvré reste proche de 100 %), pas sur le mois entier. Les autres
piliers, eux, partent bas tant que l'inventaire et la réquisition de fin de
mois ne sont pas arrivés : un mois en cours affiche donc presque toujours un
score plus faible que le mois précédent clos, sans que ce soit un mauvais
signe en soi.

---

## 2. Les rôles

| Rôle | Ce qu'il voit | Ce qu'il peut modifier |
|---|---|---|
| `lecteur` | Tous les écrans de consultation (tableau de bord, sites, synthèse, fiches produit) | Rien |
| `coordination` | Tout ce que voit `lecteur`, plus l'écran des imports | Dépôt des classeurs, grille de paramètres, référentiel des produits traceurs, classement des strates de structure |
| `admin` | Tout ce que voit `lecteur` | Comptes utilisateurs |

L'onglet « Imports » n'apparaît que pour la coordination : c'est elle qui
pilote le cycle PAQD et dépose chaque classeur hebdomadaire.

---

## 3. Naviguer dans l'application

### Tableau de bord (page d'accueil, `/`)

Vue d'ensemble nationale du mois PAQD affiché (le plus récent par défaut, mais
tout mois passé reste consultable via le sélecteur **Mois affiché** en haut de
l'écran) : nombre de sites suivis, score composite moyen avec sa progression
par rapport au mois précédent, répartition des sites par classification, une
courbe de progression nationale, et le top 5 des sous-composantes qui mettent
le plus de sites en alerte.

### Sites (`/sites`)

Liste des sites du périmètre, triés du score le plus faible au plus élevé
(les sites en difficulté remontent en tête). Filtres par district et par
programme de santé. Chaque ligne mène à la fiche du site.

### Fiche site (`/sites/:id`)

L'écran le plus détaillé. En tête : filtre par programme de santé et
sélecteur **Mois affiché**. Puis :

- le **score composite** du site sur 100, sa classification, et sa
  **progression** par rapport au mois précédent ;
- une **carte par pilier** (P1 à P6) avec le score du pilier, ses
  sous-composantes, et les couples **attendu / réalisé** (par exemple
  « 2 inventaires attendus, 2 réalisés ») ;
- un **détail ligne à ligne**, dépliable, pour chaque pilier : la liste des
  inventaires, réquisitions, transactions ou ajustements qui ont produit le
  chiffre affiché ;
- une section **Analyse fine** : tableau des dix sous-composantes, un radar
  forces/faiblesses, et des courbes d'évolution sur une plage de mois libre
  (préréglages « cycle courant », « 12 derniers mois », « tout »).

### Fiche produit-mois (`/sites/:id/produits/:code`)

Accessible depuis un code produit du tableau P4 · P5 de la fiche site. Pour un
produit traceur donné, un site et un mois : le stock théorique mSupply contre
le stock physique compté à chaque inventaire, les réceptions, le total
dispensé, les ajustements, et la consommation reconstituée comparée à la
consommation déclarée.

### Synthèse nationale (`/synthese`)

Trois onglets, filtrables par mois, programme et région :

- **Par pilier** : score moyen national, moyenne par pilier, tableau par
  district (cliquer une ligne filtre `/sites` sur ce district), scores par
  programme de santé ;
- **Sous-composantes** : les dix sous-composantes, triables, avec leur taux
  d'atteinte moyen et leurs comptes de statut ;
- **Rapports & inventaires** : réquisitions et inventaires de fin de mois
  attendus, réalisés et réalisés dans les délais, agrégés par strate de
  structure (District sanitaire, Hôpital de référence, ESPC — plus « Non classé » pour un type non mappé).

### Imports (`/imports`, coordination uniquement)

Historique des classeurs reçus : date, fichier, mois PAQD, statut, compteurs,
anomalies. Un champ de dépôt en tête de page envoie un nouveau classeur.

### Écrans d'administration

| Écran | Rôle requis | Contenu |
|---|---|---|
| `/admin/traceurs` | coordination | Liste des produits traceurs suivis par P4 et P5 ; désactiver un produit le retire des calculs futurs sans toucher à son historique |
| `/admin/grille` | coordination | Poids des piliers et seuils des sous-composantes ; une modification crée une nouvelle version, effective au cycle suivant seulement |
| `/admin/comptes` | admin | Comptes utilisateurs et leur rôle |
| `/admin/strates` | lecture ouverte à tout rôle, écriture coordination | Correspondance entre `type_structure` (référentiel DAP) et strate affichée dans « Rapports & inventaires » |

---

## 4. Le score composite et les six piliers

Le score composite d'un site est une **moyenne pondérée** des six scores de
pilier. Chaque pilier a un poids fixe et un seuil de conformité :

| Code | Pilier | Poids | Seuil de conformité |
|---|---|---|---|
| P1 | Complétude des transactions | 10 % | 100 % |
| P2 | Promptitude des transactions | 15 % | = 100 % |
| P3 | Régularité de saisie | 15 % | ≥ 65 % (≥ 80 % pour un district) |
| P4 | Taux de conformité | 25 % | tolérance produit 2 % |
| P5 | Concordance physique / théorique | 25 % | = 100 % |
| P6 | Ratio d'ajustements | 10 % | ≤ 5 % |

Un pilier dont aucune sous-composante n'est calculable ce mois est retiré du
calcul, et les poids des piliers restants sont **renormalisés à 100 %** (la
somme des poids retenus redevient le dénominateur). L'écran affiche alors
« Score calculé sur N piliers sur 6 ».

**Classification** du score composite :

| Classification | Seuil |
|---|---|
| CONFORME | ≥ 90 |
| PARTIELLEMENT CONFORME | 75 à 89 |
| NON CONFORME | < 75 |

Chaque sous-composante a un **statut binaire** : CONFORME (la valeur atteint
le seuil), ALERTE (elle ne l'atteint pas), ou NON CALCULABLE (aucune donnée
exploitable ce mois, avec une raison explicite). Le score d'un pilier vaut
100 quand une sous-composante est CONFORME, 0 quand elle est en ALERTE ; le
score du pilier est la moyenne simple de ses sous-composantes calculables.

---

## 5. Le calcul, pilier par pilier

Les six formules ci-dessous sont illustrées par le même exemple réel :
**le CHR public de Daloa (`31600010`), mois d'août 2026**, tel qu'il
apparaît dans le jeu de démonstration. Score composite du site ce mois-là :
**62,5 / 100**, classé **NON CONFORME** — alors que quatre piliers sur six sont
parfaitement conformes. Le calcul complet est repris section 6.

### P1 · Complétude des transactions (poids 10 %, seuil 100 %)

Trois sous-composantes, chacune un ratio **programmes gérés avec l'activité
attendue ÷ programmes gérés** :

- **Complétude des inventaires** : programmes gérés ayant reçu au moins un
  inventaire finalisé **dans les trois derniers jours du mois**. Un inventaire
  de milieu de mois ne tient pas lieu d'inventaire de fin de mois : cette
  sous-composante et la promptitude des inventaires (P2) sont désormais
  identiques, l'échéance de fin de mois pèse alors 10 % (P1) + 15 % (P2).
- **Complétude des réquisitions** : programmes gérés ayant soumis au moins une
  réquisition couvrant ce mois.
- **Complétude des réceptions** : réceptions finalisées ce mois ÷ factures
  fournisseur du mois (non calculable si aucune facture).

**Exemple (CHR de Daloa, août 2026) :** l'hôpital gère 1 programme (VIH). 1
inventaire finalisé le 29 août (dans les 3 derniers jours) sur 1 attendu
→ 100 %. 1 réquisition sur 1 attendue → 100 %. 2 réceptions sur 2 factures
fournisseur → 100 %. Les trois sous-composantes sont CONFORME (seuil 100 %) :
**score P1 = 100**.

### P2 · Promptitude des transactions (poids 15 %, seuil = 100 %)

Deux sous-composantes, même dénominateur que P1 (programmes gérés), mais on
compte cette fois ceux dont l'activité est arrivée **à temps** :

- **Promptitude des inventaires** : inventaire finalisé dans les **trois
  derniers jours du mois**.
- **Promptitude des réquisitions** : réquisition soumise au plus tard le
  **jour limite** du mois suivant. Ce jour limite dépend du type de
  structure : le 5 pour un ESPC, le 7 pour un hôpital de référence, le 10 pour
  un district sanitaire.

Un programme géré qui n'a rien soumis compte 0, jamais « non calculable » :
ne rien transmettre pénalise ce pilier.

**Exemple :** la réquisition VIH du CHR de Daloa couvrant août est soumise le
2026-09-04, limite le 2026-09-07 (hôpital de référence → 7 jours) : à l'heure —
elle est arrivée par l'extraction du 5 septembre, dans la fenêtre de 45 jours.
L'inventaire du 29 août est dans les 3 derniers jours. Inventaire et réquisition
à l'heure :
**score P2 = 100**.

### P3 · Régularité de saisie (poids 15 %)

Une seule sous-composante, mais elle se mesure différemment selon le type de
site.

**Sites qui dispensent (seuil ≥ 65 %).** **Jours du mois avec au moins une
sortie de stock (dispensation) ÷ jours du mois.** Aucun jour n'est retranché :
la dispensation a lieu 7 jours sur 7 en milieu hospitalier, ni les week-ends ni
les jours fériés ne sont défalqués. C'est un **compteur au fil de l'eau, borné
au mois** : le dénominateur croît jour après jour et plafonne au dernier jour
du mois. Un mois en cours est mesuré sur les jours écoulés (au 5 septembre, un
site qui dispense chaque jour ouvré est à ~100 %), un mois clos sur tous ses
jours ; le mois se stabilise de lui-même à sa clôture.

P3 est **toujours calculable** pour un site de soins : aucune sortie sur les
jours écoulés vaut **0 %** / ALERTE, jamais « non calculable ». Un hôpital qui
ne dispense rien est un signal, pas une absence de données.

*Exemple :* août compte 31 jours ; le CHR public de Daloa a enregistré une dispensation sur 22
d'entre eux → 22 / 31 = **71,0 %**, au-dessus du seuil de 65 % : **score
P3 = 100**.

**Districts (seuil ≥ 80 %).** Un district ne dispense pas ; sa régularité, c'est
répondre aux réquisitions de ses sites rattachés. Pour le mois PAQD M :
**réquisitions distinctes de la zone couvrant le mois M-1, servies dans M par
une distribution du district, ÷ réquisitions distinctes de la zone couvrant
M-1.** La « zone » est l'ensemble des sites du périmètre du même district.
Plusieurs distributions pour une réquisition comptent pour une. NON_CALCULABLE
si la zone n'a aucune réquisition à évaluer.

*Exemple :* pour le P3 de juillet, on regarde les réquisitions de juin. Trois
sites de la zone en ont soumis une ; le district a servi les trois avant fin
juillet → 3 / 3 = **100 %**, au-dessus de 80 % : **score P3 = 100**. Le mois
suivant il n'en sert que 2 sur 3 → 66,7 % → **ALERTE**.

Sur les écrans, le libellé du pilier s'adapte : « Régularité de saisie
(dispensation) » pour un centre de santé, « (distribution) » pour un district.
Le seuil district (80 %) est modifiable dans la grille de paramètres.

### P4 · Taux de conformité (poids 25 %, tolérance produit 2 %)

Deux sous-composantes, chacune un **taux de conformité** : la part des
produits traceurs qui restent dans la tolérance de la grille, pas une
amplitude d'écart moyenne.

- **Écart SDU (stock disponible utilisable)** : au dernier inventaire
  finalisé du mois, pour chaque produit traceur,
  `|théorique - compté| / compté`. En dessous de la tolérance (2 %) : le
  produit est conforme. **0 %** si le site n'a fait aucun inventaire du mois.
- **Écart consommation** : on compare la consommation **déclarée**
  (dispensations enregistrées ; pour un district, quantités **distribuées** —
  la sous-composante se lit alors « écart distribution ») à la consommation
  **reconstituée** `stock_ouverture + réceptions - stock_clôture` entre deux
  bornes **inter-mois** : ouverture = dernier inventaire finalisé du **mois
  précédent**, clôture = dernier inventaire finalisé du mois. Un seul inventaire
  de fin de mois par mois suffit donc. À défaut d'inventaire le mois précédent,
  on retombe sur le premier et le dernier inventaire du mois (s'il y en a deux).
  Écart `|déclarée - reconstituée| / reconstituée` en dessous de la tolérance :
  conforme. **0 %** si aucune borne d'ouverture n'est exploitable ; « non
  calculable » seulement si des bornes existent mais qu'aucune consommation
  reconstituée n'est positive.

**Exemple, écart SDU (le CHR de Daloa, août 2026) :** sur le DTG/3TC/TDF (ARV),
théorique 402, compté 388 → écart |402 - 388| / 388 = **3,6 %**, au-dessus de
la tolérance de 2 % : non conforme. Sur le test VIH (WONDFO), 138 / 138 → 0 %,
conforme. 1 produit conforme sur 2 → **taux écart SDU = 50 %**, sous le seuil
de taux de 90 % → ALERTE.

**Exemple, écart consommation (même site) :** sur l'ARV, stock d'ouverture
(dernier inventaire de juillet) 386, réceptions d'août 46, stock de clôture
(inventaire du 29 août) 388 → reconstituée = 386 + 46 - 388 = 44. Déclarée = 44
(somme des dispensations d'août). Écart = |44 - 44| / 44 = **0 %**, conforme.
Le test VIH est également conforme → **taux écart consommation = 100 %** →
CONFORME.

**Score P4** = moyenne des deux sous-composantes calculables =
(0 + 100) / 2 = **50**.

### P5 · Concordance physique / théorique (poids 25 %, seuil = 100 %)

Une sous-composante : au dernier inventaire finalisé du mois, pour chaque
produit traceur, `min(|théorique|, |compté|) / max(|théorique|, |compté|)`,
moyenné sur tous les produits inventoriés du site. **0 %** si le site n'a fait
aucun inventaire du mois (ne pas inventorier est un manquement, pas une absence
de données).

**Exemple :** sur les 2 produits traceurs du CHR de Daloa en août, la concordance
moyenne est **98,3 %** (96,5 % sur l'ARV, 100 % sur le test VIH). Le seuil de
cette sous-composante est **= 100 %** exactement (contrairement à P4, aucune
tolérance n'est admise) : un écart de 1,7 % suffit à placer la sous-composante
en ALERTE. Comme P5 n'a qu'une seule sous-composante et que le score de pilier
est binaire, **score P5 = 0**, alors même que 98,3 % semble être un bon
résultat en apparence.

### P6 · Ratio d'ajustements (poids 10 %, seuil ≤ 5 %)

Une sous-composante : `ajustements d'inventaire ÷ total des mouvements de
stock du mois`, en pourcentage. Un ajustement est repéré soit par son lien
avec un inventaire (`invad_additions_id` / `invad_reductions_id` côté
mSupply), soit par le indicateur ligne à ligne `is_from_inventory_adjustment`.
Plus ce ratio est bas, mieux c'est : un ajustement corrige un défaut de
traçabilité, il ne devrait pas être le mode normal de gestion du stock.

**Exemple :** le CHR de Daloa a enregistré 46 mouvements de stock en août, dont aucun
ajustement → 0 / 46 = **0 %**, sous le seuil de 5 % : **score P6 = 100**.

---

## 6. Le score composite, pas à pas

Reprenons l'exemple complet du CHR de Daloa, août 2026 :

| Pilier | Score | Poids |
|---|---|---|
| P1 · Complétude | 100 | 10 % |
| P2 · Promptitude | 100 | 15 % |
| P3 · Régularité | 100 | 15 % |
| P4 · Taux de conformité | 50 | 25 % |
| P5 · Concordance | 0 | 25 % |
| P6 · Ratio d'ajustements | 100 | 10 % |

Les six piliers sont calculables ce mois-ci, donc aucune renormalisation :

```
score composite = (100×10 + 100×15 + 100×15 + 50×25 + 0×25 + 100×10) / 100
                = (1000 + 1500 + 1500 + 1250 + 0 + 1000) / 100
                = 6250 / 100
                = 62,5
```

62,5 est inférieur à 75 : le site est classé **NON CONFORME**, malgré quatre
piliers sur six parfaitement conformes. C'est le rôle du poids : P4 et P5
pèsent à eux seuls la moitié du score (25 % + 25 %), et une seule
sous-composante en alerte sur P5 (98,3 % de concordance, sous le seuil de
100 %) suffit à faire basculer tout le pilier à 0.

Sur le jeu de démonstration (mai à septembre 2026), le score composite moyen
national suit **95,3 puis 90,6 puis 92,8 puis 89,0 puis 69,2**. Août et
septembre sont **provisoires** : une extraction du 5 septembre a fait remonter
les réquisitions d'août du CHR de Daloa et du district de Daloa, et septembre ne
compte encore que cinq jours de données — aucun site n'y a fait son inventaire
de fin de mois, d'où la chute. Points de vigilance d'un mois à l'autre : le CHR
public de Bondoukou (réquisition en retard, régularité de saisie faible, écarts
SDU) qui reste NON CONFORME, le district de Niakaramadougou (réponse partielle
aux réquisitions de sa zone — P3 « distribution » à 2/3 puis 3/3 puis 2/3), et
le CSR-DM public de Bobia (réquisition jamais soumise).

---

## 7. Le taux d'atteinte

Sur l'écran de synthèse et les tableaux de sous-composantes, une colonne
« taux d'atteinte » complète le statut binaire CONFORME/ALERTE : c'est un
chiffre entre 0 et 100 qui dit **à quel point** on est proche ou loin du
seuil, là où le statut ne dit que oui ou non.

- Pour les sous-composantes P4 (écart SDU, écart consommation), le taux de
  conformité **est déjà** un taux d'atteinte : il est repris tel quel.
- Pour une sous-composante à sens plancher (P1, P2, P3, P5 : plus il faut être
  **au-dessus** du seuil) : `valeur / seuil`, plafonné à 100. Une régularité
  de saisie à 58 % pour un seuil de 65 % donne un taux d'atteinte de
  58 / 65 ≈ 89 %, même si le statut reste ALERTE : on voit qu'on est proche.
- Pour la sous-composante à sens plafond (P6 : plus il faut être
  **en dessous** du seuil) : `seuil / valeur`, plafonné à 100. Un ratio
  d'ajustements à 0 % donne un taux d'atteinte de 100 (l'objectif « rester
  sous le plafond » est atteint au mieux).

Le seuil utilisé est toujours celui de la **grille figée au moment du calcul**
du mois affiché, jamais la grille en vigueur aujourd'hui (cohérent avec le
principe des scores immuables, section 1).

---

## 8. Lire les indications à l'écran

- **Badge de statut** (CONFORME / ALERTE / NON CALCULABLE) sur chaque
  sous-composante : NON CALCULABLE porte toujours une raison explicite (aucune
  facture reçue, réquisitions de zone absentes pour un district, etc.). Il se
  réserve aux vrais trous de données : le **silence** d'un site attendu actif
  (aucune sortie de stock, aucun inventaire de fin de mois) est rendu par un
  **0 % / ALERTE**, pas par NON CALCULABLE.
- **« Score calculé sur N piliers sur 6 »** : apparaît quand au moins un
  pilier est NON CALCULABLE ce mois ; les poids des piliers restants ont été
  renormalisés (section 4).
- **Avertissement « données modifiées depuis le gel »** : le détail ligne à
  ligne d'un pilier est toujours lu en direct des données du core, jamais
  figé. Si ces données ont été corrigées après le calcul du mois (un
  réimport, par exemple), le détail affiché peut diverger légèrement des
  comptes agrégés de la carte de pilier ; cet avertissement le signale.
- **« Progression (score composite) »** : écart en points par rapport au mois
  précédent disponible pour le site (ou national, sur le tableau de bord),
  vert si le score progresse, rouge s'il recule, gris si l'historique est
  trop court pour comparer.
- **« Mois en cours · score provisoire »** : le mois affiché n'est pas encore
  clos (section 1) ; le score continuera d'évoluer aux prochains imports.

---

## 9. Glossaire

| Terme | Définition |
|---|---|
| Mois PAQD | Le mois calendaire sur lequel porte une extraction et pour lequel les scores sont calculés |
| Cycle PAQD | Quatre mois consécutifs (M+1 à M+4), trois cycles par an calés sur l'année civile |
| Score composite | Note sur 100 d'un site, moyenne pondérée des six scores de pilier, tous programmes confondus |
| Grille de paramètres | Le jeu daté des poids de pilier et des seuils de sous-composante, éditable par la coordination, effectif au cycle suivant seulement |
| Produit traceur | Un produit suivi de près pour les piliers P4, P5 et P6 ; la liste est administrée par la coordination |
| Programme de santé | Un programme vertical géré par un site (VIH, paludisme, etc.) ; le nombre de programmes gérés détermine le nombre d'inventaires et de réquisitions attendus chaque mois |
| Strate de structure | Le regroupement de type de structure (District sanitaire, Hôpital de référence, ESPC — plus « Non classé » pour un type non mappé) utilisé pour la synthèse « Rapports & inventaires » |
