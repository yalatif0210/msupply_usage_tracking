# Spécification d'extraction mSupply · Tableau de bord DQA

**Destinataire :** DAP / Nouvelle PSP-CI (extraction : Wilfried Akosso)
**Version :** 2.0 (2026-08-28)
**Objet :** contrat de données pour l'alimentation hebdomadaire du tableau de
bord DQA (40 sites, six piliers PAQD).

Ce document remplace le canevas V1 (`Canevas_Extraction_mSupply_DQA.xlsx`). Il
décrit **10 jeux de données**, leur grain, chaque colonne et sa source dans la
base mSupply.

**Livrable = un classeur Excel unique**, `Canevas_Extraction_mSupply_DQA_v2.xlsx`
(gabarit joint) : un onglet par jeu, avec pour chaque colonne sa consigne
(ligne 4), son nom exact (ligne 5, à ne pas modifier) et une ligne d'exemple
(ligne 6, à supprimer). C'est ce fichier, et lui seul, qui est transmis chaque
semaine au tableau de bord.

---

## 1. Cadence et fenêtre

- **Fréquence :** hebdomadaire, le même jour chaque semaine.
- **Fenêtre d'extraction :** les **45 derniers jours** à chaque extraction (et
  non « depuis le dernier envoi »). Ce recouvrement permet de rattraper une
  semaine manquée.
- **Période de calcul :** le **mois PAQD** en cours, déclaré dans METADATA. La
  fenêtre de 45 jours est volontairement plus large que le mois.
- **Cycle PAQD :** 4 mois consécutifs, notés M+1 à M+4. Trois cycles par an sur
  l'année civile (C1 = janvier-avril, C2 = mai-août, C3 = septembre-décembre).

---

## 2. Format de livraison

- **Un seul classeur Excel** (`.xlsx`), à partir du gabarit
  `Canevas_Extraction_mSupply_DQA_v2.xlsx`.
- **Un onglet par jeu**, nommé exactement comme indiqué (`METADATA`, `SITES`,
  `SITE_PROGRAMME`, `PRODUITS`, `TRANSACTIONS`, `LIGNES_TRANSACTIONS`,
  `STOCK_ACTUEL`, `INVENTAIRES`, `INVENTAIRE_LIGNES`, `REQUISITIONS`).
- **Ligne 5 de chaque onglet = noms de colonnes**, à ne ni renommer, ni
  déplacer, ni supprimer. Les données commencent à la ligne 6.
- **Supprimer la ligne d'exemple** (ligne 6 du gabarit) avant l'envoi.
- **Dates :** format `AAAA-MM-JJ` (ex. `2026-08-15`), saisi comme **texte** pour
  éviter toute reconversion Excel. Jamais d'heure.
- **Nombres :** point décimal, sans séparateur de milliers, sans unité.
- **Valeur absente :** cellule vide. Ne pas écrire `NULL`, `N/A`, `-`, `néant`.
- **Identifiants :** reprendre exactement les identifiants mSupply (`*.id`), sans
  reformatage.
- **Booléens :** `OUI` / `NON`.

---

## 3. Contrôle à la réception

- **Compteurs METADATA bloquants :** pour chaque jeu, `nb_lignes_<JEU>` doit
  égaler le nombre de lignes réellement transmises (hors en-tête et hors ligne
  d'exemple). Tout écart entraîne le **rejet du classeur entier** : un import
  partiel produit des indicateurs faux d'apparence valide.
- **Onglet ou colonne manquant :** un onglet obligatoire absent, ou un nom de
  colonne (ligne 5) modifié, entraîne le rejet.
- **Références croisées :** tout `site_id`, `produit_id`, `programme_id`,
  `transaction_id`, `inventaire_id` cité dans un jeu doit exister dans le jeu de
  référence correspondant.
- **Renvoi d'un classeur :** un classeur renvoyé, identique ou corrigé, pour le
  même mois PAQD **remplace** les données de ce mois : pas de doublon, pas de
  double comptage.

---

## 4. Les 10 jeux de données

Légende « Requis » : ● obligatoire · ○ facultatif · ▶ obligatoire sous condition.

### 4.1 METADATA · informations sur l'extraction (clé / valeur)

| Champ | Type | Requis | Contenu |
|---|---|---|---|
| `date_extraction` | date | ● | date d'exécution de l'extraction |
| `cycle_paqd` | texte | ● | `AAAA-CN`, ex. `2026-C2` |
| `mois_paqd` | texte | ● | `M+1`, `M+2`, `M+3` ou `M+4` |
| `mois_debut` | date | ● | premier jour du mois PAQD |
| `mois_fin` | date | ● | dernier jour du mois PAQD |
| `fenetre_debut` | date | ● | premier jour de la fenêtre d'extraction |
| `fenetre_fin` | date | ● | dernier jour de la fenêtre d'extraction |
| `version_msupply` | texte | ● | version du serveur mSupply source |
| `realisee_par` | texte | ● | nom et service |
| `nb_lignes_SITES` … `nb_lignes_REQUISITIONS` | entier | ● | un compteur par jeu ci-dessous (9 compteurs) |
| `observations` | texte | ○ | toute anomalie constatée pendant l'extraction |

### 4.2 SITES · grain : un site

Tous les magasins actifs (pour résoudre les rattachements district), avec
marquage du périmètre DQA.

| Colonne | Type | Requis | Source mSupply |
|---|---|---|---|
| `site_id` | texte | ● | `store.id` |
| `site_code` | texte | ● | `store.code` |
| `site_nom` | texte | ● | `store.name` |
| `district` | texte | ● | `store.name_id → name.category1_id → name_category1.description` |
| `region` | texte | ● | remonter `name_category1 → name_category1_level1 → name_category1_level2.description` |
| `type_structure` | texte | ● | `name.category3_id → name_category3.description` (le palier, voir §5.3) |
| `actif` | OUI/NON | ● | `store.disabled = false` |
| `dans_perimetre_dqa` | OUI/NON | ● | **liste fournie par la mission DQA** (annexe A) |

### 4.3 SITE_PROGRAMME · grain : (site, programme)

Quels programmes de santé chaque site gère. **Pilote le calcul du pilier P1**
(nombre d'inventaires et de réquisitions attendus = nombre de programmes gérés).

| Colonne | Type | Requis | Source mSupply |
|---|---|---|---|
| `site_id` | texte | ● | `list_master_name_join.name_id` (magasin correspondant) |
| `programme_id` | texte | ● | `list_master.id` où `list_master.isprogram = true` |
| `programme_code` | texte | ● | `list_master.code` |
| `programme_nom` | texte | ● | `list_master.description` |
| `actif` | OUI/NON | ● | rattachement actif (`list_master_name_join`, `list_master.inactive = false`) |

### 4.4 PRODUITS · grain : un produit

Tous les produits (le marquage « traceur » est géré côté tableau de bord).

| Colonne | Type | Requis | Source mSupply |
|---|---|---|---|
| `produit_id` | texte | ● | `item.id` |
| `produit_code` | texte | ● | `item.code` |
| `produit_nom` | texte | ● | `item.item_name` |
| `unite` | texte | ○ | `item.unit_id` → libellé de l'unité |
| `programmes` | texte | ○ | codes des programmes (`list_master` `isprogram`) contenant l'item via `list_master_line`, séparés par `;` |

### 4.5 TRANSACTIONS · grain : une transaction

Transactions dont la `finalised_date` **ou** la `confirm_date` tombe dans la
fenêtre d'extraction. Inclure les annulations (marquées), exclure les brouillons.

| Colonne | Type | Requis | Source mSupply |
|---|---|---|---|
| `transaction_id` | texte | ● | `transact.id` |
| `site_id` | texte | ● | `transact.store_id` |
| `nature` | texte | ● | **dérivée** (voir §5.1) |
| `programme_id` | texte | ▶ | `transact.programid` (obligatoire si présent dans mSupply) |
| `type_transaction` | texte | ● | `transact.type` (`ci`, `si`, `sc`, `cc`, `rc`…) |
| `mode` | texte | ● | `transact.mode` (`store`, `dispensary`…) |
| `statut` | texte | ● | `transact.status` (`fn` = finalisée) |
| `annulation` | OUI/NON | ● | `transact.is_cancellation` |
| `date_saisie` | date | ● | `transact.entry_date` |
| `date_confirmation` | date | ○ | `transact.confirm_date` |
| `date_livraison` | date | ▶ | `transact.ship_date` (obligatoire si `nature = reception`) |
| `requisition_id` | texte | ○ | `transact.requisition_id` |
| `goods_received_id` | texte | ○ | `transact.goods_received_id` |
| `commentaire` | texte | ▶ | `transact.comment` (obligatoire si `nature` ∈ {`ajustement_positif`, `ajustement_negatif`}) |

### 4.6 LIGNES_TRANSACTIONS · grain : (transaction, produit, lot)

**Restreint aux produits de la liste traceurs (annexe A).**

| Colonne | Type | Requis | Source mSupply |
|---|---|---|---|
| `ligne_id` | texte | ● | `trans_line.id` |
| `transaction_id` | texte | ● | `trans_line.transaction_id` |
| `produit_id` | texte | ● | `trans_line.item_id` |
| `programme_id` | texte | ○ | `trans_line.program_id` |
| `lot` | texte | ○ | `trans_line.batch` |
| `quantite` | nombre | ● | `trans_line.quantity` (quantité réelle en conditionnement) |
| `taille_conditionnement` | nombre | ● | `trans_line.pack_size` (unités de dispensation par conditionnement) |
| `type_ligne` | texte | ● | `trans_line.type` (`stock_in`, `stock_out`, `service`…) |
| `issu_ajustement` | OUI/NON | ● | `trans_line.is_from_inventory_adjustment` |
| `date_peremption` | date | ○ | `trans_line.expiry_date` |

### 4.7 STOCK_ACTUEL · grain : (site, produit, lot)

Photographie du stock disponible à la date d'extraction. **Restreint aux
traceurs (annexe A).**

| Colonne | Type | Requis | Source mSupply |
|---|---|---|---|
| `site_id` | texte | ● | `item_line.store_id` |
| `produit_id` | texte | ● | `item_line.item_id` |
| `lot` | texte | ○ | `item_line.batch` |
| `quantite_disponible` | nombre | ● | `item_line.available` |
| `date_peremption` | date | ○ | `item_line.expiry_date` |
| `date_photo` | date | ● | date d'extraction |

### 4.8 INVENTAIRES · grain : un inventaire

Inventaires (`stock_take`) dont la `stock_take_date` tombe dans la fenêtre.

| Colonne | Type | Requis | Source mSupply |
|---|---|---|---|
| `inventaire_id` | texte | ● | `stock_take.id` |
| `site_id` | texte | ● | `stock_take.store_id` |
| `programme_id` | texte | ▶ | `stock_take.programid` (obligatoire si présent) |
| `date_inventaire` | date | ● | `stock_take.stock_take_date` |
| `statut` | texte | ● | `stock_take.status` (`fn` = finalisé) |
| `invad_additions_id` | texte | ○ | `stock_take.invad_additions_id` |
| `invad_reductions_id` | texte | ○ | `stock_take.invad_reductions_id` |

### 4.9 INVENTAIRE_LIGNES · grain : (inventaire, produit, lot)

**Restreint aux traceurs (annexe A).** Une ligne par (inventaire, produit, lot),
**sans doublon**.

| Colonne | Type | Requis | Source mSupply |
|---|---|---|---|
| `inventaire_id` | texte | ● | `stock_take_lines.stock_take_id` |
| `produit_id` | texte | ● | `stock_take_lines.item_id` |
| `lot` | texte | ○ | `stock_take_lines.batch` |
| `quantite_theorique` | nombre | ● | `stock_take_lines.snapshot_qty × stock_take_lines.snapshot_packsize` |
| `quantite_comptee` | nombre | ● | `stock_take_lines.stock_take_qty` |

### 4.10 REQUISITIONS · grain : une réquisition

Réquisitions dont la `date_entered` **ou** la période couverte touche la fenêtre.

| Colonne | Type | Requis | Source mSupply |
|---|---|---|---|
| `requisition_id` | texte | ● | `requisition.id` |
| `site_id` | texte | ● | `requisition.store_id` |
| `programme_id` | texte | ▶ | `requisition.programid` (obligatoire si présent) |
| `periode_id` | texte | ○ | `requisition.periodid` |
| `mois_couvert_debut` | date | ● | `period.startdate` de `periodid` ; à défaut, 1ᵉʳ jour du mois de `date_stock_take` |
| `mois_couvert_fin` | date | ● | `period.enddate` ; à défaut, dernier jour du même mois |
| `date_soumission` | date | ● | `requisition.date_entered` |
| `date_inventaire_ref` | date | ○ | `requisition.date_stock_take` |
| `date_reception` | date | ▶ | `requisition.date_order_received` (obligatoire si `statut` indique une réception) |
| `statut` | texte | ● | `requisition.status` |
| `statut_autorisation` | texte | ○ | `requisition.authorisationstatus` |
| `type_requisition` | texte | ● | `Urgente` si `requisition.is_emergency = true`, sinon `Ordinaire` |

---

## 5. Vocabulaires contrôlés

### 5.1 `nature` d'une transaction · règle de dérivation

À évaluer **dans cet ordre**, la première règle qui s'applique gagne :

| Ordre | `nature` | Condition |
|---|---|---|
| 1 | `ajustement_positif` / `ajustement_negatif` | la transaction est référencée par `stock_take.invad_additions_id` (positif) ou `invad_reductions_id` (négatif) ; **ou** toutes ses `trans_line` ont `is_from_inventory_adjustment = true`. Signe = celui de `Σ(stock_take_qty - snapshot_qty)`. |
| 2 | `dispensation` | `type = 'ci'` **et** `mode = 'dispensary'` |
| 3 | `distribution` | `type = 'ci'` **et** `mode = 'store'` |
| 4 | `facture_fournisseur` | `type = 'si'` |
| 5 | `reception` | `type = 'rc'` |
| 6 | `retour_fournisseur` | `type = 'sc'` |
| 7 | `retour_client` | `type = 'cc'` |
| 8 | `autre` | tout le reste |

### 5.2 `statut` · valeurs mSupply attendues

`fn` (finalisé) · `cn` (confirmé) · `sg` (suggéré) · `nw` (nouveau). Le tableau
de bord ne calcule que les `fn`.

### 5.3 `type_structure` : le palier, pas le sous-type

`type_structure` porte la valeur de `name_category3.description` **telle
quelle** : le palier de la pyramide sanitaire. Sur le jeu réel, trois valeurs :
`ESPC`, `Hôpital de référence`, `District sanitaire`. Le sous-type (CSU vs CSR,
CHR vs HG) n'est **pas** demandé : il reste lisible dans `site_nom` et le code.

L'échéance de réquisition et le régime de scoring district ne sont plus dans
l'extraction : ils sont administrés côté tableau de bord, dans le référentiel
`strate_structure` (ADR 0013). Valeurs par défaut de ce référentiel :

| `type_structure` | jour limite de réquisition | régime |
|---|---|---|
| `ESPC` | 5 | site de soins |
| `Hôpital de référence` | 7 | site de soins |
| `District sanitaire` | 10 | district |
| `CHU`, `INSTITUT` | 10 | site de soins |
| (palier inconnu) | 10 | site de soins |

Fournir les libellés exacts tels qu'ils apparaissent dans `name_category3` ; un
libellé nouveau se rattache dans la console, sans nouvelle livraison.

---

## 6. Annexe A · Éléments fournis par la mission DQA

- **Liste des sites du périmètre DQA** (40 `site_id` / `site_code`), pour la
  colonne `dans_perimetre_dqa`.
- **Liste des produits traceurs** (`produit_code`), filtre des jeux
  LIGNES_TRANSACTIONS, STOCK_ACTUEL, INVENTAIRE_LIGNES. Révisée à chaque cycle.

Ces deux listes sont transmises séparément et tenues à jour par la mission.

---

## 7. Annexe B · Points à confirmer par la DAP

1. **Périodes mSupply mensuelles :** existe-t-il un calendrier de périodes
   (`periodschedule` / `period`) où chaque période = un mois civil ? Sinon,
   `mois_couvert_*` sera dérivé de `date_stock_take` (§4.10).
2. **Types `si` / `rc` :** confirmer que `si` correspond bien à la facture
   fournisseur adressée au site et `rc` à la réception enregistrée par le site.
3. **Ajustements hors INVAD :** des pertes, casses ou péremptions sont-elles
   parfois saisies autrement qu'en ajustement d'inventaire (ex. sortie manuelle
   vers un tiers) ? Si oui, en quel volume approximatif.
4. **`transact.programid` / `requisition.programid` / `stock_take.programid` :**
   sont-ils systématiquement renseignés, ou faut-il un rattachement de repli
   (via la réquisition liée, ou la liste maîtresse du produit) ?
