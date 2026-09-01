# 07: Endpoint d'agrégat pour le tableau de bord national

**What to build:** les données de la page d'accueil `/` : état national + mini
progression + sous-composantes en difficulté.

**Blocked by:** 03, 09

**Status:** done (fusionné dans master)

- [ ] Décision au ticket : nouvel endpoint `GET /tableau-de-bord` vs
      extension de `GET /synthese`. Réutiliser au maximum
      `mv_synthese_nationale`.
- [ ] Le DTO porte : tuiles (nb sites du périmètre, score composite moyen, nb
      sans mesure, `repartitionClassification`), mini-série de progression
      (score composite moyen national par mois PAQD), top 5 des
      sous-composantes par nombre de sites en ALERTE (depuis
      `mv_synthese_sous_composante`, ticket 09).
- [ ] Filtre `dim_site.dans_perimetre_dqa`.
- [ ] Contrat dans `@dqa/contracts` + couture D.
- [ ] Tests intégration API (prior art `synthese.test.ts`) : comptes exacts,
      série de progression ordonnée, top ordonné par nb ALERTE, sur un jeu à
      ≥ 2 sites et ≥ 2 mois.

## Comments

- **Décision : endpoint dédié `GET /tableau-de-bord`**, pas une extension de
  `/synthese`. La mini-série de progression (score composite moyen par mois)
  n'est utile que sur l'accueil ; l'alourdir dans `/synthese` serait payé sur
  tous les appels de la synthèse.
- Constante `TOP_SOUS_COMPOSANTES_DIFFICULTE` (contrats) partagée par le
  schéma `.max(5)`, le `LIMIT` SQL et les tests.
