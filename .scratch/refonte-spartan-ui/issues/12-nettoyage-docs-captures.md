# 12: Nettoyage, docs et captures finales

**What to build:** la migration est close : plus aucun code visuel de l'ère
StarAdmin, la documentation reflète le nouvel état, et les captures de tous les
écrans sont archivées.

**Blocked by:** 06, 07, 08, 09, 10, 11

**Status:** ready-for-agent

- [ ] Suppression des composants SVG maison remplacés (`ui/radar`,
      `ui/courbe-series`, `ui/mini-courbe`) et de tout code mort associé.
- [ ] Suppression des jetons obsolètes : `--serie-*`, jetons StarAdmin non
      repris (`--fond`, `--accent-doux`, `--barre1-*`, `--sur-accent-*`… selon
      ce qui n'est plus référencé).
- [ ] `docs/reference/shadcn-admin/` et `shadcn-admin-1.0.0.zip` retirés du
      disque ; entrées `.gitignore` correspondantes nettoyées.
- [ ] `docs/guide_module_indicateurs.md` et tout guide de module touché mis à
      jour (composants, graphes, comportement des filtres).
- [ ] Un `docs/guide_module_<nom>.md` couvre la primitive `core/ressource`
      (rôle, contrat, sync URL, pièges).
- [ ] Captures Playwright de **tous** les écrans committées à la revue de
      tranche.
- [ ] `conventions-source.test.ts` verte sans exception non justifiée ;
      `ng build` + typecheck verts ; suite API inchangée (169 tests).
