# Un inventaire retenu par jour, un code produit compté une fois

**Statut.** Accepté.

**Contexte.** Le premier fichier réel de la DAP (lot du 2026-10-12) a fait
échouer le rafraîchissement des scores. Deux réalités de mSupply n'étaient
pas prévues :

1. **Plusieurs inventaires finalisés le même jour** sur le même produit, au
   même site : 27 cas sur les 13 traceurs, presque tous des recomptages du
   même lot sous le même programme, parfois avec des quantités corrigées
   (2075 compté puis 18100). P4 additionnait ces inventaires (stock doublé)
   et ses bornes de consommation trouvaient deux stocks pour une même date.
2. **Un même code produit porté par deux articles** (même médicament
   enregistré deux fois, parfois avec une unité différente). C'est normal
   dans mSupply.

La lecture des vues a révélé trois défauts voisins : un inventaire ou un
mouvement **sans programme** entrait deux fois dans la ligne « tous
programmes » ; P5 ne retenait **qu'une ligne de lot** par produit ; P5 ne
suivait pas la répartition par programme de P4.

**Décision.**

- **Le dernier inventaire finalisé fait foi** pour un (site, jour, produit).
  Ordre : heure (`stock_take.stock_take_time`), puis numéro attribué par
  mSupply (`stock_take.serial_number`), puis identifiant. Le canevas v2.3
  ajoute `heure_inventaire` et `numero_inventaire` à l'onglet INVENTAIRES ;
  les deux colonnes sont obligatoires en en-tête, leurs valeurs facultatives.
  Contrôle DAP du 2026-10-13 : le numéro suit la création, l'heure la
  finalisation (ordres opposés dans 14 % des journées à plusieurs
  inventaires) et le numéro n'est pas unique par site. L'heure, toujours
  renseignée, désigne bien la correction finalisée en dernier.
- **Par programme**, le dernier inventaire de ce programme ; **tous
  programmes**, le dernier tous programmes confondus. Le stock appartient au
  site, pas au programme : un produit de deux programmes est le même stock
  physique, on ne somme jamais deux programmes.
- **Sans programme**, un inventaire ou un mouvement ne compte que dans « tous
  programmes ».
- **P5 se calcule sur la même vue par produit que P4** : même inventaire
  retenu, lots sommés, même répartition par programme.
- **Codes à plusieurs articles : contrôle par article, verdict par code.**
  Chaque article est mesuré séparément ; les taux P4 et P5 comptent un code
  une fois, conforme seulement si tous ses articles le sont (pour P5, le taux
  du code est celui de l'article le moins concordant). À l'écran, une ligne
  par code, détaillée par article quand il y en a plusieurs.

**Pourquoi.**

- Un recomptage le même jour corrige le précédent : additionner doublerait
  le stock, choisir au hasard serait faux une fois sur deux.
- Additionner les articles d'un code masquerait une confusion entre articles
  (dispensé sur l'un, reçu sur l'autre), précisément une erreur de qualité de
  donnée, et risquerait d'additionner des unités différentes. Les compter
  séparément donnerait deux fois le poids d'un même médicament dans le taux.

**Conséquences.**

- Un fichier sans les colonnes `heure_inventaire` / `numero_inventaire` est
  rejeté (colonne manquante) : c'est aussi le cas de tout fichier produit par
  un script antérieur au 2026-10-13, qui aurait par ailleurs fait de tous les
  produits mSupply des traceurs (ADR 0015).
- `serial_number` n'est ni unique ni ordonné comme la finalisation : il ne
  départage que deux inventaires de même heure, `inventaire_id` en dernier
  recours.
- Les lignes « par programme » de P5 changent : elles suivent désormais le
  dernier inventaire du programme, comme P4, au lieu du dernier inventaire du
  site rattaché à son programme.
