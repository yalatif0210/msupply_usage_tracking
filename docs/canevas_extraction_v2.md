# Proposition — Extraction mSupply V2

**Statut :** proposition consolidée sur le schéma mSupply complet (dumps
`cas 2` / `cas 4` / `cas 5` du 2026-08-28). Objet : définir un contrat
d'extraction qui **lève à la source toutes les contraintes de données**
recensées dans [exploration_etat_des_lieux.md](exploration_etat_des_lieux.md),
en s'appuyant sur les tables réelles de mSupply plutôt que sur des devinettes.
Reste à valider en séance DAP : §6.

**Interlocuteur DAP :** Wilfried Akosso (auteur des requêtes d'extraction).

---

## 1. Ce que le schéma mSupply tranche

Plusieurs décisions ouvertes se referment dès qu'on regarde les vraies tables.

| Sujet | Résolution par le schéma |
|---|---|
| **Ajustements d'inventaire (P6)** | `stock_take.invad_additions_id` et `stock_take.invad_reductions_id` pointent vers les transactions d'ajustement générées par un inventaire. **C'est le `/INVAD` de `CLAUDE.md` §6.** On ne devine plus aucun code de type. |
| **Programme de santé** | `list_master` où `isprogram = true`. Rattachement site ↔ programme : `list_master_name_join` (`list_master_id`, `name_id`). Source unique du « nombre de programmes gérés » qui pilote P1. |
| **Inventaire** | Table `stock_take` (+ `stock_take_lines`). Porte `programid`, `status`, `finalised_by_id`, `stock_take_date`. L'inventaire **est** par programme. |
| **Réquisition** | Table `requisition` (+ `requisition_line`). Porte `programid`, `periodid`, `date_entered` (soumission), `date_stock_take` (inventaire de référence), `date_order_received` (réception), `is_emergency`. La réquisition **est** par programme et rattachée à une période mSupply. |
| **Période** | Tables `period` / `periodschedule` : mSupply a déjà un modèle de périodes mensuelles. Le mois PAQD peut s'y aligner. |
| **Concordance (P5)** | `stock_take_lines.snapshot_qty` (théorique au moment du comptage) vs `stock_take_lines.stock_take_qty` (compté). Pas besoin de recalculer un stock théorique. |
| **Site / district / région** | `store` + `name` + `name_category1..6`. `name_category1` a `parent_id` + niveaux → hiérarchie région ⊃ district (à confirmer, D6). |
| **Transactions** | `transact` porte `store_id`, `name_id`, `type`, `status`, `mode`, `programid`, `entry_date` / `confirm_date` / `ship_date` / `finalised_date`, `requisition_id`, `goods_received_id`, `is_cancellation`. FK réelles : `trans_line.transaction_id → transact.id`, `transact.requisition_id → requisition.id`, `transact.goods_received_id → goods_received.id`. |
| **Ajustements, 2ᵉ source** | `trans_line.is_from_inventory_adjustment` (booléen ligne à ligne) double les liens `stock_take.invad_*`. `trans_line.program_id` permet P6 par programme. |

---

## 2. Forme retenue (ADR 0002)

METADATA montre que le fichier V1 est **généré par SQL** (14 462 lignes,
compteurs exacts) : l'humain ne « remplit » rien, il exécute des requêtes et
transmet le résultat.

**Décision :** le format transmis chaque semaine reste **un classeur Excel
unique** (un onglet par jeu), conformément à `CLAUDE.md` §1 — dépôt manuel d'un
fichier, aucune connexion à mSupply, exploitable hors ligne. Pour produire les
onglets sans saisie, l'équipe livre à la DAP un **jeu de vues SQL versionné**
(un `.sql`, une vue par jeu, colonnes et types gelés) ; la DAP exécute et colle
le résultat de chaque vue dans l'onglet correspondant. Le contrat de données
ci-dessous vaut pour la vue comme pour l'onglet.

---

## 3. Contrat de données — un onglet par jeu

`METADATA` · `SITES` · `SITE_PROGRAMME` · `PRODUITS` · `TRANSACTIONS` ·
`LIGNES_TRANSACTIONS` · `STOCK_ACTUEL` · `INVENTAIRES` · `INVENTAIRE_LIGNES` ·
`REQUISITIONS`

(nouveaux vs V1 : `SITE_PROGRAMME`, `INVENTAIRE_LIGNES` ; `METADATA` enrichi ;
dimension `programme` ajoutée partout où c'est utile)

---

## 4. Spécification par jeu

### 4.1 METADATA

| Champ | Source / règle |
|---|---|
| `date_extraction` | date d'exécution |
| `cycle_paqd` | `AAAA-CN` (C1 janv–avr, C2 mai–août, C3 sept–déc) |
| `mois_paqd` | `M+1`…`M+4` |
| `mois_debut` / `mois_fin` | bornes du mois PAQD (idéalement un `period` mSupply) |
| `fenetre_debut` / `fenetre_fin` | bornes de la fenêtre d'extraction (≥ 45 j) |
| `version_msupply` | `V09.01.03` |
| `nb_lignes_<jeu>` | un compteur par jeu, au grain déclaré |

### 4.2 SITES — grain : un site (store)

| Colonne | Source mSupply | Note |
|---|---|---|
| `site_id` | `store.id` | PK |
| `site_code` | `store.code` | |
| `site_nom` | `store.name` | |
| `district` | `store.name_id → name.category1_id → name_category1.description` | |
| `region` | `name_category1 → name_category1_level1 → name_category1_level2.description` | grand-parent de `name_category1` |
| `type_structure` | `name.category3_id → name_category3.description` | vocabulaire contrôlé (D3) |
| `actif` | `store.disabled = false` | |
| `dans_perimetre_dqa` | **hors mSupply** — liste DAP | OUI / NON |
| `jour_limite_requisition` | dérivé de `type_structure` | CS {CSU, CSR, ESPC} → 5 ; {HG, CHR} → 7 ; {CHU, District} → 10 |

### 4.3 SITE_PROGRAMME — grain : (site, programme)

| Colonne | Source mSupply |
|---|---|
| `site_id` | `list_master_name_join.name_id` → `store` |
| `programme_id` | `list_master.id` où `isprogram = true` |
| `programme_code` | `list_master.code` |
| `programme_nom` | `list_master.description` |
| `actif` | `list_master_name_join` actif |

### 4.4 PRODUITS — grain : un produit

| Colonne | Source mSupply | Note |
|---|---|---|
| `produit_id` | `item.id` | |
| `produit_code` | `item.code` | |
| `produit_nom` | `item.item_name` | |
| `unite` | `item.unit_id` → libellé | |
| `est_traceur` | **non fourni par l'extraction** — la liste des traceurs est administrée dans la console web (D7). L'extraction envoie tous les produits ; l'app marque les traceurs. | — |
| `programmes` | programmes (`list_master` `isprogram`) contenant l'item via `list_master_line` | liste `;` |

### 4.5 TRANSACTIONS — grain : une transaction

`transact` porte tout ce qu'il faut : `store_id`, `name_id`, `type`, `status`,
`mode`, `programid`, `entry_date`, `confirm_date`, `ship_date`,
`finalised_date`, `requisition_id`, `goods_received_id`, `comment`,
`is_cancellation`.

| Colonne | Source mSupply | Note |
|---|---|---|
| `transaction_id` | `transact.id` | |
| `site_id` | `transact.store_id` | |
| `nature` | **dérivée en SQL** (règles ci-dessous) | vocabulaire contrôlé |
| `programme_id` | `transact.programid` | |
| `type_transaction`, `mode` | `transact.type`, `transact.mode` | audit / dérivation |
| `statut` | `transact.status` | `fn` = finalisée |
| `annulation` | `transact.is_cancellation` | exclue du calcul |
| `date_saisie` | `transact.entry_date` | |
| `date_confirmation` | `transact.confirm_date` | |
| `date_livraison` | `transact.ship_date` | réceptions |
| `requisition_id` | `transact.requisition_id` | |
| `goods_received_id` | `transact.goods_received_id` | |
| `commentaire` | `transact.comment` | obligatoire si ajustement |

**Dérivation de `nature`** (ordre d'évaluation) :

1. `ajustement_positif` / `ajustement_negatif` — la transaction est référencée par
   `stock_take.invad_additions_id` / `invad_reductions_id`, **ou** toutes ses
   lignes ont `trans_line.is_from_inventory_adjustment = true`. Le signe vient de
   `stock_take_qty − snapshot_qty` agrégé.
2. `dispensation` — `type = 'ci'` et `mode = 'dispensary'`.
3. `distribution` — `type = 'ci'` et `mode = 'store'` (district vers site rattaché).
4. `facture_fournisseur` — `type = 'si'` (facture adressée au site → réception attendue, dénominateur P1c).
5. `reception` — `type = 'rc'` (réception enregistrée par le site → numérateur P1c, P2).
6. `retour_fournisseur` (`type = 'sc'`) / `retour_client` (`type = 'cc'`).
7. `autre` sinon.

### 4.6 LIGNES_TRANSACTIONS — grain : (transaction, produit, lot)

`trans_line`. Restreint aux traceurs.

| Colonne | Source mSupply | Note |
|---|---|---|
| `ligne_id` | `trans_line.id` | |
| `transaction_id` | `trans_line.transaction_id` | |
| `produit_id` | `trans_line.item_id` | |
| `programme_id` | `trans_line.program_id` | ligne peut différer de l'en-tête |
| `lot` | `trans_line.batch` | |
| `quantite` | `trans_line.quantity` | quantité réelle en conditionnement |
| `taille_conditionnement` | `trans_line.pack_size` | unités par conditionnement |
| `type_ligne` | `trans_line.type` | `stock_in` / `stock_out` / `service` / … |
| `issu_ajustement` | `trans_line.is_from_inventory_adjustment` | |
| `date_peremption` | `trans_line.expiry_date` | |

### 4.7 STOCK_ACTUEL — grain : (site, produit, lot)

`item_line` filtré sur les traceurs et les stores du périmètre.
`quantite_disponible` = `item_line.available` ; `date_photo` = date d'extraction.

### 4.8 INVENTAIRES — grain : un inventaire (stock_take)

| Colonne | Source mSupply |
|---|---|
| `inventaire_id` | `stock_take.id` |
| `site_id` | `stock_take.store_id` |
| `programme_id` | `stock_take.programid` |
| `date_inventaire` | `stock_take.stock_take_date` |
| `statut` | `stock_take.status` (`fn` = finalisé) |
| `invad_additions_id` / `invad_reductions_id` | liens vers les transactions d'ajustement |

### 4.9 INVENTAIRE_LIGNES — grain : (inventaire, produit, lot)

| Colonne | Source mSupply |
|---|---|
| `inventaire_id` | `stock_take_lines.stock_take_id` |
| `produit_id` | `stock_take_lines.item_id` |
| `lot` | `stock_take_lines.batch` |
| `quantite_theorique` | `stock_take_lines.snapshot_qty × snapshot_packsize` |
| `quantite_comptee` | `stock_take_lines.stock_take_qty` |

Résout C17 : le grain est explicite, plus de doublons.

### 4.10 REQUISITIONS — grain : une réquisition

| Colonne | Source mSupply |
|---|---|
| `requisition_id` | `requisition.id` |
| `site_id` | `requisition.store_id` |
| `programme_id` | `requisition.programid` |
| `periode_id` | `requisition.periodid` → `period` |
| `mois_couvert` | `period.startdate`/`enddate` si dispo, sinon mois de `date_stock_take` | mois **M** que la réquisition couvre, pas celui où elle est soumise |
| `date_soumission` | `requisition.date_entered` |
| `date_inventaire_ref` | `requisition.date_stock_take` |
| `date_reception` | `requisition.date_order_received` |
| `statut` | `requisition.status` + `authorisationstatus` |
| `type_requisition` | `requisition.is_emergency` → Ordinaire / Urgente |

Une réquisition compte pour son **mois couvert M** (P1b). Elle est à l'heure
(P2b) si `date_soumission` ≤ `jour_limite_requisition` du mois **M+1**.

---

## 5. Formules (site × mois PAQD), désormais toutes traçables

| Sous-composante | Numérateur | Dénominateur |
|---|---|---|
| **P1a** complétude inventaires | programmes gérés ayant ≥ 1 `stock_take` `fn` dans le mois | programmes gérés (`SITE_PROGRAMME`) |
| **P1b** complétude réquisitions | programmes gérés ayant ≥ 1 `requisition` soumise pour la période | programmes gérés |
| **P1c** complétude réceptions | transactions `nature = reception` (`rc`) `fn` dans le mois | transactions `nature = facture_fournisseur` (`si`) de la période |
| **P2a** promptitude inventaires | programmes gérés ayant un `stock_take` `fn` daté dans les **3 derniers jours** du mois | programmes gérés |
| **P2b** promptitude réquisitions | réquisitions soumises ≤ `jour_limite_requisition` du mois suivant | réquisitions attendues (= programmes gérés) |
| **P3** régularité | jours ouvrables du mois avec ≥ 1 sortie de stock (`nature ∈ {dispensation, distribution}`) | jours ouvrables du mois |
| **P4** écart SDU | \|conso `nature = dispensation` − conso reconstituée (2 inventaires)\| / conso reconstituée | — |
| **P5** concordance | Σ `stock_take_qty` du dernier inventaire | Σ `snapshot_qty` du dernier inventaire |
| **P6** ratio d'ajustements | lignes `trans_line.is_from_inventory_adjustment` (ou transactions INVAD) | mouvements de stock totaux (`type_ligne ∈ {stock_in, stock_out}`) |

Toutes déclinables par programme pour la vue dédiée (P3, P4, P5, P6 via
`programme_id` ; P1, P2 sont déjà par programme).

---

## 6. Décisions — état

| # | Décision | Statut |
|---|---|---|
| **D1** | Mois d'une réquisition = mois **couvert** (`periodid`→`period`, sinon mois de `date_stock_take`), pas le mois de soumission. Périodes mSupply = mois civils. | **tranché** |
| **D2** | Vocabulaire `programme` = enum ouvert, normalisé au 1ᵉʳ import depuis `list_master` où `isprogram`. | **tranché** |
| **D3** | `type_structure` = `name_category3.description`. Délais : CS {CSU, CSR, ESPC} → 5 ; {HG, CHR} → 7 ; {CHU, District} → 10. District dans le périmètre : P3 = distributions, P4 calculé. | **tranché** |
| **D4** | P1c sur transactions réelles (option b). **`si` = facture fournisseur adressée** (dénominateur) ; **`rc` = réception enregistrée** (numérateur). | **tranché** |
| **D5** | Statut sous-composante binaire CONFORME / ALERTE. | **tranché** |
| **D6** | `district` = `name_category1.description` ; `region` = `name_category1_level2.description` (grand-parent). | **tranché** |
| **D7** | L'extraction n'envoie pas `est_traceur`. La **liste des traceurs est administrée dans la console web** par la coordination. | **tranché** |
| **D8** | P6 = ajustements INVAD uniquement (`trans_line.is_from_inventory_adjustment` + liens `stock_take.invad_*`). Pertes saisies autrement : hors scope V1, limite documentée. | **tranché** |

**Rien de bloquant pour la DAP.** Confirmations de faisabilité en séance :
les périodes mSupply sont-elles bien des mois civils (sinon repli sur
`date_stock_take`) ; existe-t-il un flux de pertes/péremptions significatif
hors mécanisme INVAD (D8).
