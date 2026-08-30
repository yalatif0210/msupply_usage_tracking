# 07: Écran détail site (P5/P6) + API de lecture + filtre programme

**What to build:** Un `lecteur` connecté ouvre la page d'un site et voit, pour
le dernier mois PAQD mesuré, les piliers P5 et P6 — chacun avec sa
sous-composante, la valeur mesurée, le seuil de référence, et un badge de statut
binaire (ou NON_CALCULABLE avec sa raison). Il peut passer à un mois PAQD
antérieur et filtrer par un programme que le site gère. Aucun score composite
n'est affiché ; la page indique « 2 piliers sur 6 couverts ». Si aucun import
n'a tourné, la page montre un état vide explicite. Une liste des sites est
accessible, filtrable par district / région / programme. Le front rejette toute
réponse API non conforme au contrat plutôt que d'afficher `undefined`.

**Blocked by:** 03, 06

**Status:** done (commit 0ff42a9)

- [x] `GET /api/sites/:id` → `DetailSite` restreint P5/P6, validé côté test par `detailSiteSchema` ; `GET /api/sites` avec filtres district/région/programme ; `GET /api/referentiel/programmes|districts`. Toutes authentifiées.
- [x] Écran détail : piliers P5 et P6 avec sous-composante, valeur, seuil (grille), badge de statut binaire, raison si NON_CALCULABLE.
- [x] Sélecteurs de programme et de mois (ce dernier apparaît dès qu'il y a plus d'un mois mesuré) ; rechargement à chaque changement. `DetailSite.moisDisponibles` alimente la liste.
- [x] Aucun score composite ; badge « 2 piliers sur 6 » sur l'écran, `scoreComposite` null dans le contrat.
- [x] État vide explicite (`moisPaqd` null, `piliers` vide → message dédié) ; 404 → « site inconnu ou hors périmètre ».
- [x] `SitesService` valide chaque réponse via `validerReponse(schema, data)` et lève sur non-conformité.
- [x] `DESIGN_SYSTEM.md` : badges de statut, chiffres `2.4rem` tabular-nums, contrastes francs.
- [x] 8 tests : 6 e2e API (couture A) + 2 couture D.
