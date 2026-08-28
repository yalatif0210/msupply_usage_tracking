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

**Status:** ready-for-agent

- [ ] `import_lot` : compteurs déclarés / constatés (JSONB), mois et cycle PAQD, statut avec contrainte `recu|en_cours|valide|rejete`, **pas de `empreinte_sha256`**.
- [ ] `import_anomalie` : gravité avec contrainte `info|avertissement|erreur`, FK `lot_id` en cascade.
- [ ] Un `stg_*` par jeu du contrat V2 (`SITES`, `SITE_PROGRAMME`, `PRODUITS`, `TRANSACTIONS`, `LIGNES_TRANSACTIONS`, `STOCK_ACTUEL`, `INVENTAIRES`, `INVENTAIRE_LIGNES`, `REQUISITIONS`), colonnes `TEXT`, aucune contrainte, `lot_id` sur chaque ligne.
- [ ] Dimensions et faits du core avec identifiants mSupply en clés naturelles ; chaque table `fact_*` porte l'identifiant du lot source.
- [ ] `grille_parametre` : table datée (période de validité), seedée avec les six poids de piliers et les seuils P5 (= 100 %) / P6 (≤ 5 %) de `CLAUDE.md` §5.
- [ ] `dim_temps` seedé avec les jours ouvrables (jours fériés Côte d'Ivoire exclus) couvrant au moins le cycle PAQD courant et le précédent.
- [ ] `dim_produit_traceur` seedé.
- [ ] Une base vierge migre proprement de bout en bout ; des assertions de schéma confirment tables, colonnes et lignes de seed.
- [ ] `initial.sql` supprimé une fois les migrations équivalentes en place (ADR 0001).
