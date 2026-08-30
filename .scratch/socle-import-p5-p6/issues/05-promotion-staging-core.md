# 05: Promotion staging → core (upsert, transaction unique)

**What to build:** Après un import propre, les lignes de staging sont promues
dans le core typé en une transaction unique tout-ou-rien. Sites, produits,
programmes, rattachements site-programme, transactions (avec `nature` dérivée),
lignes de transaction, inventaires et lignes d'inventaire sont upsertés sur
leurs identifiants mSupply : ré-importer le même classeur laisse le core
inchangé, un classeur corrigé pour le même mois PAQD remplace ses données. Les
lignes à référence croisée non résolue sont ignorées et enregistrées. Chaque
ligne du core porte l'identifiant du lot qui l'a produite. En cas de succès le
lot passe « validé » ; à tout échec de promotion, le lot entier est annulé.

**Blocked by:** 04

**Status:** done (commit 981ad60)

- [x] Promotion en transaction unique (celle du lot) ; un échec (doublon de PK d'inventaire) annule staging + core, lot « rejeté ».
- [x] Core alimenté depuis le staging sur les identifiants mSupply ; un second import du même classeur produit un core identique (comptages + valeurs).
- [x] Un classeur corrigé pour le même mois écrase les lignes (`quantite` 30 → 99), sans doublon.
- [x] `nature` : valeur de l'extraction si dans le vocabulaire, sinon dérivée (liens INVAD `stg_inventaires.invad_*` puis `type_transaction` + `mode`).
- [x] Lignes à référence absente non promues → anomalie `REFERENCE_NON_PROMUE`.
- [x] Chaque ligne de core porte `lot_id_source`.
- [x] Chevauchement de 45 j réconcilié par upsert (mêmes clés → mise à jour, pas de doublon).
- [x] 6 tests d'intégration (couture A/B).
