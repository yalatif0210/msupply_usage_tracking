# 02: Éditer l'échéance et le régime dans /admin/strates

**What to build:** l'écran d'administration (renommé « Types de structure »)
laisse la coordination lire et modifier, par `type_structure`, la strate,
le jour limite de réquisition et le régime district / soins. L'onglet
« à classer » est inchangé.

**Blocked by:** 01 (les colonnes doivent exister)

**Status:** done (branche `donnees-brutes-piliers`)

- [ ] `packages/contracts/src/dto.ts` :
  - `strateStructureSchema` gagne `jourLimiteRequisition: z.number().int().min(1).max(28)`
    et `estDistrict: z.boolean()`.
  - `entreeStrateSchema` = `strateStructureSchema.omit({ typeStructure: true })`
    (corps du `PUT`, trois champs).
- [ ] `apps/api/src/admin/strates.repository.ts` :
  - `etat()` : le `SELECT` remonte les deux colonnes ; l'interface `Ligne` et
    `vers()` les portent.
  - `enregistrer()` : `INSERT … ON CONFLICT DO UPDATE` sur les trois champs ;
    `RETURNING` complet.
- [ ] `apps/api/src/admin/strates.controller.ts` : le `PUT` valide avec
      `entreeStrateSchema`, passe les trois valeurs au repository.
- [ ] `apps/web/src/app/pages/admin-strates.ts` :
  - titre « Strates de structure » → « Types de structure ».
  - tableau : colonnes « Jour limite » (`tabular-nums`) et « Régime »
    (District / Site de soins).
  - formulaire d'ajout / édition : champ entier borné 1–28, case « district ».
- [ ] `apps/api/test/admin-strates.test.ts` : `vueStratesSchema.parse` avec les
      nouveaux champs ; un `PUT` qui pose échéance + district et se relit ;
      un `PUT` d'échéance hors bornes rejeté (400).
- [ ] `apps/web` : test de la page si un existe pour `/admin/strates`, sinon
      s'appuyer sur `valider-reponse` / le schéma contrat.
- [ ] `typecheck` + suite API + suite web au vert.
