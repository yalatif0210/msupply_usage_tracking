# 12: Nettoyage, docs et captures finales

**What to build:** la migration est close : plus aucun code visuel de l'ère
StarAdmin, la documentation reflète le nouvel état, et les captures de tous les
écrans sont archivées.

**Blocked by:** 06, 07, 08, 09, 10, 11

**Status:** done (fusionné dans master)

- [x] Suppression des composants SVG maison remplacés (`ui/radar`,
      `ui/courbe-series`, `ui/mini-courbe`) et de tout code mort associé.
- [x] Suppression des jetons obsolètes : `--serie-*`, jetons StarAdmin non
      repris (`--fond`, `--surface`, `--marque*`, `--barre1-*`, `--sur-marque-*`,
      `--texte*`, `--bordure`, `--neutre`). `theme.css` ne garde que la palette
      shadcn, les jetons `--chart-*` et les jetons de statut.
- [x] `docs/reference/shadcn-admin/` et `shadcn-admin-1.0.0.zip` retirés du
      disque ; entrées `.gitignore` correspondantes nettoyées.
- [x] `docs/guide_module_indicateurs.md`, `DESIGN_SYSTEM.md` et le pointeur de
      test de l'ADR 0008 mis à jour (composants `ui/graphe-*`, légendes, filtres).
- [x] `docs/guide_module_ressource.md` couvre la primitive `core/ressource`
      (rôle, contrat, sync URL, pièges).
- [~] Captures Playwright : les jeux par tranche (05, 06, 08, 09, 10, 11) sont
      committés sous `captures/` et ont servi aux revues. Pas de jeu complet
      re-capturé : la tranche 07 (liste des sites) n'a jamais eu de capture, et
      un rendu fidèle exige la base de démo (40 sites + scores) montée sur les
      ports locaux, indisponible en l'état. À reprendre quand la stack de démo
      tourne.
- [x] `conventions-source.test.ts` verte (aucune exception périmée) ;
      `ng build` + typecheck web verts. Suite API : 169/169 verte en séquentiel
      avec `--testTimeout=30000` ; les échecs de la passe parallèle par défaut
      étaient tous des `timed out 5000ms` sous charge machine (source
      `apps/api` inchangée depuis le dernier état vert), pas des régressions.
