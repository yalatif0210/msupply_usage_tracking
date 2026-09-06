# 03: Documentation — canevas, spec DAP, guides, CONTEXT

**What to build:** aligner la documentation sur le référentiel administré :
la colonne `type_structure` du canevas annonce les paliers réels, l'échéance
n'est plus un champ de la feuille SITES ni une règle figée, et les guides
pointent le référentiel comme source unique.

**Blocked by:** 01, 02

**Status:** done (branche `donnees-brutes-piliers`)

- [ ] `docs/canevas_extraction_v2.md` :
  - en-tête de la colonne F du modèle SITES : `District sanitaire`,
    `Hôpital de référence`, `ESPC` (paliers `name_category3`), + note « valeur
    plus fine acceptée si mappée dans la console ».
  - ligne `jour_limite_requisition` retirée du tableau SITES.
  - D3 réécrite : `type_structure` = palier `name_category3` ; échéance et
    régime district viennent du référentiel administré (renvoi ADR 0013).
- [ ] `docs/specification_extraction_dap.md` : §4.2 (colonne
      `jour_limite_requisition` retirée), §5.3 (le tableau devient le seed
      d'un référentiel éditable, plus une échelle figée ; `CHU` / `INSTITUT`
      cités).
- [ ] `docs/guide_module_admin.md` : section « strates » réécrite — la table
      porte trois responsabilités (strate d'affichage, échéance, régime) ;
      l'écran s'appelle « Types de structure » ; repli « Non classé » / 10 /
      soins.
- [ ] `docs/guide_module_indicateurs.md` : P2 lit `jour_limite_requisition(type)` ;
      P3 et P4 lisent `est_district(type)` ; les deux renvoient au référentiel.
- [ ] `docs/guide_module_infra.md` : ligne `/admin/strates` de la table démo
      mise à jour (« Types de structure », trois colonnes).
- [ ] `CONTEXT.md` : entrée « Strate de structure » → « Type de structure »
      (les trois attributs administrés) ; nouvelle entrée « Régime de scoring »
      (district vs site de soins, `dqa.est_district`).
- [ ] Captures d'écran de `/admin/strates` si le dossier `captures/` du feature
      est utilisé.
