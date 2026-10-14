# Vues SQL d'extraction mSupply → Tableau de bord DQA

Ces vues s'installent **sur la base mSupply de la DAP** (ou son miroir
PostgreSQL). Elles produisent, une par une, le contenu des onglets du classeur
`Canevas_Extraction_mSupply_DQA_v2.xlsx`. Elles ne touchent qu'en lecture aux
tables mSupply ; elles créent trois petites tables de configuration `dqa_*` que
la DAP et la mission alimentent.

**Ne jamais installer ces vues sur la base du tableau de bord.** Elles vivent
ici uniquement pour être versionnées avec le contrat
(`docs/specification_extraction_dap.md`) et le gabarit.

## Installation

```
psql -d <base_msupply> -f 01_config.sql
psql -d <base_msupply> -f 10_vues_extraction.sql
```

`10_vues_extraction.sql` est ré-exécutable (toutes les vues sont
`CREATE OR REPLACE`).

## Procédure hebdomadaire

1. **Mettre à jour les paramètres de la semaine** — une seule ligne :

   ```sql
   INSERT INTO dqa_parametre_extraction
     (singleton, date_extraction, cycle_paqd, mois_paqd,
      mois_debut, mois_fin, fenetre_debut, fenetre_fin,
      realisee_par, version_msupply)
   VALUES
     (true, DATE '2026-08-18', '2026-C2', 'M+2',
      DATE '2026-08-01', DATE '2026-08-31', DATE '2026-07-04', DATE '2026-08-18',
      'Prénom NOM, DAP', 'V09.01.03')
   ON CONFLICT (singleton) DO UPDATE SET
      date_extraction = EXCLUDED.date_extraction,
      cycle_paqd      = EXCLUDED.cycle_paqd,
      mois_paqd       = EXCLUDED.mois_paqd,
      mois_debut      = EXCLUDED.mois_debut,
      mois_fin        = EXCLUDED.mois_fin,
      fenetre_debut   = EXCLUDED.fenetre_debut,
      fenetre_fin     = EXCLUDED.fenetre_fin,
      realisee_par    = EXCLUDED.realisee_par,
      version_msupply = EXCLUDED.version_msupply;
   ```

   `fenetre_debut` = `date_extraction` − 45 jours.

2. **Exporter chaque vue** dans l'onglet correspondant du classeur, à partir de
   la ligne 6 (après avoir supprimé la ligne d'exemple) :

   | Onglet | Vue |
   |---|---|
   | `METADATA` | `v_dqa_metadata` |
   | `SITES` | `v_dqa_sites` |
   | `SITE_PROGRAMME` | `v_dqa_site_programme` |
   | `PRODUITS` | `v_dqa_produits` |
   | `TRANSACTIONS` | `v_dqa_transactions` |
   | `LIGNES_TRANSACTIONS` | `v_dqa_lignes_transactions` |
   | `STOCK_ACTUEL` | `v_dqa_stock_actuel` |
   | `INVENTAIRES` | `v_dqa_inventaires` |
   | `INVENTAIRE_LIGNES` | `v_dqa_inventaire_lignes` |
   | `REQUISITIONS` | `v_dqa_requisitions` |

   Export CSV possible par vue :
   `\copy (SELECT * FROM v_dqa_sites) TO 'sites.csv' WITH (FORMAT csv, HEADER true)`.

3. `v_dqa_metadata` porte déjà les compteurs `nb_lignes_*` calculés depuis les
   autres vues : ils sont cohérents par construction.

## Tables de configuration (`01_config.sql`)

- **`dqa_parametre_extraction`** — une ligne, mise à jour chaque semaine (étape 1).
- **`dqa_perimetre`** — les `site_code` des 40 sites du périmètre DQA.
  **Fournie par la mission**, revue à chaque cycle. Les vues de mouvements ne
  renvoient que ces sites.
- **`dqa_traceur`** — les `produit_code` (`item.code`) des produits traceurs.
  **Fournie par la mission**, revue à chaque cycle. Filtre de
  `LIGNES_TRANSACTIONS`, `STOCK_ACTUEL`, `INVENTAIRE_LIGNES`.

## Points à confirmer contre l'installation réelle

Les vues encodent des hypothèses issues du schéma seul. À vérifier au premier
export et ajuster dans `10_vues_extraction.sql` :

- **D3 — type de structure.** `v_dqa_sites` lit `name_category3.description` et
  mappe CSU/CSR/ESPC→5, HG/CHR→7, sinon→10. Vérifier les libellés réels.
- **D6 — géographie.** District = `name.category1_id → name_category1.description` ;
  région = `name_category1.parent_id → name_category1_level2.description`.
  Vérifier que `name_category1.parent_id` pointe bien vers `name_category1_level2`
  (et non via un niveau intermédiaire), sinon insérer le maillon.
  `name` porte aussi `region_id` — alternative si la hiérarchie de catégories
  n'est pas renseignée.
- **D4 — réception.** `type = 'si'` → `facture_fournisseur`, `type = 'rc'` →
  `reception`. Confirmer que c'est le bon sens.
- **D7 — traceurs.** Le filtre passe par `dqa_traceur.item_code = item.code`.
  Confirmer que les codes fournis par la mission correspondent à `item.code`.
- **D8 — ajustements.** `nature` d'ajustement = lien `stock_take.invad_*` en
  priorité, sinon lignes `trans_line.is_from_inventory_adjustment` avec le signe
  déduit de `transact.type` (`si` → positif, sinon négatif). Confirmer qu'aucun
  ajustement significatif n'échappe à ces deux mécanismes.
- **D9 — unité de `stock_take_qty`.** `v_dqa_inventaire_lignes` calcule
  `quantite_theorique = snapshot_qty × snapshot_packsize` et
  `quantite_comptee = stock_take_qty`. Si `stock_take_qty` est en
  conditionnements et non en unités, appliquer `× snapshot_packsize` aussi.
- **Réquisitions.** `v_dqa_requisitions` filtre `requisition.type = 'request'`
  (commandes que le site adresse à son fournisseur). Confirmer.
- **Magasins.** `v_dqa_sites` prend tous les `store` non désactivés. Affiner si
  des magasins non sanitaires (virtuels, HIS) apparaissent.
