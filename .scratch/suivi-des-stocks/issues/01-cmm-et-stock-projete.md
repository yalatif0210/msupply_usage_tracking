# 01: CMM et stock projeté par site et produit, menu « Suivi des stocks »

**What to build:** un nouveau menu « Suivi des stocks » qui liste, site par
site puis programme puis produit traceur, la CMM reconstituée, la CMM
déclarée, le nombre de mois couverts, les deux inventaires bornants, le stock
projeté à la date de référence, la couverture en jours et la date de rupture
prévue, à une date t choisie (par défaut la fin de fenêtre du dernier
import). Un couple sans CMM calculable affiche sa raison.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Fonction SQL `dqa.stocks_a_date(t)` au grain site × produit traceur, calcul « comme si l'on était à t » (données postérieures à t ignorées) : bornes (4e inventaire en remontant, à défaut le plus ancien dans les 90 jours), CMM reconstituée et déclarée en jours réels, nombre de mois, raison de non-calcul, stock projeté à t (plancher 0), rupture prévue, couverture, programme parent.
- [x] Date t choisie à l'écran (sélecteur dans l'URL), par défaut la fin de fenêtre du dernier import validé.
- [x] API et contrat : liste filtrable (région, district, site, programme), servie dans l'ordre site, programme, produit.
- [x] Écran : entrée de menu, tableau site, programme, produit dépliable, style des tableaux produit, filtres dans l'URL sans démonter la vue.
- [x] Tests : bornes (4e inventaire, historique court, un seul inventaire), CMM chiffrées à la main, sorties ≤ 0, réception après la borne de fin, plancher 0, date t passée (inventaire et réception postérieurs ignorés), district (distributions), programme parent.
- [x] Guide de module `docs/guide_module_stocks.md`, glossaire (CMM reconstituée, CMM déclarée, stock projeté, rupture prévue, couverture).
