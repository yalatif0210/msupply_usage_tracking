# Guide du module Suivi des stocks

## Rôle

Conjecturer, pour chaque site du périmètre et chaque produit traceur, le
stock disponible à une date choisie, et en déduire la couverture et la
rupture prévue. Le calcul s'appuie sur une **CMM reconstituée** (sorties
physiques entre deux inventaires, pertes comprises), mise à côté d'une **CMM
déclarée** (sorties saisies dans mSupply) pour comparaison. Aucun effet sur le
score ni sur les piliers. Spec : `.scratch/suivi-des-stocks/spec.md`.

## Points d'entrée

| Méthode | Chemin | Retour | Rôle |
|---|---|---|---|
| `GET` | `/api/stocks?date=&region=&district=&siteId=&programmeId=&statut=` | `SuiviStocks` | tout authentifié |
| `GET` | `/api/stocks/:siteId/:code?date=` | `DetailStock` (404 sans stock compté connu à t) | tout authentifié |

`date` (`AAAA-MM-JJ`) absente : fin de fenêtre du dernier import validé
(`dqa.date_reference_stocks()`). Filtre `statut` possible. La réponse porte
`date` (servie), `dateParDefaut`, `seuilCouvertureJours` et `lignes` (avec
`statut` et `photo`), triées par site (région, district, nom), puis
programme, puis produit.

Écran : menu « Suivi des stocks », route `/stocks` (`pages/suivi-stocks.ts`).
Filtres date, région, district, programme, statut, lecture (`lecture=programme`)
et colonnes de contrôle (`controle=1`) dans l'URL ; tableau site, puis
programme, puis produit (ou programme, puis site, puis produit), dépliable au
premier niveau. Six colonnes de décision par défaut (CMM reconstituée, stock
projeté, couverture, rupture prévue, statut) ; les colonnes de contrôle
ajoutent dernier inventaire, réceptions depuis, CMM déclarée, photo mSupply et
écart. Le nom d'un produit ouvre
`/stocks/:siteId/:code` (`pages/detail-stock.ts`) : cartes de synthèse,
courbe `ui/graphe-stock` (projection pleine jusqu'à t puis pointillée, stocks
comptés et photos en points, réceptions, date choisie et rupture en repères),
tableau du calcul de la CMM.

## Données manipulées

Fonctions SQL de la migration 0053, lues par `StocksRepository` :

| Fonction | Rend |
|---|---|
| `dqa.series_stock(t)` | la série journalière de tous les couples site × traceur, de la borne de fin à t + 90 jours |
| `dqa.stocks_a_date(t)` | une ligne par couple : bornes, CMM, stock projeté à t, rupture, couverture, programme parent |
| `dqa.serie_stock(site, code, t)` | la série d'un couple (détail, ticket 03) |
| `dqa.date_reference_stocks()` | la date t par défaut |

Vues de lecture (migration 0055, par code produit depuis 0062), partagées par
ces fonctions et par le détail d'un couple, pour que la courbe montre
exactement les faits utilisés par la projection. **Un code = un produit** : les
articles mSupply d'un même code (ADR 0016) s'additionnent, en unités de
dispensation (ADR 0017) ; le produit d'une ligne est son `produitCode`.

| Vue | Rend |
|---|---|
| `dqa.v_stock_compte_jour` | stock compté par site, code produit et jour (dernier inventaire finalisé du jour, tous les articles et lots du code sommés) |
| `dqa.v_mouvement_stock_jour` | réceptions, dispensations, distributions par site, code produit et jour |
| `dqa.v_photo_stock_jour` | photo de stock mSupply par site, code produit et jour (articles et lots sommés) |

Sources : `fact_inventaire` / `fact_inventaire_ligne` (stocks comptés),
`fact_transaction` / `fact_ligne_transaction` (réceptions, dispensations,
distributions), `dim_site` (périmètre, régime district), traceurs actifs.

## Règles de calcul

Tout se calcule « comme si l'on était à t » : un inventaire ou une réception
datés après t sont ignorés.

- **Stock compté d'un jour** : le dernier inventaire finalisé du jour (heure,
  puis numéro), tous programmes confondus, lots sommés (même règle que
  `mv_p4_ecart_produit`).
- **Borne de fin** : le dernier inventaire au plus tard à t.
- **Borne de début** : l'inventaire le plus proche de fin - 90 jours, cherché
  entre fin - 105 jours et la veille de fin ; à égalité, le plus ancien. Avec
  un inventaire par mois, c'est le 4e en remontant (29/09 donne 30/06).
- **CMM reconstituée** = (compté début + réceptions - compté fin) ÷ jours
  × 30,4. Réceptions : factures fournisseur finalisées, datées de leur
  réception, hors lignes d'ajustement, entre les bornes (début exclu, fin
  incluse).
- **CMM déclarée** = dispensations (distributions pour un district) sur les
  mêmes bornes ÷ jours × 30,4.
- **Non calculable** : `un_seul_inventaire` (aucune borne de début) ou
  `sorties_non_positives` (compté début + réceptions - compté fin ≤ 0).
- **Stock projeté** jour par jour depuis la borne de fin : compté + réceptions
  connues (jusqu'à t) - CMM ÷ 30,4 par jour, jamais sous 0. Une réception
  après une rupture repart de 0 : la marche est plafonnée par
  `brut - min(0, plus bas brut atteint)`.
- **Rupture prévue** : premier jour à 0 à partir de t (t compris), au plus
  t + 90 jours. **Couverture** : stock projeté à t ÷ CMM journalière.
- **Programme parent** : celui du dernier inventaire du produit au site, à
  défaut celui de son dernier mouvement. Il sert à grouper, jamais au calcul.
- **Statut** (migration 0054), d'après la couverture exacte (non arrondie) :
  `en_rupture` (stock projeté à 0 à t), `rupture_signalee` (couverture
  inférieure ou égale au seuil, 15 jours), `a_surveiller` (au-delà du seuil,
  mais rupture prévue avant t + 90 jours), `sans_risque` (aucune rupture dans
  l'horizon), `non_calculable`. Seuil dans `parametre_suivi`
  (`seuil_couverture_rupture_jours`), renvoyé par l'API
  (`seuilCouvertureJours`) pour que l'écran ne le code pas en dur.
- **Photo mSupply** (migration 0054) : la dernière photo de stock
  (`fact_stock_snapshot`, lots sommés) datée au plus tard de t et au plus tôt
  de la borne de fin, avec le stock projeté ce jour-là. L'écart (projeté -
  mSupply) est affiché sans seuil : négatif, mSupply compte plus de stock que
  la projection, signe probable de pertes non saisies depuis le dernier
  inventaire.

L'écran ajoute un **encadré** en tête : les 10 couples les plus urgents (en
rupture puis à signaler, par couverture croissante), le reste sur demande, et à
part (dépliable) les couples à surveiller. Il suit
les filtres de territoire et de programme. Le filtre **Statut** se fait côté
écran, sur la donnée déjà chargée.

## Décisions de conception

- **Fonctions, pas vues matérialisées** : t est libre, une vue figée à une
  date ne suffit pas. Le calcul complet (environ 400 couples × 120 jours)
  prend environ 0,3 s sur la démo.
- **Jours réels** plutôt que mois entiers : les sites inventorient à des
  dates variables (le 1er ou le 30) ; diviser par un nombre de mois entier
  fausserait la CMM d'un mois.
- **Approximation assumée** : retours et transferts non déduits, ruptures non
  corrigées, aucune réception future supposée. La CMM est une orientation.
- **Projection depuis le dernier stock compté**, pas depuis la photo mSupply :
  la photo est un stock théorique, qui ignore les pertes non saisies.

## Pièges connus

- La CMM reconstituée inclut les pertes : elle peut dépasser de beaucoup la
  CMM déclarée (ARV de SOKOURA en septembre : 364,8 contre 91,2). C'est le
  signal attendu, pas une erreur.
- Un produit compté à 0 au dernier inventaire est « en rupture » à t ; l'écran
  le distingue d'une rupture à venir.
- Un produit absent du dernier inventaire du site garde sa borne de fin plus
  ancienne : sa projection part de plus loin.
- Seuls les 13 produits traceurs sont extraits : aucune CMM pour les autres.
