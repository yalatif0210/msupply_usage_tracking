# 01: Promotion des réquisitions dans le core

**What to build:** à l'import d'un classeur, les réquisitions passent de la couche
de staging à la couche core, typées et dédoublonnées, prêtes à alimenter les
piliers P1 et P2. Aujourd'hui l'onglet des réquisitions est bien lu et mis en
staging mais n'est jamais promu : aucune réquisition n'existe en core.

Une réquisition couvre le mois de son inventaire de référence de fin de mois
(mois M), jamais le mois de sa soumission (M+1). Le mois couvert est dérivé à la
promotion. Une réquisition dont le mois couvert ne peut être déterminé, ou tombe
hors de la fenêtre d'extraction attendue, produit une anomalie d'import de
gravité avertissement (l'import n'est pas bloqué) et la réquisition est écartée
du core.

Une réquisition qui référence un site ou un programme absent du core produit
l'anomalie de référence non promue déjà en place pour les autres faits.

Un même identifiant de réquisition présent dans deux extractions successives
s'écrase proprement (upsert sur l'identifiant mSupply).

**Blocked by:** None (can start immediately)

**Status:** done (commit 77b251d)

- [x] Une table core des réquisitions existe via une migration numérotée ; clé
      primaire = identifiant mSupply de la réquisition ; colonnes typées
      (site, programme, mois couvert, date de soumission, statut).
- [x] L'étape de promotion écrit les réquisitions du staging vers le core dans
      la même transaction que les autres faits, avec dérivation du mois couvert.
- [x] Le mois couvert est le mois de l'inventaire de référence de fin de mois,
      pas le mois de soumission.
- [x] Une réquisition au mois couvert **mal formé** est écartée du core et
      déclenche l'anomalie d'avertissement `MOIS_COUVERT_INVALIDE` ; un mois
      couvert **hors cycle** (bien formé) est signalé de même mais reste promu
      (cf. user story 34 de la spec : signalement sans blocage) ; l'import reste
      valide dans les deux cas.
- [x] Une réquisition référençant un site inconnu déclenche l'anomalie de
      référence non promue ; un programme inconnu laisse `programme_id` nul
      (jointure externe, conforme à la spec).
- [x] Réimporter une extraction chevauchante ne crée pas de doublon.
- [x] Couture B : test de l'étape de promotion (cas passant + réquisition
      écartée). Couture C : un test par cas de la règle mois couvert invalide
      (cas passant + cas déclenchant). Couture A : import de bout en bout d'un
      classeur, vérification que les réquisitions sont en core.
