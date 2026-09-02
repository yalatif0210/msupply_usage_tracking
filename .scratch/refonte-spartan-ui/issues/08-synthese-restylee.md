# 08: Synthèse nationale re-stylée

**What to build:** l'écran `/synthese` prend le registre shadcn-admin :
onglets, tableaux propres, badges cohérents. Le changement de mois ne recharge
pas la page (déjà migré).

**Blocked by:** 03, 05

**Status:** done (fusionné dans master)

- [ ] Bascule « Par pilier » / « Sous-composantes » en `tabs` spartan (client,
      sans refetch).
- [ ] Blocs national / par district / par programme / par sous-composante en
      `card` + `table` spartan.
- [ ] Moyennes par pilier au style shadcn ; libellé P4 = « Taux de conformité ».
- [ ] Badges de statut spartan ; barre de répartition re-stylée (CSS flex).
- [ ] Filtres mois / programme / région au style spartan ; refetch en
      arrière-plan sans clignotement, URL suit.
- [ ] `n/d` pour toute valeur absente ; aucun tiret long ; aucune citation
      d'ADR à l'écran.
- [ ] Captures Playwright ; `ng build` + typecheck verts ;
      `conventions-source.test.ts` verte.
