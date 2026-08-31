# 02: Section « Progression » sur la fiche site

**What to build:** sous les cartes de pilier de la fiche site, une section qui
trace le score composite du site sur les mois d'un cycle PAQD (M+1..M+4), avec
les repères de classification et une table score-par-pilier pour voir quel
pilier bouge. Pas de nouvelle route ; un second appel HTTP en parallèle du
détail. Registre visuel institutionnel et sobre : SVG inline, pas de librairie
de graphes (DESIGN_SYSTEM §5).

La section n'apparaît que si le site a au moins deux mois mesurés
(`cyclesDisponibles.length > 0` et `points.length > 1`). Elle suit le filtre
programme de la fiche.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `SitesService.historique(siteId, opts)` valide la réponse avec
      `historiqueSiteSchema` (`validerReponse`).
- [ ] `pages/detail-site.ts` : section « Progression » sous les cartes de
      pilier, conditionnée à `points.length > 1`. Sélecteur de cycle si
      `cyclesDisponibles.length > 1`. `recharger()` rappelle `historique` avec
      le `programmeId` courant.
- [ ] `ui/courbe-progression.ts` : SVG inline, largeur fluide (`viewBox`). X =
      rang 1..4 étiqueté `M+1`..`M+4`, Y = 0..100. Repères horizontaux à 75 et
      90 (gris, fins, étiquetés). Polyligne du score composite entre points
      mesurés consécutifs ; cercle par point coloré selon la classification ;
      valeur au-dessus de chaque point. Un mois non mesuré = pas de point.
- [ ] Sous la courbe : « M+1 → M+4 : +N pts » (delta premier→dernier point
      mesuré, signe + couleur) ; « — » si moins de deux points.
- [ ] Table compacte : une ligne par pilier P1..P6, une colonne par mois mesuré
      (`M+n`), cellule = `100` / `0` / `—`.
- [ ] `typecheck` + `ng build` OK ; réponse validée Zod (couture D au ticket 01).
- [ ] Mettre à jour `docs/guide_module_indicateurs.md` (section progression) et
      `ARCHITECTURE.md` §3/§4 si besoin.
