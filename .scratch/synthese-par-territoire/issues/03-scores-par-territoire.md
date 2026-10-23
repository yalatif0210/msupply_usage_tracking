# 03: Scores par territoire

**What to build:** dans l'onglet des scores de la synthèse, la ligne par
district devient l'arborescence Région, puis zone de district, puis site. Pour
une région ou une zone : score composite moyen, nombre de sites mesurés,
répartition des classifications. Pour un site : score composite,
classification, piliers couverts, lien vers la fiche. Tri du score le plus
faible au plus élevé.

**Blocked by:** 01 (même composant d'arborescence et mêmes libellés « non
renseigné »).

**Status:** done

- [x] Synthèse des scores étendue au niveau site, régions et districts vides
  regroupés sous « non renseigné » au lieu d'être écartés.
- [x] API et contrat : l'arborescence remplace `parDistrict` ; sites d'une
  zone à la demande.
- [x] Front : même arborescence que l'onglet rapports, lien vers la fiche site.
- [x] Tests : site sans district, moyenne d'une zone sur ses seuls sites
  mesurés, répartition par niveau.
