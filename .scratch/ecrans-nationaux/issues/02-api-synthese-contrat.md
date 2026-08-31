# 02: `GET /api/synthese` + contrat `SyntheseNationale` + référentiel régions

**What to build:** un endpoint de lecture qui sert l'état national d'un mois
PAQD, filtrable par programme et par région, à partir de `mv_synthese_nationale`.
Plus le contrat partagé et un petit endpoint `/api/referentiel/regions` pour
alimenter le filtre région du front.

`GET /api/synthese?mois=&programmeId=&region=` renvoie : le mois affiché (le
plus récent par défaut) et la liste des mois disponibles ; un bloc national
(nombre de sites, sites mesurés, score composite moyen, répartition des
classifications, moyenne des six piliers) ; la ventilation par district (triée
score croissant) ; la section des scores par programme (tous les programmes,
triée score croissant, avec le nombre de sites gérant chaque programme).

Le filtre `programmeId` restreint le bloc national et la ventilation par
district à ce programme ; la section « par programme » l'ignore toujours. Le
filtre `region` restreint districts et programmes à cette région et ré-agrège
le bloc national.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `@dqa/contracts` : schémas Zod `repartitionClassificationSchema`,
      `blocSyntheseSchema`, `ligneDistrictSyntheseSchema`,
      `ligneProgrammeSyntheseSchema`, `syntheseNationaleSchema`,
      `syntheseQuerySchema` (mois / programmeId / region optionnels) ; types par
      `z.infer`. `moyennesPiliers` = 6 entrées ordonnées P1..P6.
- [ ] `GET /api/synthese` (tout authentifié) lit `mv_synthese_nationale`
      (+ `dim_programme` pour les libellés, + un compte `dim_site_programme`
      pour `nbSitesGerant`). Aucun calcul d'indicateur en TypeScript.
- [ ] `mois` par défaut = le plus récent de `mv_synthese_nationale` ;
      `moisDisponibles` = mois distincts ; `moisPaqd = null` +
      tableaux vides si la vue est vide.
- [ ] `national` = ligne `(mois, programmeId|NULL, region|NULL, district=NULL)` ;
      `parDistrict` = lignes `district` non nul filtrées région ;
      `parProgramme` = lignes `programme` non nul, `district` nul, filtrées
      région, un item par programme géré par ≥ 1 site du périmètre (même sans
      mesure).
- [ ] `GET /api/referentiel/regions` → `string[]` trié, régions des sites
      `dans_perimetre_dqa`.
- [ ] Couture A : `POST /api/imports` d'un classeur → `GET /api/synthese` rend
      un objet conforme à `syntheseNationaleSchema` ; `?programmeId=` restreint
      national + districts ; `?region=` restreint districts + programmes ;
      `/api/referentiel/regions` renvoie les régions ; `GET /api/synthese` sans
      session → 401.
- [ ] Couture D (`core/synthese.service.test.ts` ou extension de
      `valider-reponse.test.ts`) : une `SyntheseNationale` complète passe ;
      `scoreCompositeMoyen` hors [0, 100], classification inconnue dans une
      répartition, ou `moyennesPiliers` ≠ 6 entrées → lève une erreur explicite.
