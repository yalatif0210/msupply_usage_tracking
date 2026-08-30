# Tableau de bord DQA mSupply

Suivi de la qualité des données mSupply pour les sites du périmètre DQA en Côte
d'Ivoire. Le tableau de bord sert trois usages simultanés : revue de performance
nationale, triage opérationnel de supervision par district, et reporting de
conformité par cycle PAQD.

## Langage

**Pilier PAQD** :
Un des six axes d'évaluation de la qualité des données, codés P1 à P6, chacun
doté d'un poids fixe dont la somme fait 100 %.
_Éviter_ : composante, axe, dimension, critère

**Sous-composante** :
La grandeur mesurée qui alimente un pilier. Un pilier regroupe une ou plusieurs
sous-composantes (P1 en a trois, P2 et P4 en ont deux, P3/P5/P6 une seule).
Chaque sous-composante a une valeur, un seuil et un statut.
_Éviter_ : indicateur, composante, métrique

**Score de pilier** :
Note sur 100 d'un site pour un pilier, égale à la moyenne simple des scores de
ses sous-composantes calculables (CONFORME = 100, ALERTE = 0 ; une sous-composante
NON_CALCULABLE est exclue de la moyenne). Un pilier n'a pas de statut, seulement
un score.

**Score composite** :
Note sur 100 d'un site pour un mois PAQD, tous programmes confondus, égale à la
somme pondérée de ses scores de pilier. Un pilier dont toutes les sous-composantes
sont NON_CALCULABLE est retiré du calcul et les poids des piliers restants sont
renormalisés à 100 %. C'est la valeur qui classe les sites et qui est historisée.
_Éviter_ : note globale, score DQA, indice

**Score par programme** :
Le score composite d'un site recalculé sur les seules données d'un programme de
santé. Sa moyenne sur les sites du périmètre qui gèrent ce programme donne le
score national du programme.

**Programme de santé** :
Un programme vertical géré par un site (VIH, TB, paludisme, santé de la
reproduction, PEV, gratuité ciblée…). Le nombre de programmes gérés par un site
détermine le nombre d'inventaires et de réquisitions attendus de lui chaque mois.
_Éviter_ : programme, volet, activité

**Cycle PAQD** :
Une période de quatre mois consécutifs sur laquelle la progression d'un site est
suivie. Trois cycles par an, calés sur l'année civile (C1 : janvier–avril, C2 :
mai–août, C3 : septembre–décembre).

**Grille de paramètres** :
Le jeu daté des poids de piliers et des seuils de sous-composantes en vigueur
pour une période donnée. Éditée par la coordination nationale ; une modification
ne vaut que pour les cycles à venir. Chaque score historisé référence la grille
avec laquelle il a été calculé et reste immuable.
_Éviter_ : param_seuil, configuration, barème

**Mois PAQD** :
Le mois calendaire sur lequel porte une extraction et pour lequel les scores sont
calculés, noté M+1 à M+4 selon son rang dans le cycle.
_Éviter_ : période, mois de mesure

**Ajustement d'inventaire (INVAD)** :
Un mouvement de stock, positif ou négatif, créé par un inventaire pour aligner le
stock théorique sur le stock compté. Identifié sans ambiguïté dans mSupply par
les liens `stock_take.invad_additions_id` / `invad_reductions_id`, jamais par un
code de type de transaction.
_Éviter_ : correction, régularisation, `im+` / `im-`

**Classification** :
Rangement d'un site d'après son score composite : CONFORME (≥ 90),
PARTIELLEMENT CONFORME (75–89), NON CONFORME (< 75).
_Éviter_ : statut du site, niveau, catégorie

**Complétude (P1)** :
Part des transactions attendues d'un site qui ont effectivement été saisies, sur
un mois PAQD. Attendu par mois : un inventaire et une réquisition par programme
de santé géré ; une réception par facture fournisseur adressée au site.

**Promptitude (P2)** :
Part des inventaires et réquisitions d'un site réalisés dans les délais
réglementaires. Inventaire : dans les trois derniers jours du mois. Réquisition :
au plus tard le 5 du mois suivant (centres de santé), le 7 (HG, CHR), le 10
(autres structures).

**Produit traceur** :
Un des produits retenus par la mission pour les calculs d'écart (P4) et de
concordance (P5). La liste est administrée dans la console web par la
coordination, pas dérivée de mSupply.
_Éviter_ : produit suivi, produit critique

**Écart SDU (P4)** :
Amplitude de l'écart, à la date d'un inventaire, entre le stock physiquement
compté et la quantité théorique mSupply, moyennée sur les produits traceurs :
`|compté − théorique| / théorique`. Conforme sous le seuil de la grille.

**Écart consommation (P4)** :
Amplitude de l'écart, sur un mois PAQD, entre la consommation *déclarée* (somme
des dispensations saisies) et la consommation *reconstituée* à partir du
mouvement de stock entre les **deux inventaires bornant le mois** (premier et
dernier inventaire finalisé) : `stock_début + réceptions − stock_fin`. Conforme
sous le seuil de la grille. NON_CALCULABLE sans deux inventaires bornants ou si
la consommation reconstituée est nulle.
_Éviter_ : écart SDU (réservé à la sous-composante ci-dessus)

**Concordance physique / théorique (P5)** :
Rapport moyen entre stock compté et stock théorique au dernier inventaire du
mois, sur les produits traceurs. Statut binaire selon le seuil de la grille.

**Réquisition** :
Une commande mensuelle de réapprovisionnement, par programme, adressée par un
site à son fournisseur. Elle couvre un mois M (celui de son inventaire de
référence de fin de mois) et doit être soumise au plus tard le 5, 7 ou 10 du
mois M+1 selon le type de structure. Comptée pour M, jamais pour M+1.

**Régularité de saisie (P3)** :
Part des jours ouvrables du mois où le site a enregistré au moins une sortie de
stock. « Sortie de stock » = une dispensation pour un site de dispensation, une
distribution vers un site rattaché pour un district.

**Statut d'une sous-composante** :
Binaire : CONFORME si le seuil du pilier est atteint, ALERTE sinon. Ou
NON_CALCULABLE quand les données sont insuffisantes — exclu des agrégats, jamais
rendu par un zéro. Il n'y a pas d'état intermédiaire au niveau sous-composante.
_Éviter_ : statut d'indicateur, PARTIEL, état, résultat

**Périmètre DQA** :
L'ensemble des sites sanitaires retenus pour la mission (40 à ce jour), déclaré
par la DAP dans l'extraction. Seuls ces sites entrent dans les scores nationaux.
_Éviter_ : sites suivis, sites cibles

**Coordination** :
Rôle de la coordination nationale dans l'application : consulte tous les écrans,
déclenche les imports, édite la grille de paramètres. Le rôle `lecteur` (équipes
district, DAP) consulte seulement ; le rôle `admin` gère les comptes sans toucher
aux données.

**Les six piliers** (libellés et seuils de `CLAUDE.md` §5, faisant autorité) :

| Code | Pilier | Poids | Sous-composantes |
|------|--------|-------|------------------|
| P1 | Complétude des transactions | 10 % | complétude des inventaires, des réquisitions, des réceptions |
| P2 | Promptitude des transactions | 15 % | promptitude des inventaires, des réquisitions |
| P3 | Régularité de saisie (dispensation) | 15 % | régularité de saisie |
| P4 | Écart SDU produits traceurs | 25 % | écart SDU, écart consommation |
| P5 | Concordance physique / théorique | 25 % | concordance |
| P6 | Ratio d'ajustements | 10 % | ratio d'ajustements |
