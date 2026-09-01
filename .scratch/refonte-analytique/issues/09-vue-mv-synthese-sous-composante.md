# 09: Vue `mv_synthese_sous_composante` + contrat

**What to build:** l'agrégat national des dix sous-composantes.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Migration : vue matérialisée `mv_synthese_sous_composante`, même grain
      que `mv_synthese_nationale` (mois PAQD, + région / programme selon ce
      grain). Par sous-composante : nb sites CONFORME, nb ALERTE, nb
      NON_CALCULABLE, moyenne du taux d'atteinte du seuil.
  - Si mergée avant le ticket 11 : définir le taux d'atteinte inline dans la
    vue, avec une note « à refactorer sur `v_sous_composante_atteinte` ».
  - Si mergée après : lire `v_sous_composante_atteinte`.
- [ ] Filtre `dim_site.dans_perimetre_dqa`. Rafraîchie dans
      `rafraichir_et_geler`.
- [ ] Contrat : `syntheseNationaleSchema` gagne `parSousComposante` (dix
      lignes : `{ sousComposante, pilier, tauxAtteinteMoyen, nbConforme,
      nbAlerte, nbNonCalculable }`), ou DTO dédié — trancher au ticket.
      Respecte les filtres mois / programme / région.
- [ ] Couture D.
- [ ] Tests intégration API (prior art `synthese.test.ts`) : comptes et
      moyenne sur ≥ 2 sites ; respect des filtres ; exclusion hors périmètre.
