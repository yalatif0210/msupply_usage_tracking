# 05: Statut fn et réceptions effectives dans les calculs

**What to build:** seules les transactions finalisées comptent ; P4
consommation compte comme entrées de stock les factures `si` réceptionnées
(ADR 0018).

**Blocked by:** 03

**Status:** done

- [x] Filtre statut `fn` dans P3, P4, P6 (et P1 hors dénominateur des
  réceptions).
- [x] P4 : entrées de stock = lignes des `si` `fn` hors ajustements, datées
  de leur finalisation ; `rc` jamais compté.
- [x] Recalcul indépendant de l'audit transformé en test : sur septembre, les
  conformes consommation suivent la nouvelle règle.
- [x] Tests : dispensation `cn` ignorée par P3 ; entrée `si` `fn` comptée,
  `si` `cn` non comptée, `rc` ignoré.
