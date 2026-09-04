# Contrat d'extraction V2

**Contexte.** L'extraction V1 est un classeur Excel « rempli par la DAP », et
`CLAUDE.md` §1 en fait un invariant d'architecture. L'onglet METADATA montre que
le fichier est produit par requêtes SQL (14 462 lignes, compteurs exacts) :
l'humain exécute et transmet, il ne saisit rien. La V1 laissait aussi le tableau
de bord deviner le sens des transactions à partir de `transact.type` (champ texte
libre, valeurs `im+`/`im-` inexistantes, `rc`/`cc` non documentées).

**Décision.** L'extraction devient un **contrat de données typé**. Le format
transmis chaque semaine au tableau de bord reste **un classeur Excel unique**
(un onglet par jeu), conformément à `CLAUDE.md` §1. La production du contenu
(requêtes SQL exécutées sur mSupply, sans saisie manuelle) reste entièrement à
la charge de la DAP ; le contrat fixe le résultat attendu par colonne, pas la
façon de l'obtenir. Le contrat :

- qualifie chaque transaction par une colonne `nature` à vocabulaire contrôlé,
  dérivée en SQL (`type` + `mode` + liens d'ajustement d'inventaire) ;
- porte la dimension **programme de santé** sur SITES (onglet `SITE_PROGRAMME`),
  INVENTAIRES, REQUISITIONS et TRANSACTIONS ;
- identifie les ajustements d'inventaire par `trans_line.is_from_inventory_adjustment`
  et `stock_take.invad_additions_id` / `invad_reductions_id`, jamais par un code
  de type ;
- déclare le périmètre DQA (`dans_perimetre_dqa`) et le mois PAQD couvert
  (METADATA), et fixe des grains sans doublon (INVENTAIRE_LIGNES, PRODUITS).

Détail dans `docs/canevas_extraction_v2.md`.

**Pourquoi.** Un contrat typé, généré par requête plutôt que saisi à la main,
supprime la classe d'erreurs « saisie manuelle » et fait porter la
désambiguïsation métier (dispensation vs réception vs ajustement) au plus près
des données, plutôt que par des heuristiques fragiles côté tableau de bord.
Garder le classeur Excel comme format de transmission préserve l'invariant de
`CLAUDE.md` §1 (dépôt manuel d'un fichier, aucune connexion à mSupply) et reste
exploitable hors ligne. La DAP reste seule responsable des requêtes qui
produisent chaque onglet ; le coût de faire évoluer ces requêtes quand le
contrat change lui incombe.
