# 04: Contrats + endpoint historique exposent les valeurs de sous-composante gelées

**What to build:** rendre les valeurs `sc_*` gelées disponibles côté front via
les contrats et le repository.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] `pointProgressionSchema` (`@dqa/contracts`) : ajoute les dix valeurs de
      sous-composante du point (forme brève `{ sousComposante, valeur, seuil,
      statut }`, dix entrées ; réutiliser `sousComposanteSchema` /
      `statutSousComposanteSchema`).
- [ ] `indicateurs.repository.historiqueSite` lit les `sc_*` gelés en plus des
      scores de pilier ; le seuil du point vient de `grille_seuil_sous_composante`
      via `grille_id`, le statut se déduit (valeur vs seuil, sens).
- [ ] Décision au ticket : la fiche site (`detailSite`) continue-t-elle de
      lire les sous-composantes du mois courant depuis les vues live, ou
      bascule-t-elle sur `hist_score_site.sc_*` pour cohérence avec
      l'historique ? Trancher et documenter dans le guide.
- [ ] Couture D (`valider-reponse.test.ts`) : fixtures passante + échouante
      pour `pointProgression` étendu et `historiqueSite`.
- [ ] Tests intégration API : un point d'historique porte bien ses dix
      valeurs de sous-composante.
- [ ] `docs/guide_module_indicateurs.md` mis à jour.
