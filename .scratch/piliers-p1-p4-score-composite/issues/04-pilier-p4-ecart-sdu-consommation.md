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

**Status:** ready-for-agent

- [ ] Une migration numérotée ajoute la colonne de tolérance à la grille de
      seuils de sous-composante et seed l'écart SDU + l'écart consommation avec
      les valeurs par défaut.
- [ ] Une migration numérotée crée la vue matérialisée de P4 : deux
      sous-composantes en taux de conformité, par site et par programme.
- [ ] L'écart SDU compare compté et théorique au dernier inventaire du mois,
      compté au dénominateur.
- [ ] L'écart consommation compare consommation déclarée et reconstituée entre
      les deux inventaires bornants ; exclusion des produits sans double
      inventaire ou à reconstituée ≤ 0.
- [ ] Le contrat partagé ajoute la sous-composante écart consommation ; P4
      compte désormais deux sous-composantes.
- [ ] Le score de pilier P4 est câblé dans la vue de score de pilier et la
      procédure de rafraîchissement ; le composite se recalcule avec P4.
- [ ] `GET /api/sites/:id` renvoie P4 avec ses deux sous-composantes ou
      NON_CALCULABLE avec raison.
- [ ] La fiche site affiche la carte P4 avec ses deux sous-composantes.
- [ ] Couture B : un test par sous-composante — produit juste dans / juste hors
      tolérance, produit exclu (pas de double inventaire, reconstituée ≤ 0),
      aucun produit traceur → NON_CALCULABLE, taux au-dessus / en dessous du
      seuil. Couture A : bout en bout, un import produit un score P4 visible.
