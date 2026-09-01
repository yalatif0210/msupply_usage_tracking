# 05: Schéma de couleurs StarAdmin en tokens maison + réécriture DESIGN_SYSTEM.md

**What to build:** adopter le registre chromatique de StarAdmin, recréé en
tokens CSS maison, et réécrire le design system.

**Blocked by:** —

**Status:** ready-for-agent

- [ ] Relever la palette de StarAdmin depuis son dépôt public et la
      transcrire en variables CSS maison (`styles.css` ou fichier de tokens
      dédié). Aucun fichier SCSS, police, icône ou illustration de StarAdmin
      n'entre dans le dépôt.
- [ ] Réattribuer les rôles de `DESIGN_SYSTEM.md` §1 (fond, surface, texte
      principal / secondaire, bordure, accent ; statuts CONFORME / ALERTE /
      NON_CALCULABLE ; classifications) aux nouvelles valeurs, en gardant la
      règle « couleur jamais seule, toujours doublée d'un libellé ».
- [ ] Réécrire `DESIGN_SYSTEM.md` : nouvelle palette, coquille à deux barres
      (voir ticket 06), `/` = tableau de bord national, graphes SVG étendus
      (radar + multi-séries, toujours sans librairie), **règle « aucun tiret
      long »** avec le tableau des remplacements du ticket 01.
- [ ] `docs/adr/0006-adoption-du-registre-visuel-staradmin.md` : rupture
      assumée avec le design system initial, arbitrage lisibilité-projection
      vs familiarité admin-template.
- [ ] Aucune dépendance ajoutée. Composants standalone, zoneless, OnPush
      inchangés.
- [ ] `ng build` + captures avant / après d'un écran représentatif.
