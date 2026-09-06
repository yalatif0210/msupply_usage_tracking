# 01: Le référentiel des structures porte l'échéance et le régime

**What to build:** `strate_structure` devient la source unique de la strate, de
l'échéance de réquisition et du régime district / soins. Les `CASE` codés et la
comparaison `strate_de(...) = 'District'` disparaissent ; `dim_site.jour_limite_requisition`
est retiré du contrat d'extraction. Sur le périmètre réel, aucun score ne bouge.

**Blocked by:** — (peut démarrer)

**Status:** done (commit 205415d, branche `donnees-brutes-piliers`)

- [ ] Migration `00NN_referentiel_structures.sql` :
  - `ALTER TABLE dqa.strate_structure ADD COLUMN jour_limite_requisition int NOT NULL DEFAULT 10`,
    `ADD COLUMN est_district boolean NOT NULL DEFAULT false` ; retirer le DEFAULT
    de `jour_limite_requisition` après seed.
  - `CHECK (jour_limite_requisition BETWEEN 1 AND 28)`.
  - Seed : `DELETE` des lignes `CSU`, `CSR`, `HG`, `CHR` ; `INSERT … ON CONFLICT
    DO UPDATE` des cinq lignes de l'ADR 0013 (`ESPC` 5/ESPC/false,
    `Hôpital de référence` 7/homonyme/false, `District sanitaire` 10/District/true,
    `CHU` 10/CHU/false, `INSTITUT` 10/Institut/false).
  - `dqa.jour_limite_requisition(text)` : signature à un argument, corps =
    `coalesce((SELECT … FROM strate_structure WHERE type_structure = $1), 10)`,
    `STABLE`. Supprimer l'ancienne `(text, integer)`.
  - `dqa.est_district(text)` : `coalesce((SELECT est_district …), false)`, `STABLE`.
  - `dqa.mois_est_clos` : le `10` codé → `(SELECT max(jour_limite_requisition)
    FROM dqa.strate_structure)`.
  - `ALTER TABLE dqa.dim_site DROP COLUMN jour_limite_requisition` ;
    `ALTER TABLE dqa.stg_sites DROP COLUMN jour_limite_requisition`.
  - Reconstruire en cascade `mv_p2_promptitude` → `mv_p3_regularite` →
    `mv_p4_ecart_produit` → `mv_p4_ecart` → `mv_score_pilier` :
    `jour_limite_requisition(t, override)` → `jour_limite_requisition(t)` ;
    `strate_de(t) = 'District'` → `est_district(t)`.
  - `CALL dqa.rafraichir_et_geler(NULL);`
- [ ] `apps/api/src/import/contrat-jeux.ts` : le jeu `SITES` perd
      `jour_limite_requisition` de `colonnes`.
- [ ] `apps/api/src/import/promotion.service.ts` : l'`INSERT dim_site` perd
      `jour_limite_requisition` (colonne + `SELECT` + clause `ON CONFLICT`).
- [ ] `apps/api/src/indicateurs/indicateurs.repository.ts` : remplacer les
      chaînes SQL `strate_de(type_structure) = 'District'` par
      `dqa.est_district(type_structure)` ; `jour_limite_requisition(ds.type_structure,
      ds.jour_limite_requisition)` par `jour_limite_requisition(ds.type_structure)`.
- [ ] `db/demo/seed.sql` : l'`INSERT dim_site` perd la colonne
      `jour_limite_requisition` ; vérifier que `strate_structure` porte les
      cinq lignes après le seed du core.
- [ ] Fixtures de test : `apps/api/test/helpers/classeur.ts` et tout test qui
      pose `dim_site.jour_limite_requisition` ou en-tête SITES correspondant.
- [ ] `apps/api/test/admin-strates.test.ts` : `toHaveLength(8)` → nombre réel
      après prune (5) ; l'assertion « `CSU` jamais dans nonClasses » s'inverse
      (le site de type `CSU` du test devient « à classer »).
- [ ] Un test par règle : `dqa.est_district` (district vrai / soins faux /
      inconnu faux), `dqa.jour_limite_requisition` (mappé / repli 10),
      `strate_structure` CHECK (échéance hors 1–28 refusée).
- [ ] Redéploiement démo : migrations à jour, `:8080` sert, progression
      95,3 → 90,6 → 92,8 → 89,0 → 69,2 et CHR Daloa août 62,5 **inchangés**.
- [ ] `typecheck` + suite API complète au vert.
