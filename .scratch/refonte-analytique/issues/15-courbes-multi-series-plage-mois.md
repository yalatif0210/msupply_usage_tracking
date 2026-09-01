# 15: Widget courbes multi-séries + sélecteur de plage de mois

**What to build:** le widget d'évolution de la fiche site : granularité
composite / pilier / sous-composante, piloté par une plage de mois.

**Blocked by:** 12, 06

**Status:** ready-for-agent

- [ ] Widget courbes (extension de `ui/courbe-progression` ou nouveau
      composant), SVG inline, aucune librairie.
- [ ] Sélecteur de granularité : composite / par pilier (6 séries) / par
      sous-composante d'un pilier choisi (≤ 3 séries).
- [ ] Axe Y 0–100 = taux d'atteinte du seuil (composite et scores de pilier
      restent sur leur échelle 0–100 native). Repères horizontaux 65 / 75 /
      90.
- [ ] Un mois manquant reste un trou (ne relie que des mois consécutifs,
      comme aujourd'hui).
- [ ] **Sélecteur de plage de mois dans l'écran** (jamais dans la barre de
      nav) : deux listes « de / a » alimentées par les mois disponibles +
      préréglages « cycle courant » (défaut), « 12 derniers mois », « tout ».
- [ ] La plage pilote le widget courbes **et** le radar (ticket 14) et le
      tableau à plat (ticket 13) : radar / tableau montrent le dernier mois
      de la plage.
- [ ] La section « Progression sur le cycle » actuelle de `detail-site` est
      remplacée / absorbée par ce widget.
- [ ] `ng build` + captures (chaque granularité, une plage multi-cycles).
