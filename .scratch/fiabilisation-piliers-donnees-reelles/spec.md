# Fiabilisation des piliers sur données réelles

ADR : `docs/adr/0018-reception-des-factures-et-statut-fn.md`,
`docs/adr/0019-p1-completude-des-receptions.md`,
`docs/adr/0020-programmes-eligibles-administres.md`,
`docs/adr/0021-type-de-structure-prefixe-du-nom.md`.

## Contexte

Audit du 2026-10-14 sur le premier fichier réel de la DAP (lot du
2026-10-14, 40 sites, 13 traceurs, 17 103 transactions), en lecture seule.
Les recalculs indépendants donnent les mêmes résultats que l'application
(P4 consommation 286/286, P5 75/75, P6 103/103, composite 120/120, gel
1 940/1 940) : le code applique fidèlement ses règles. Ce sont certaines
règles qui ne tiennent pas face aux données réelles. Résultat : 40 sites sur
40 NON_CONFORME en août et septembre.

Constats qui motivent ce chantier :

- `rc` n'est pas une réception de marchandises mais un **reçu de paiement**
  (1 712 `rc`, tous commentés « Reçu pour facture(s) … », sans programme ni
  produit, aucun chez les districts). Les entrées de stock passent par les
  factures fournisseur `si`.
- P4 consommation ne compte que les lignes `rc` : les entrées réelles (`si`)
  sont ignorées. Cas CSU TORTIYA, TLD, septembre : reconstituée -1 260,
  écart +5 400, égal aux factures ignorées. Conformes 30, 59 en comptant les
  `si`.
- P1 complétude des réceptions = nombre de `rc` / nombre de `si` : de 0 % à
  3 250 % en septembre.
- P1 et P2 attendent un inventaire et une réquisition par programme
  « géré » : 207 couples site x programme sur 548 n'ont aucune activité en
  45 jours. Avec un seuil de 100 %, P1 et P2 sont proches de 0 partout.
- Août est noté sur 3 jours de données (fenêtre à partir du 29/08).
- P1 et P2 notent le mois en cours (octobre) : 34 sites notés, P2 à 0.
- La grille n'est appliquée qu'en partie : P1 et P2 n'utilisent qu'un seuil
  pour toutes leurs sous-composantes, le sens de comparaison est codé en dur.
- L'extraction ne ramène pas les factures `nw` (filtre de statut et de date) :
  le dénominateur des réceptions ne contient que des factures déjà prises en
  main, le taux tend mécaniquement vers 100 %.
- 26 sites (1 dans le périmètre : CHR PUBLIC de BONDOUKOU) ont un type de
  structure qui contredit le préfixe de leur nom.
- Parcours de l'interface (copie isolée, 12 écrans) : 16 incohérences
  d'affichage (U1 à U16, voir plus bas).
- La démo écoute sur `0.0.0.0:8081` au lieu de `127.0.0.1`.

## Décisions

### Réception, statut, quantités (ADR 0018)

- Une facture fournisseur `si` est **réceptionnée** quand elle est au statut
  `fn`. Sa date de réception est sa date de finalisation.
- `rc` devient la nature `encaissement` : exclu de tous les piliers.
- Seules les transactions au statut **`fn`** entrent dans les calculs (P1,
  P3, P4, P6). Les autres restent en base pour la traçabilité.
- P4 consommation : les entrées de stock sont les lignes des `si`
  réceptionnées (hors ajustements d'inventaire), datées de leur
  finalisation.

### P1 refondu (ADR 0019)

- **La complétude d'inventaire est retirée de P1.** P1 = complétude des
  réquisitions + complétude des réceptions. L'inventaire reste mesuré par P2
  (3 derniers jours du mois) et par P4 / P5.
- **Complétude des réceptions** d'un site pour le mois évalué M :
  - réquisitions retenues : réquisitions **ordinaires** au statut `fn` dont
    le mois couvert est M-1 ;
  - factures retenues : factures `si` du site qui citent l'une de ces
    réquisitions, au statut `fn`, `cn` ou `nw` ;
  - taux = factures `fn` / factures `fn` + `cn` + `nw`.
- **Mois d'émission d'une facture** (la facture doit être acceptée dans ce
  mois) : pour un ESPC, date de finalisation de la livraison du district ;
  pour un site livré par la NPSP, date de création de la facture `si` chez
  le site.
- **Calcul continu** pendant le mois (logique proactive : un taux bas en
  cours de mois appelle une action), affiché comme provisoire ; figé à la
  clôture.
- **Statistiques de suivi, hors score** : part des réquisitions ordinaires
  ayant au moins une facture ; factures en attente (`cn`, `nw`) depuis plus
  de **7 jours**, signalées en alerte.

### Échéances non arrivées

- Une sous-composante dont l'échéance n'est pas arrivée est **non
  calculable**, pas 0 : complétude et promptitude des réquisitions (échéance
  : jour limite de M+1), promptitude des inventaires (échéance : fin du mois).
  Même règle que P4 / P5 (ADR 0014).
- Exception voulue : la complétude des réceptions est suivie en continu
  (ci-dessus).

### Programmes éligibles (ADR 0020)

- Les programmes évalués pour un site sont ceux de SITE_PROGRAMME. Leur
  statut actif est **modifiable dans l'application**, comme les types de
  structure. Une modification faite dans l'application n'est **jamais
  écrasée** par un import ultérieur, même si le fichier dit le contraire.

### Type de structure (ADR 0021)

- En cas de conflit entre la catégorie mSupply et le préfixe du nom du site
  (CHR, CHU, HG, DISTRICT SANITAIRE, CSU, CSR…), **le préfixe l'emporte**, et
  le conflit est signalé pour correction dans mSupply.

### Extraction (canevas v2.4)

- Fenêtre : à partir du **1er jour du 2e mois** avant la date d'extraction
  (extraction du 12/10 : début au 01/08).
- TRANSACTIONS : toutes les factures `si` (`fn`, `cn`, `nw`), avec leur
  **date de finalisation** et la **transaction liée** (livraison du
  district qui a produit la facture).
- REQUISITIONS : aussi les réquisitions citées par une facture `si` extraite,
  même hors de la fenêtre M-2 à M.
- SITES : type de structure arbitré par le préfixe du nom ; colonne du type
  mSupply d'origine pour signaler les conflits.

### Grille

- Chaque seuil et chaque sens de comparaison de la grille sont appliqués à
  leur propre sous-composante.

### Interface

U1 à U16 du parcours du 2026-10-14 :

| # | Correction attendue |
|---|---|
| U1 | Accueil et liste des sites : ouverture sur le dernier mois clos ; mois en cours signalé « provisoire » ; sélecteur de mois sur la liste |
| U2 | Liste : signaler un classement fondé sur peu de piliers calculables |
| U3 | Synthèse : nombre de sites derrière chaque moyenne de pilier |
| U4 | Synthèse par programme : seulement les programmes éligibles |
| U5 | Complétude des réceptions : nouvelle règle (plus de 316 %) |
| U6 | Tableau P4 et fiche produit : réceptions = factures réceptionnées |
| U7 | Tableau P4 : code produit affiché |
| U8 | Nombres au format français |
| U9 | Dates de gel formatées |
| U10 | Une seule explication, juste, par cause de non-calcul |
| U11 | « n/d / 100 » remplacé |
| U12 | Tableau P4 d'un district : vocabulaire « distribution » |
| U13 | Courbe : écart calculé contre le dernier mois clos |
| U14 | Journal des imports : les 9 compteurs |
| U15 | Fiche produit : photo de stock expliquée (date du jour d'extraction) |
| U16 | Tableau P4 : colonnes essentielles visibles sans défilement |

Plus : le message « Aucun produit traceur inventorié » est remplacé par un
message par cause (inventaire de fin de mois daté du mois suivant ;
inventaire sans traceur ; aucun inventaire ; programme sans traceur).

### Infrastructure

- Démo publiée sur `127.0.0.1:8081` uniquement.

## Hors périmètre

- Évaluation des produits non traceurs (abandonnée : le score et les piliers
  produits restent limités aux traceurs).
- Ruptures de stock et prévisions (autre module) ; la règle 0/0 est
  conservée.
- Changement de la fenêtre « 3 derniers jours » de la promptitude
  d'inventaire.

## Validation

- Un test par règle nouvelle ou modifiée, un cas passant et un cas échouant
  (CLAUDE.md §3).
- Les recalculs indépendants de l'audit deviennent des tests de non-régression.
- Banc d'essai de l'extraction mis à jour (factures `nw`, `rc`, fenêtre,
  conflit de type), note 100/100.
- Nouvel audit sur données réelles, puis parcours de l'interface sur copie
  isolée.
