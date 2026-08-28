# Les référentiels DQA sont administrés dans l'application

**Contexte.** Trois jeux de données de référence pilotent le calcul des scores :
la grille de paramètres (poids, seuils), la liste des produits traceurs, et le
périmètre DQA. On pourrait les faire venir de l'extraction mSupply, ou les figer
en migrations.

**Décision.**

- **Grille de paramètres** et **liste des produits traceurs** : administrées dans
  la console web par le rôle `coordination`. Elles ne sont ni dérivées de
  mSupply, ni figées en migration.
- **Périmètre DQA** : déclaré par la DAP dans l'extraction (colonne
  `dans_perimetre_dqa`), pas dans l'app.

**Pourquoi.** Les traceurs et les seuils relèvent d'un arbitrage de la mission
DQA, pas d'une donnée de gestion mSupply : les rattacher à l'extraction
obligerait à un aller-retour avec la DAP à chaque révision de cycle. Le
périmètre, lui, est une liste de sites que la DAP tient déjà et qu'elle est la
mieux placée pour maintenir à jour.

**Conséquence.** L'extraction envoie tous les produits sans marquage traceur ;
l'app fait la jointure avec sa propre liste. Un futur contributeur ne doit pas
« corriger » l'absence de `est_traceur` dans le canevas : c'est délibéré.
