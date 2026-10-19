# 02: Extraction canevas v2.4

**What to build:** le script d'extraction de la DAP ramène tout ce dont les
nouvelles règles ont besoin : une fenêtre qui couvre le mois M-2 en entier,
toutes les factures `si` avec leur date de finalisation et leur livraison
liée, les réquisitions citées par ces factures, les `rc` classés en
encaissement, et un type de structure arbitré par le préfixe du nom.

**Blocked by:** aucun (peut démarrer).

**Status:** done

- [x] Fenêtre : du 1er jour du 2e mois avant la date d'extraction à la date
  d'extraction ; les contrôles de paramètres (`fenetre_debut`) suivent.
- [x] TRANSACTIONS : toutes les factures `si` du périmètre en `fn`, `cn`,
  `nw` (critère : date de saisie dans la fenêtre, pas seulement les dates de
  confirmation ou de finalisation) ; colonnes `date_finalisation`,
  `transaction_liee_id` (`transact.linked_transaction_id`, dans les deux sens)
  et `date_finalisation_liee` (le district peut être hors périmètre).
- [x] Nature `encaissement` pour `rc`.
- [x] REQUISITIONS : ajout des réquisitions citées par une facture `si`
  extraite, même hors de la plage M-2 à M ; réponses toujours exclues.
- [x] SITES : `type_structure` arbitré par le préfixe du nom (ADR 0021) ;
  colonne `type_structure_msupply` (catégorie d'origine) ; conflits listés
  en fin d'exécution.
- [x] Gabarit v2.4, spécification v2.4 et PDF, procédure Word, copie `docs/`
  identique.
- [x] Banc d'essai : cas `nw`, `rc`, fenêtre M-2, réquisition hors plage citée,
  conflit de type ; note 100/100 ; test Windows (encodage) inchangé.
