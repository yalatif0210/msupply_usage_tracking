# 03: Import du canevas v2.4

**What to build:** l'application accepte et promeut les nouvelles colonnes
(date de finalisation, transaction liée, type mSupply d'origine), classe
`rc` en encaissement et signale les conflits de type de structure.

**Blocked by:** 02

**Status:** done

- [x] Contrat d'import, staging, migration : `date_finalisation`,
  `transaction_liee_id`, `date_finalisation_liee` (TRANSACTIONS),
  `type_structure_msupply` (SITES) ; colonnes facultatives, un classeur v2.3
  reste importable avec un avertissement.
- [x] Promotion : nature `encaissement` pour `rc` ; colonnes promues.
- [x] Signalement d'import (gravité info : ce n'est pas un défaut du fichier)
  par site dont le type arbitré diffère du type mSupply.
- [x] Tests : un cas passant et un cas échouant par règle.
- [x] `guide_module_import.md` à jour.
