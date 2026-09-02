# 02: Garde de conventions de source élargie

**What to build:** un test de garde échoue si une couleur en dur ou une valeur
Tailwind arbitraire réapparaît dans un composant, en plus de la garde
anti-tiret existante. La garde protège toute la migration qui suit.

**Blocked by:** 01

**Status:** done (fusionné dans master)

- [x] `typographie.test.ts` renommé `conventions-source.test.ts`, même
      mécanique de scan récursif de `apps/web/src` et même style de rapport.
- [x] Assertion 1 conservée : aucun tiret long (`—` `–` `−`).
- [x] Assertion 2 : aucune valeur Tailwind arbitraire dans un template
      (attribut `class` contenant `-[...]`, ex. `bg-[#123456]`, `w-[13px]`).
- [x] Assertion 3 : aucun littéral hex (`#rrggbb`) ni `oklch(` dans le bloc
      `styles` d'un composant Angular.
- [x] Liste d'exceptions explicite, chaque entrée justifiée par un commentaire
      (les composants Helm copiés peuvent en réclamer ponctuellement).
- [x] Verte sur l'arbre courant ; échoue sur une violation plantée pour
      chacune des trois assertions.
