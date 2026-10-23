# Manuel utilisateur · SUM, suivi de l'utilisation de mSupply

**SUM** (Suivi de l'Utilisation de mSupply), anciennement « Tableau de bord
DQA », suit l'utilisation et la qualité des données mSupply des sites du
périmètre.

**Destinataires :** toute personne autorisée à consulter le tableau de bord
(équipes district, coordination nationale, DAP).
**Version :** 1.4 (2026-10).

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
chaque jour reste proche de 100 %), pas sur le mois entier. Les piliers qui
dépendent de l'inventaire ou de la réquisition de fin de mois (P1, P2, P4, P5)
sont **non calculables** tant que ces échéances ne sont pas arrivées : ils
sortent du calcul, et le score d'un mois en cours ne porte que sur P3 et P6.
Il peut donc **paraître élevé** alors qu'il ne reflète qu'une partie du
tableau : c'est pour cela qu'il est marqué « provisoire » et que la courbe de
progression le relie **en pointillé**.

---

## 2. Les rôles

| Rôle | Ce qu'il voit | Ce qu'il peut modifier |
|---|---|---|
| `lecteur` | Tous les écrans de consultation (tableau de bord, sites, synthèse, fiches produit) | Rien |
| `coordination` | Tout ce que voit `lecteur`, plus l'écran des imports | Dépôt des classeurs, grille de paramètres, référentiel des types de structure |
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

Trois onglets, filtrables par mois, programme, région et strate. La page
s'ouvre sur le **dernier mois clos** ; les filtres se retrouvent dans l'adresse
de la page, qu'on peut partager pour retrouver la même lecture en réunion.

- **Par pilier** : score moyen national, moyenne par pilier, lecture **par
  territoire** (voir ci-dessous), scores par programme de santé ;
- **Sous-composantes** : les dix sous-composantes, triables, avec leur taux
  d'atteinte moyen et leurs comptes de statut ;
- **Rapports & inventaires** : réquisitions et inventaires de fin de mois
  attendus, réalisés et réalisés dans les délais. Deux lectures au choix :
  **par strate** de structure (District sanitaire, Hôpital de référence, ESPC ;
  « Non classé » pour un type non mappé) ou **par territoire**.

**Lecture par territoire.** Un tableau en arborescence : chaque **région** se
déplie en **zones de district**, chaque zone en **sites**. Une zone de district
regroupe tous les sites du district, magasin du district sanitaire compris. Un
site sans région ou sans district dans mSupply apparaît sous « Région non
renseignée » ou « District non renseigné » : il n'est jamais écarté.

- Rapports & inventaires : pour chaque ligne, les comptes attendus, réalisés et
  à l'heure, avec les taux « % réalisés » et « % à l'heure » (« s/o » quand rien
  n'était attendu). Les lignes sont triées du plus faible taux de réquisitions
  à l'heure au plus élevé : les territoires en difficulté sont en tête.
- Scores : pour une région ou une zone, le score composite moyen (sur les seuls
  sites mesurés), le nombre de sites mesurés et la répartition des
  classifications ; pour un site, son score, sa classification, le nombre de
  piliers couverts et un lien vers sa fiche. Le lien « liste des sites » d'une
  zone ouvre `/sites` filtré sur ce district. Tri du plus faible score moyen au
  plus élevé.
- Le filtre **Strate** (par exemple « ESPC ») ne garde que les sites de cette
  strate ; il ne s'applique qu'aux lectures par territoire. Un filtre de région
  affiche cette région déjà dépliée.
- Pour un mois dont l'échéance n'est pas passée, la lecture des rapports
  indique « pas encore dus (échéance le JJ/MM) » au lieu de chiffres
  provisoires.

### Imports (`/imports`, coordination uniquement)

Historique des classeurs reçus : date, fichier, mois PAQD, statut, compteurs,
anomalies. Un champ de dépôt en tête de page envoie un nouveau classeur.

### Écrans d'administration

| Écran | Rôle requis | Contenu |
|---|---|---|
| `/admin/traceurs` | coordination (consultation) | Liste des produits traceurs suivis par P4 et P5. Elle ne se saisit pas à l'écran : elle vient du script d'extraction de la DAP. Chaque import reprend l'onglet PRODUITS : ses produits sont traceurs d'office, un produit absent du dernier fichier passe **inactif** (il sort des calculs suivants, son historique reste intact). Changer le panier, c'est faire modifier la liste du script par la DAP |
| `/admin/grille` | coordination | Poids des piliers et seuils des sous-composantes ; une modification crée une nouvelle version, effective au cycle suivant seulement |
| `/admin/comptes` | admin | Comptes utilisateurs et leur rôle |
| `/admin/strates` (« Types de structure ») | lecture ouverte à tout rôle, écriture coordination | Référentiel des `type_structure` (référentiel DAP) : la **strate** affichée dans « Rapports & inventaires », le **jour limite** de soumission d'une réquisition (P2), et le **régime** de scoring (district ou site de soins). Un type non renseigné : strate « Non classé », jour limite 10, régime site de soins |

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
**62,5 / 100**, classé **NON CONFORME**, alors que quatre piliers sur six sont
parfaitement conformes. Le calcul complet est repris section 6.

### P1 · Complétude des transactions (poids 10 %, seuil 100 %)

Deux sous-composantes. L'inventaire n'en fait plus partie : il était déjà
mesuré, à l'identique, par la promptitude des inventaires (P2).

- **Complétude des réquisitions** : programmes **éligibles** ayant soumis au
  moins une réquisition couvrant ce mois ÷ programmes éligibles. Les programmes
  éligibles se règlent dans l'écran **Programmes** : un programme rattaché au
  site dans mSupply mais qu'il ne gère pas se désactive là, et un import ne
  revient jamais sur ce choix. Avant le jour limite de soumission (5, 7 ou 10
  du mois suivant selon le type de structure), la sous-composante est **non
  calculable**, jamais 0.
- **Complétude des réceptions** : on part des réquisitions **ordinaires**
  finalisées du site qui couvrent le mois précédent, puis des factures
  fournisseur qui y répondent. Taux = factures **acceptées (finalisées) dans
  leur mois d'émission** ÷ toutes ces factures, y compris celles que le site
  n'a pas encore prises en main. Le mois d'émission est celui de la livraison
  du district, à défaut celui de la création de la facture (site livré par la
  NPSP). Ce taux se suit **en continu** pendant le mois : un taux bas en cours
  de mois signale des factures à faire accepter. Non calculable si aucune
  facture ne répond aux réquisitions.

**Exemple (CHR de Daloa, août 2026) :** l'hôpital a 1 programme éligible
(VIH). 1 réquisition couvrant août sur 1 attendue → 100 %. La réquisition
ordinaire de juillet a reçu 2 factures, acceptées toutes deux en août, leur
mois d'émission → 100 %. Les deux sous-composantes sont CONFORME (seuil
100 %) : **score P1 = 100**.

Le bloc **Suivi des réceptions** de la fiche site (hors score) complète ce
pilier : part des réquisitions du mois précédent qui ont reçu une facture, et
liste des factures encore en attente, signalées au-delà de 7 jours.

### P2 · Promptitude des transactions (poids 15 %, seuil = 100 %)

Deux sous-composantes, même dénominateur que P1 (programmes éligibles), mais
on compte cette fois ceux dont l'activité est arrivée **à temps** :

- **Promptitude des inventaires** : inventaire finalisé dans les **trois
  derniers jours du mois**.
- **Promptitude des réquisitions** : réquisition soumise au plus tard le
  **jour limite** du mois suivant. Ce jour limite dépend du type de structure
  et vient du référentiel administré (écran « Types de structure ») : par
  défaut le 5 pour un ESPC, le 7 pour un hôpital de référence, le 10 pour un
  district sanitaire, un CHU ou un institut. La coordination peut l'ajuster
  par type sans nouvelle livraison.

Une fois l'échéance passée (dernier jour du mois pour l'inventaire, jour
limite du mois suivant pour la réquisition), un programme éligible qui n'a rien
soumis compte 0 : ne rien transmettre pénalise ce pilier. Avant l'échéance, la
sous-composante est non calculable : le délai n'est pas écoulé.

**Exemple :** la réquisition VIH du CHR de Daloa couvrant août est soumise le
2026-09-04, limite le 2026-09-07 (hôpital de référence → 7 jours) : à l'heure,
elle est arrivée par l'extraction du 5 septembre, dont la fenêtre couvre juillet, août et septembre.
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

Deux sous-composantes, **Conformité SDU** et **Conformité consommation**,
chacune un **taux de conformité** : la part des produits traceurs qui restent
dans la tolérance de la grille, pas une amplitude d'écart moyenne.

**Lire « ≥ 90 · tolérance 2 % ».** C'est ainsi que la grille de paramètres
affiche ces deux sous-composantes. Les deux nombres ne mesurent pas la même
chose :

- **tolérance 2 %** s'applique à **chaque produit** : l'écart d'un produit
  (entre théorique et compté, ou entre consommation déclarée et
  reconstituée) doit rester sous 2 % pour que ce produit soit conforme ;
- **≥ 90** s'applique au **site** : la part de ses produits traceurs conformes
  doit atteindre au moins 90 % pour que la sous-composante soit CONFORME.

Avec 13 traceurs, un site est donc CONFORME s'il en a au moins 12 dans la
tolérance (12 / 13 = 92 %) ; à 11 sur 13 (85 %), il passe en ALERTE. Le mot
« écart » ne désigne à l'écran que l'écart d'**un produit** (colonnes du
tableau produit de la fiche site, fiche produit-mois) ; le taux du site
s'appelle « conformité ».

- **Conformité SDU (stock disponible utilisable)** : au dernier inventaire
  finalisé du mois, pour chaque produit traceur,
  `|théorique - compté| / compté`. En dessous de la tolérance (2 %) : le
  produit est conforme. Si le site n'a fait aucun inventaire du mois : **0 %**
  une fois le mois **clos**, mais **non calculable** tant qu'il est **en
  cours** (l'inventaire de fin de mois n'est pas encore attendu).
- **Conformité consommation** : on compare la consommation **déclarée**
  (dispensations enregistrées ; pour un district, quantités **distribuées**,
  la sous-composante se lit alors « conformité distribution ») à la consommation
  **reconstituée** `stock_ouverture + réceptions - stock_clôture` entre deux
  bornes **inter-mois** : ouverture = dernier inventaire finalisé du **mois
  précédent**, clôture = dernier inventaire finalisé du mois. Un seul inventaire
  de fin de mois par mois suffit donc. À défaut d'inventaire le mois précédent,
  on retombe sur le premier et le dernier inventaire du mois (s'il y en a deux).
  Écart `|déclarée - reconstituée| / reconstituée` en dessous de la tolérance :
  conforme. Sans aucune borne d'ouverture exploitable : **0 %** si le mois est
  clos, **non calculable** s'il est en cours. « Non calculable » aussi quand
  des bornes existent mais qu'aucune consommation reconstituée n'est positive.

**Exemple, conformité SDU (le CHR de Daloa, août 2026) :** sur le DTG/3TC/TDF (ARV),
théorique 402, compté 388 → écart |402 - 388| / 388 = **3,6 %**, au-dessus de
la tolérance de 2 % : non conforme. Sur le test VIH (WONDFO), 138 / 138 → 0 %,
conforme. 1 produit conforme sur 2 → **conformité SDU = 50 %**, sous le seuil
de taux de 90 % → ALERTE.

**Exemple, conformité consommation (même site) :** sur l'ARV, stock d'ouverture
(dernier inventaire de juillet) 386, réceptions d'août 46, stock de clôture
(inventaire du 29 août) 388 → reconstituée = 386 + 46 - 388 = 44. Déclarée = 44
(somme des dispensations d'août). Écart = |44 - 44| / 44 = **0 %**, conforme.
Le test VIH est également conforme → **conformité consommation = 100 %** →
CONFORME.

**Score P4** = moyenne des deux sous-composantes calculables =
(0 + 100) / 2 = **50**.

### P5 · Concordance physique / théorique (poids 25 %, seuil = 100 %)

Une sous-composante : au dernier inventaire finalisé du mois, pour chaque
produit traceur (tous ses lots additionnés),
`min(|théorique|, |compté|) / max(|théorique|, |compté|)`, moyenné sur tous
les produits inventoriés du site. Si le site n'a fait aucun
inventaire du mois : **0 %** une fois le mois clos (ne pas inventorier est
alors un manquement, pas une absence de données), mais **non calculable** tant
que le mois est en cours. P5 n'ayant qu'une sous-composante, le pilier entier
suit.

**Exemple :** sur les 2 produits traceurs du CHR de Daloa en août, la concordance
moyenne est **98,3 %** (96,5 % sur l'ARV, 100 % sur le test VIH). Le seuil de
cette sous-composante est **= 100 %** exactement (contrairement à P4, aucune
tolérance n'est admise) : un écart de 1,7 % suffit à placer la sous-composante
en ALERTE. Comme P5 n'a qu'une seule sous-composante et que le score de pilier
est binaire, **score P5 = 0**, alors même que 98,3 % semble être un bon
résultat en apparence.

### Quel inventaire compte pour P4 et P5 ?

- **Plusieurs inventaires le même jour.** Un site peut finaliser plusieurs
  inventaires le même jour sur le même produit, par exemple un recomptage
  après une erreur de saisie. Seul le **dernier finalisé** compte (heure de
  l'inventaire, puis numéro attribué par mSupply) : on ne les additionne
  jamais, ce qui doublerait le stock.
- **Programmes.** Un inventaire compte pour le programme sous lequel il a été
  fait. Le stock, lui, appartient au site : un produit suivi par deux
  programmes est le même stock physique. La ligne d'un programme lit le
  dernier inventaire de ce programme ; la ligne « tous programmes » lit le
  dernier inventaire du jour, tous programmes confondus. Un inventaire ou un
  mouvement saisi sans programme ne compte que dans « tous programmes ».
- **Un produit, plusieurs articles.** Dans mSupply, un même médicament peut
  être enregistré sous deux articles qui portent le même code (parfois avec
  une unité différente). Chaque article est contrôlé séparément, pour ne pas
  masquer une confusion entre les deux ; mais dans les taux de P4 et P5, le
  code ne compte **qu'une fois**, et il n'est conforme que si **tous** ses
  articles le sont. Dans le tableau produit de la fiche site, ce code
  apparaît sur une ligne de synthèse suivie d'une ligne par article.

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
national suit **95,3 puis 90,6 puis 92,8 puis 89,0 puis 92,5**. Août et
septembre sont **provisoires** : une extraction du 5 septembre a fait remonter
les réquisitions d'août du CHR de Daloa et du district de Daloa, et septembre ne
compte encore que cinq jours de données. Aucun site n'y a fait d'inventaire ni
soumis de réquisition : P1, P2 (inventaire et réquisition de fin de mois pas
dus), P4 (conformité SDU et consommation) et P5 (concordance) sont tous **non
calculables** tant que le mois est en cours (ADR 0014). Le score de septembre
ne porte donc que sur P3 et P6 : il reste élevé, mais **provisoire**. Sur la
courbe de progression, le segment qui mène à un mois en cours est tracé **en
pointillé** pour rappeler qu'il n'est pas comparable aux mois clos. Points de
vigilance d'un mois à l'autre : le CHR public de Bondoukou (réquisition en
retard, régularité de saisie faible, écarts SDU) qui reste NON CONFORME, le
district de Niakaramadougou (réponse partielle aux réquisitions de sa zone,
P3 « distribution » à 2/3 puis 3/3 puis 2/3), et le CSR-DM public de Bobia
(réquisition jamais soumise).

---

## 7. Le taux d'atteinte

Sur l'écran de synthèse et les tableaux de sous-composantes, une colonne
« taux d'atteinte » complète le statut binaire CONFORME/ALERTE : c'est un
chiffre entre 0 et 100 qui dit **à quel point** on est proche ou loin du
seuil, là où le statut ne dit que oui ou non.

- Pour les sous-composantes P4 (conformité SDU, conformité consommation), le taux de
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
  facture reçue, réquisitions de zone absentes pour un district, inventaire de
  fin de mois pas encore attendu, etc.). Sur un mois **clos**, le **silence**
  d'un site attendu actif (aucune sortie de stock, aucun inventaire de fin de
  mois) est rendu par un **0 % / ALERTE**, pas par NON CALCULABLE. Sur un mois
  **en cours**, en revanche, une échéance non encore arrivée (inventaire ou
  réquisition de fin de mois) reste NON CALCULABLE : on ne pénalise pas un
  retard qui n'existe pas encore.
- **« Score calculé sur N piliers sur 6 »** : apparaît quand au moins un
  pilier est NON CALCULABLE ce mois ; les poids des piliers restants ont été
  renormalisés (section 4). Un mois en cours est souvent noté sur 2 piliers
  seulement (P3, P6).
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
  clos (section 1) ; le score continuera d'évoluer aux prochains imports. Sur
  la courbe de progression, le segment qui mène à ce mois est tracé **en
  pointillé** : provisoire, non comparable aux points pleins des mois clos.

---

## 9. Glossaire

| Terme | Définition |
|---|---|
| Mois PAQD | Le mois calendaire sur lequel porte une extraction et pour lequel les scores sont calculés |
| Cycle PAQD | Quatre mois consécutifs (M+1 à M+4), trois cycles par an calés sur l'année civile |
| Score composite | Note sur 100 d'un site, moyenne pondérée des six scores de pilier, tous programmes confondus |
| Grille de paramètres | Le jeu daté des poids de pilier et des seuils de sous-composante, éditable par la coordination, effectif au cycle suivant seulement |
| Produit traceur | Un produit suivi de près pour les piliers P4, P5 et P6 ; la liste est tenue dans le script d'extraction de la DAP et reprise à chaque import |
| Programme de santé | Un programme vertical géré par un site (VIH, paludisme, etc.) ; le nombre de programmes gérés détermine le nombre d'inventaires et de réquisitions attendus chaque mois |
| Type de structure | La valeur `name_category3` d'un site (District sanitaire, Hôpital de référence, ESPC, CHU, Institut). Administré dans l'écran « Types de structure » : il porte la strate d'affichage, le jour limite de réquisition et le régime de scoring |
| Strate | Un des trois attributs d'un type de structure : le regroupement utilisé pour la synthèse « Rapports & inventaires » et le filtre des lectures par territoire (« Non classé » pour un type non renseigné) |
| Territoire | Le découpage géographique de la synthèse : région, puis zone de district, puis site |
| Zone de district | Tous les sites d'un district, magasin du district sanitaire compris |
| Régime de scoring | District ou site de soins. Seule différence : un district mesure P3 sur les réquisitions de sa zone servies et P4 sur les quantités distribuées |
