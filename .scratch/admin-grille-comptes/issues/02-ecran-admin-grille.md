# 02: Écran `/admin/grille`

**What to build:** l'écran de la coordination pour consulter les versions de
grille et préparer celle du cycle suivant. Registre visuel institutionnel et
sobre (DESIGN_SYSTEM).

**Blocked by:** 01

**Status:** done (branche `admin-grille-comptes`)

- [x] Route `/admin/grille` (`gardeRole(['coordination'])`), lazy-loaded, sur le
      modèle de `/admin/traceurs`. Lien « Grille » dans `ui/entete`, visible
      pour `coordination` (rôles exclusifs : cohérent avec `@Roles(['coordination'])`
      côté API).
- [x] `core/admin-grille.service.ts` : `lister()`, `detail(id)`, `creer(entree)`,
      `modifier(id, entree)`, `supprimer(id)` ; `validerReponse` sur les
      lectures.
- [x] `pages/admin-grille.ts` : tableau des versions (version, date d'effet,
      statut en badge) ; sélection d'une ligne → panneau de détail (poids +
      seuils, en lecture seule si non modifiable).
- [x] Bouton « Nouvelle version » : formulaire pré-rempli depuis la version en
      vigueur (`detail(id)`), champs libellé + date d'effet + 6 poids (total
      affiché en direct, erreur si ≠ 100) + une ligne par sous-composante
      (seuil, sens, tolérance si `ecart_sdu` / `ecart_consommation`).
      « Enregistrer » → `creer`.
- [x] Une version **planifiée** est éditable en place (`modifier`) et
      supprimable (`supprimer`) ; une version en vigueur / passée n'affiche que
      la lecture.
- [x] Les erreurs serveur (date passée, somme, doublon) sont affichées
      lisiblement, pas avalées.
- [x] `typecheck` + `ng build` OK.
