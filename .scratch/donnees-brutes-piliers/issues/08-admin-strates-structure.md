# 08: Administration des strates de structure

**What to build:** la coordination édite dans la console la correspondance entre
le type de structure brut du référentiel DAP et la strate d'affichage utilisée
par les lectures nationales. Un type de structure sans correspondance tombe dans
une strate « Non classé » explicite.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Nouvelle table `strate_structure` (type de structure → strate), seed
      d'après la liste convenue : CSU et CSR → CS ; ESPC, HG, CHR, CHU → strate
      homonyme ; « District sanitaire » → District. Migration numérotée.
- [ ] `GET /api/admin/strates` (tout rôle authentifié) liste les
      correspondances et les types de structure présents dans `dim_site` sans
      correspondance.
- [ ] `PUT /api/admin/strates/:typeStructure` et `DELETE` (rôle coordination) ;
      un lecteur reçoit 403.
- [ ] Un type de structure sans correspondance est agrégé sous « Non classé »,
      jamais ignoré.
- [ ] Écran `/admin/strates` : tableau éditable, dans le registre des autres
      écrans d'admin.
- [ ] Un changement prend effet à la consultation suivante sans ré-import.
- [ ] Tests : CRUD HTTP avec contrôle de rôle ; comportement « Non classé ».
