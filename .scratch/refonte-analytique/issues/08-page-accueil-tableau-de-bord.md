# 08: Page d'accueil `/` = tableau de bord ; liste sur `/sites`

**What to build:** transformer `/` en tableau de bord national dense et
déplacer la liste des sites sur `/sites`.

**Blocked by:** 06, 07

**Status:** done (fusionné dans master)

- [ ] `app.routes.ts` : `/` charge un nouveau `TableauDeBordPage` ; `/sites`
      charge l'actuel `ListeSitesPage`. Redirection `**` vers `/`.
- [ ] Barre 2 de la coquille : « Tableau de bord » → `/`, « Sites » →
      `/sites`.
- [ ] `pages/tableau-de-bord` : ligne de tuiles (nb sites périmètre, score
      composite moyen, `repartition-classification`, nb sans mesure) ;
      mini-courbe de progression nationale (réutiliser / adapter
      `courbe-progression`) ; bloc « sous-composantes en difficulté » (top 5,
      nb sites en ALERTE) ; lien « Voir les 40 sites » → `/sites`.
- [ ] Mettre à jour les liens internes vers l'ancienne liste
      (`synthese.ouvrirDistrict` navigue vers `/` avec un `queryParam` — le
      faire pointer `/sites`).
- [ ] `retour` de `detail-site` (« Tous les sites ») → `/sites`.
- [ ] État vide explicite si aucun mois mesuré.
- [ ] `ng build` + captures `/` et `/sites`.

## Comments

- Mini-courbe extraite en `ui/mini-courbe` (primitive SVG réutilisable :
  série datée, ne relie que les points consécutifs mesurés, repères
  étiquetés). `ui/courbe-progression` (cycle M+1..M+4, points colorés par
  classification) reste distinct ; la tranche 6 (ticket 15) consolidera.
- Redirection `**` : `redirectTo: ''` inchangée, `''` résout maintenant vers
  `TableauDeBordPage`.
