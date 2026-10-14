# Les quantités mSupply sont en unités : aucune conversion par le conditionnement

**Statut.** Accepté.

**Contexte.** Le tableau de bord multipliait la quantité d'une ligne de
transaction par sa taille de conditionnement (`quantite_unitaire = quantite ×
taille_conditionnement`), et le script d'extraction multipliait le théorique
d'inventaire par `snapshot_packsize`. L'audit du 2026-10-13 a d'abord étendu
cette conversion au compté et au stock disponible, en supposant que mSupply
compte en conditionnements. La base de la DAP contient pourtant des
conditionnements supérieurs à 1 (8 457 lignes d'inventaire, 952 lignes de
stock, 13 238 lignes de transaction), et le fichier du 2026-10-12 montrait 9
lignes où le théorique valait exactement 2 à 20 fois le compté.

**Décision.** En Côte d'Ivoire, mSupply enregistre toutes les quantités en
unités de dispensation : un AL 20/120 en boîte de 12 se compte en plaquettes
(confirmation de la coordination, 2026-10-13). Aucune quantité n'est
multipliée par un conditionnement, ni à l'extraction (théorique, compté,
stock disponible) ni dans le tableau de bord (`quantite_unitaire = quantite`).
`taille_conditionnement` reste transmise et stockée, à titre d'information.

**Pourquoi.** Multiplier une quantité déjà en unités gonfle les stocks et les
mouvements de tout produit conditionné par plus d'une unité, et fausse P4,
P5 et P6. Les 9 lignes du 2026-10-12 s'expliquent par la seule multiplication
du théorique.

**Conséquences.** Un futur contributeur ne doit pas « corriger » l'absence de
conversion : elle est délibérée. Si un pays déployait mSupply en comptant par
conditionnement, la règle serait à revoir ici et dans le script d'extraction.
