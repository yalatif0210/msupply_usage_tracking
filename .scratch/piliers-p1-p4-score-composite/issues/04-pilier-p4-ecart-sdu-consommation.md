# 04: Pilier P4 — écart SDU et écart consommation

**What to build:** la fiche site affiche le pilier P4 avec ses deux
sous-composantes, chacune évaluée en **taux de conformité** (part des produits
traceurs dans la tolérance), pas en amplitude d'écart.

**Écart SDU** : part des produits traceurs dont le stock physiquement compté au
dernier inventaire du mois est dans la tolérance de la quantité théorique
mSupply à cette date — `|théorique − compté| / compté ≤ tolérance`, le compté
(la réalité) au dénominateur. NON_CALCULABLE si aucun produit traceur
inventorié dans le mois.

**Écart consommation** : part des produits traceurs dont la consommation
déclarée (somme des dispensations saisies) est dans la tolérance de la
consommation reconstituée — `|déclarée − reconstituée| / reconstituée ≤
tolérance`. La consommation reconstituée d'un produit = `stock_début +
réceptions − stock_fin` entre le premier et le dernier inventaire finalisé du
mois (les deux inventaires bornants). Un produit sans deux inventaires bornants,
ou dont la reconstituée est ≤ 0, est exclu. NON_CALCULABLE si aucun produit
évaluable.

Chaque sous-composante est CONFORME si son taux atteint le seuil de grille du
pilier, ALERTE sinon. La tolérance par produit et le seuil viennent de la
grille. Le score de pilier P4 est la moyenne simple des scores des deux
sous-composantes calculables.

La grille gagne une colonne de tolérance par sous-composante ; l'écart SDU et
l'écart consommation y sont ajoutés (tolérance par défaut 2 %, seuil par défaut
90 %, sens « atteint ou dépasse » — à confirmer avec la coordination PAQD).

**Blocked by:** 03

**Status:** done (branche piliers-p1-p4-score-composite)

- [x] Une migration numérotée ajoute la colonne de tolérance à la grille de
      seuils de sous-composante et seed l'écart SDU (bascule taux de conformité :
      seuil 90, sens sup, tolérance 2) + l'écart consommation (mêmes valeurs).
      → `db/migrations/0017_vue_p4_ecart.sql`
- [x] Une migration numérotée crée `mv_p4_ecart` : deux sous-composantes en taux
      de conformité, par site et par programme (+ agrégat tous programmes).
- [x] L'écart SDU compare compté et théorique au dernier inventaire du mois,
      compté au dénominateur, produit par produit ; cas limites compté 0.
- [x] L'écart consommation compare déclarée et reconstituée entre les deux
      inventaires bornants ; exclusion des produits sans double inventaire ou à
      reconstituée ≤ 0.
- [x] `@dqa/contracts` : `ecart_consommation` ajouté à `SOUS_COMPOSANTES`,
      `PILIER_DE_SOUS_COMPOSANTE`, `LIBELLES_SOUS_COMPOSANTE`,
      `SOUS_COMPOSANTES_DU_PILIER.P4` (deux sous-composantes).
- [x] Score de pilier P4 = moyenne simple des deux sous-composantes calculables,
      câblé dans `mv_score_pilier` et `rafraichir_et_geler` ; composite recalculé.
- [x] `GET /api/sites/:id` renvoie P4 avec ses deux sous-composantes (valeur,
      seuil, statut) ou NON_CALCULABLE avec raison par sous-composante.
- [x] La fiche site affiche la carte P4 (rendu générique, deux sous-composantes).
- [x] Couture B : SDU juste dans / hors tolérance, cas limites compté 0, panier
      10 produits (9 conformes → 90 %), NON_CALCULABLE sans traceur ; conso
      évaluable/conforme, un seul inventaire → exclu, reconstituée ≤ 0 → exclu,
      moyenne des deux sous-composantes. Couture A : `lecture-indicateurs`
      vérifie P4 + composite bout en bout.

## Comments

- L'agrégat « tous programmes » de `mv_p4_ecart` est construit par `UNION ALL`
  (duplication des lignes avec `prog = NULL`) plutôt que `GROUPING SETS`, parce
  que le dernier inventaire et les bornes doivent être recalculés au grain
  « tous programmes », pas agrégés depuis le grain programme.
- `p_ecart_sdu` garde son nom de colonne historique (migration 0007) bien qu'il
  porte maintenant la moyenne des deux sous-composantes de P4.
- `schema.test.ts` : la grille compte désormais 10 seuils (ajout
  `ecart_consommation`).
