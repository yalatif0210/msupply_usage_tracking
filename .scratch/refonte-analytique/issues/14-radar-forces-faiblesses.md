# 14: Radar SVG 6↔10 + liste forces / faiblesses

**What to build:** le diagramme en araignée de la fiche site et la liste
explicite des points forts et faibles.

**Blocked by:** 11, 12, 06

**Status:** done (fusionné dans master)

- [x] Nouveau composant `ui/radar` (SVG inline, aucune librairie, responsive,
      OnPush).
- [x] Bascule 6 piliers ↔ 10 sous-composantes.
- [x] Rayon de chaque axe = taux d'atteinte du seuil (0–100). Étiquette
      d'axe colorée par le statut CONFORME / ALERTE (couleur doublée par le
      libellé, DESIGN_SYSTEM §1).
- [x] Sous le radar : liste « forces / faiblesses » — les 3 sous-composantes
      au plus bas taux d'atteinte < 100 (faiblesses), les 3 au plus haut
      (forces).
- [x] Montre le dernier mois de la plage sélectionnée (ticket 15).
- [x] `aria-label` décrivant la forme pour les lecteurs d'écran.
- [x] `ng build` + capture (les deux modes de bascule).
