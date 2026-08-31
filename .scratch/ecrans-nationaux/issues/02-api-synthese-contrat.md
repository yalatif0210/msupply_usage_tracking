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

**Status:** done (branche `ecrans-nationaux`)

- [x] `@dqa/contracts` : `repartitionClassificationSchema`, `blocSyntheseSchema`,
      `ligneDistrictSyntheseSchema`, `ligneProgrammeSyntheseSchema`,
      `syntheseNationaleSchema`, `syntheseQuerySchema` ; types par `z.infer`.
      `moyennesPiliers` = 6 entrées P1..P6 (`.length(6)`).
- [x] `GET /api/synthese` (tout authentifié — garde globale) lit
      `mv_synthese_nationale` (+ `dim_programme` pour les libellés). Aucun
      calcul d'indicateur en TypeScript. `nb_sites` d'une ligne programme = le
      dénominateur des sites gérant → pas de colonne `nbSitesGerant` séparée.
- [x] `mois` par défaut = le plus récent de `mv_synthese_nationale` ;
      `moisDisponibles` = mois distincts ; `moisPaqd = null` + tableaux vides et
      `national` à zéro si la vue est vide.
- [x] `national` = ligne `(mois, programmeId|NULL, region|NULL, district=NULL)`
      (`IS NOT DISTINCT FROM` sur programme et région) ; `parDistrict` = lignes
      `district` non nul filtrées région, triées score croissant ;
      `parProgramme` = lignes `programme` non nul / `district` nul, filtrées
      région, un item par programme géré (même sans mesure), triées score.
- [x] `GET /api/referentiel/regions` → `string[]` trié, régions du périmètre.
- [x] Couture A (extension `test/lecture-indicateurs.test.ts`) : `GET /api/synthese`
      conforme à `syntheseNationaleSchema` ; `?programmeId=` restreint national +
      districts, garde tous les programmes dans `parProgramme` ; `?region=`
      restreint districts + programmes ; `/api/referentiel/regions` ; 401 sans
      session.
- [x] Couture D (extension `valider-reponse.test.ts`) : `SyntheseNationale`
      complète passe ; `scoreCompositeMoyen` hors [0, 100], `moyennesPiliers` ≠ 6,
      répartition incomplète → lève.

## Comments

- Suite : api 117 verts, contracts 13, web 10.
