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

**Status:** ready-for-agent

- [ ] La promotion s'exécute en une transaction ; un échec forcé en cours de promotion laisse le core intact et le lot non « validé ».
- [ ] Les tables du core sont alimentées depuis le staging avec les identifiants mSupply en clés ; un second import du même classeur produit un état de core identique (vérifié par comptages + contenu).
- [ ] Un classeur corrigé pour le même `mois_paqd` écrase les lignes de core concernées, sans doublon.
- [ ] `nature` est dérivée selon les règles ordonnées du canevas §4.5 (ajustement via liens d'inventaire / drapeau de ligne d'abord).
- [ ] Les lignes référençant un site / produit / programme absent ne sont pas promues et apparaissent en anomalies.
- [ ] Chaque ligne de core promue référence son lot source.
- [ ] Le chevauchement de 45 jours entre deux classeurs successifs se réconcilie par upsert sans duplication.
- [ ] Tests : couture A (poster classeur → asserter l'état du core, re-poster → inchangé).
