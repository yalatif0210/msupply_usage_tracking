# 01: API d'édition de la grille de paramètres

**What to build:** les endpoints `/api/admin/grille` (rôle `coordination`) pour
lister les versions, lire une version, en créer une nouvelle datée dans le
futur, et éditer / supprimer une version encore **planifiée**. Une version en
vigueur ou passée est en lecture seule (ADR 0003 : les scores gelés ne bougent
jamais).

**Blocked by:** None (branche `master`, tables déjà en place)

**Status:** ready-for-agent

- [ ] `@dqa/contracts` : `SENS_SEUIL` / `sensSeuilSchema`, `grilleParametreSchema`
      (`id`, `version`, `effetAPartirDe`, `creeLe`, `statut` ∈
      {planifiee, en_vigueur, passee}, `modifiable`), `poidsPilierSchema`,
      `seuilSousComposanteSchema`, `grilleDetailSchema`, `entreeGrilleSchema`
      (poids `.length(6)` + `.refine` somme = 100 ; tolérance non nulle **ssi**
      `ecart_sdu` / `ecart_consommation`) ; types par `z.infer`.
- [ ] Repository + contrôleur dans `apps/api/src/admin/` :
      - `GET /` → `GrilleParametre[]` triées `effetAPartirDe` desc, `statut`
        calculé (`en_vigueur` = `grille_pour_mois` du mois courant) ;
      - `GET /:id` → `GrilleDetail` (404 inconnue) ;
      - `POST /` → transaction insert `grille_parametre` + 6 poids + seuils ;
        400 date ≤ `CURRENT_DATE` ou somme ≠ 100 ou tolérance incohérente ;
        409 date déjà prise ;
      - `PUT /:id` → remplace poids + seuils si `effet_a_partir_de >
        CURRENT_DATE`, sinon 409 ;
      - `DELETE /:id` → 204 si planifiée, 409 sinon (et la FK
        `hist_score_site.grille_id` reste le dernier rempart).
- [ ] `@Roles(['coordination'])` sur tout sauf éventuellement `GET`
      (garder `coordination` partout ici — la lecture de la grille par un
      lecteur n'est pas demandée).
- [ ] Couture (`test/admin-grille.test.ts`) : liste = v1 `en_vigueur` ;
      création future valide + relecture ; refus date passée / dupliquée (409) /
      somme ≠ 100 / tolérance manquante sur `ecart_sdu` ; `PUT` planifiée OK,
      `PUT`/`DELETE` v1 → 409 ; `lecteur` → 403 ; après création d'une version
      future, une ligne `hist_score_site` d'un mois passé est inchangée.
- [ ] Couture D (`valider-reponse.test.ts`) : `GrilleDetail` complète passe ;
      `statut` inconnu, `poidsPct` hors [0, 100] → lèvent.
