# 07: Pas de note avant l'échéance

**What to build:** une sous-composante dont l'échéance n'est pas arrivée est
non calculable, et non 0 : réquisitions (P1, P2 ; échéance au jour limite de
M+1) et inventaire de P2 (échéance à la fin du mois).

**Blocked by:** 06

**Status:** done

- [x] Règle appliquée par sous-composante, sur le modèle de `mois_est_clos`.
- [x] Exception : complétude des réceptions suivie en continu (ADR 0019).
- [x] Tests : mois en cours avec inventaire du 10 → promptitude d'inventaire
  non calculable ; mois clos sans inventaire → 0.
