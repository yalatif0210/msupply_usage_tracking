# 05: Statistiques des produits écartés de P4

**What to build:** par site et par mois, le nombre de produits écartés de
l'écart de consommation parce qu'ils manquent à l'un des deux inventaires
(présents à la clôture mais pas à l'ouverture, et l'inverse). Affiché dans la
fiche site (tableau produit P4 · P5) et en colonne de la synthèse nationale, à
titre d'information, sans effet sur le score.

**Blocked by:** 01

**Status:** done

- [x] Comptage par site, mois et sens (absent de l'ouverture, absent de la clôture).
- [x] API et contrat.
- [x] Fiche site : ligne d'information ; synthèse nationale : colonne.
- [x] Tests : un produit absent de l'ouverture, un absent de la clôture, aucun écarté.

## Comments

Décisions prises avec l'utilisateur (2026-11-04) :

- Constat seulement quand le site a ses deux inventaires ; par code produit,
  tous programmes confondus.
- Chaque absence est qualifiée par un calcul sur les mouvements connus :
  absent de l'ouverture, stock minimal = compté clôture + sorties déclarées -
  réceptions (borne basse sûre) : `oubli_demontre` ou `indetermine` ; absent
  de la clôture, stock attendu = compté ouverture + réceptions - sorties
  déclarées (borne haute, pertes non saisies) : `oubli_probable` ou `epuise`.
- Fiche site : la liste des produits avec le calcul ; synthèse par territoire :
  deux colonnes avec le nombre d'oublis.
- Historisé à chaque gel (`hist_produit_ecarte`, migration 0060).
- Un produit absent de la clôture sort de P4 et de P5 : la liste le rend
  visible, conformément à la règle « dénominateur = produits inventoriés ».
