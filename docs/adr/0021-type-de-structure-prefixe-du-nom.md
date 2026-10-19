# Le type de structure est arbitré par le préfixe du nom du site

**Statut.** Accepté (2026-10-19).

**Contexte.** Le script d'extraction de la DAP déduit le type de structure de
la catégorie mSupply (`name_category3`), et ne regarde le nom du site qu'en
repli. Sur les 3 101 sites du lot du 2026-10-14, 26 ont une catégorie qui
contredit le préfixe de leur nom ; dans le périmètre, CHR PUBLIC de BONDOUKOU
est typé ESPC, ce qui lui applique le délai de réquisition d'un ESPC (5 jours
au lieu de 7) et le range dans la mauvaise strate.

**Décision.**

- Le type de structure est comparé au préfixe du nom du site (CHR, CHU, HG,
  DISTRICT SANITAIRE, CSU, CSR…). **En cas de conflit, le préfixe l'emporte.**
- Le conflit est **signalé**, pour que la DAP corrige la catégorie dans
  mSupply.

**Pourquoi.** Le préfixe du nom suit la convention nationale de dénomination
des structures ; une catégorie mal saisie est une erreur de saisie à corriger
à la source, pas une information à propager dans les scores.

**Conséquences.** L'extraction transmet le type arbitré et le type mSupply
d'origine ; l'import signale chaque conflit.
