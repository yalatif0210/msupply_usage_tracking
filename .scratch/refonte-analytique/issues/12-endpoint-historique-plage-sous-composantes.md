# 12: Endpoint historique — plage de mois + valeurs de sous-composante par point

**What to build:** l'endpoint qui alimente courbes fines et radar : une plage
de mois libre, chaque point portant piliers et sous-composantes.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] `historiqueQuerySchema` : accepte une plage `de` / `a` (mois PAQD).
      `cycle` reste accepté comme préréglage. Défaut sans paramètre : le
      cycle courant.
- [ ] `historiqueSite` : quand la plage traverse plusieurs cycles, les points
      sont ordonnés par mois calendaire ; `rang` M+1..M+4 reste renseigné mais
      l'axe X côté front bascule sur le mois.
- [ ] Chaque point (`pointProgressionSchema`, déjà étendu au ticket 04) porte
      les dix `{ sousComposante, valeur, seuil, statut }` **et** le
      `tauxAtteinte` depuis `v_sous_composante_atteinte`.
- [ ] Endpoint fiche site : expose pour le mois affiché les dix
      sous-composantes avec leur taux d'atteinte (tableau à plat + radar).
- [ ] `docs/adr/0001-*` : note d'amendement (le cycle n'est plus la seule
      fenêtre de progression ; il reste le préréglage par défaut).
- [ ] Couture D + tests intégration API : plage sur deux cycles → points
      ordonnés par mois, chaque point avec ses dix sous-composantes et leur
      taux d'atteinte.
- [ ] `docs/guide_module_indicateurs.md` mis à jour.
