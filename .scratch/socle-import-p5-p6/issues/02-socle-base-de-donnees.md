# 02: Socle base de données DQA (couches 0/1/2 + référentiels seedés)

**What to build:** Une base PostgreSQL vierge, passée par les migrations, porte
le modèle de données complet du tableau de bord : les tables de contrôle des
imports (lot + anomalies, **sans** colonne d'empreinte), un `stg_*` brut par jeu
du contrat d'extraction V2, le core typé (dimensions site / produit / programme /
site-programme / temps, faits transaction / ligne / inventaire / ligne
d'inventaire / photo de stock) clé sur les identifiants mSupply, la **grille de
paramètres datée** seedée avec les poids et seuils de `CLAUDE.md` §5, le
calendrier ouvrable seedé, et la liste de référence des produits traceurs
seedée. Pas encore de vue d'indicateur.

**Blocked by:** 01

**Status:** done (commit 3e4daf9)

- [x] `import_lot` : compteurs déclarés / constatés (JSONB), mois et cycle PAQD, statut avec contrainte `recu|en_cours|valide|rejete`, **pas de `empreinte_sha256`**.
- [x] `import_anomalie` : gravité avec contrainte `info|avertissement|erreur`, FK `lot_id` en cascade.
- [x] Un `stg_*` par jeu du contrat V2 (9 tables), colonnes `TEXT`, aucune contrainte, `lot_id` + `ligne_source` sur chaque ligne.
- [x] Dimensions et faits du core avec identifiants mSupply en clés naturelles ; chaque table `fact_*` porte `lot_id_source`.
- [x] `grille_parametre` : table datée (période de validité), seedée v1 — six poids (somme 100) + neuf seuils de sous-composantes (`CLAUDE.md` §5), avec `sens` sup/inf. Vue `v_grille_active`.
- [x] `dim_temps` seedé 2025-2027 (1095 jours, 771 ouvrables), fériés fixes CI dans `jour_ferie`, `cycle_paqd` C1/C2/C3.
- [x] `dim_produit_traceur` seedé (placeholder à remplacer par la liste de la mission).
- [x] Une base vierge migre proprement de bout en bout ; 7 assertions de schéma via testcontainers.
- [x] `initial.sql` supprimé (ADR 0001).
