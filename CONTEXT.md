# SUM · Suivi de l'Utilisation de mSupply

Anciennement « Tableau de bord DQA ». Suivi de l'utilisation et de la qualité des données mSupply pour les sites du périmètre DQA en Côte
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

**Valeur de sous-composante gelée** :
La valeur mesurée d'une sous-composante, figée mois par mois dans
`hist_score_site` (colonnes `sc_*`), au même titre que les scores de pilier
(ADR 0007). Une valeur gelée ne change jamais, même si la règle de calcul
évolue ensuite. Le seuil et le statut ne sont pas figés : ils se déduisent de
la valeur et de la grille du mois.

**Compte brut** :
Le couple attendu / réalisé — et, quand la sous-composante porte un délai,
réalisé à l'heure — qui produit le taux d'une sous-composante (« P1 réceptions :
3 factures acceptées dans leur mois d'émission sur 5 »). Figé mois par mois dans `hist_pilier_brut`, au
même titre que la valeur de sous-composante gelée, et réconcilié avec elle. Le
détail transaction par transaction derrière un compte brut n'est pas figé : il
est lu en direct du core, avec un avertissement si le core a été ré-importé
après le gel.
_Éviter_ : donnée source, chiffre brut, numérateur

**Rapport mensuel** :
Synonyme de réquisition (le formulaire « Report & Requisition » de mSupply). La
complétude et la promptitude des rapports d'un ensemble de sites se lisent au
niveau national, stratifiées par strate de structure, en parallèle des mêmes
mesures sur les inventaires de fin de mois.
_Éviter_ : rapport d'activité, reporting

**Taux d'atteinte du seuil** :
Note sur 100 qui dit à quel point une sous-composante approche (ou dépasse) son
seuil, sur une échelle commune aux dix. Sens-conscient : pour un seuil
plancher, `valeur / seuil` borné à 100 ; pour un seuil plafond (ratio
d'ajustements), `seuil / valeur` borné à 100 ; pour les deux sous-composantes
de P4, la valeur gelée est déjà un taux de conformité, reprise telle quelle.
`null` si la valeur ou le seuil manque. Non figé : déduit d'une valeur gelée
et d'un seuil retrouvable, servi par la vue `v_sous_composante_atteinte`.
Sert d'axe commun aux radars et aux courbes fines de la fiche site.
_Éviter_ : score de sous-composante (binaire, réservé au calcul du pilier)

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
Une période de quatre mois consécutifs. Trois cycles par an, calés sur l'année
civile (C1 : janvier–avril, C2 : mai–août, C3 : septembre–décembre). C'est le
préréglage par défaut pour suivre la progression d'un site, mais plus la seule
fenêtre : la fiche site accepte une plage de mois libre (`de`/`a`), qui peut
traverser plusieurs cycles.

**Grille de paramètres** :
Le jeu daté des poids de piliers, des seuils de sous-composantes et — pour les
sous-composantes évaluées par taux de conformité (conformité SDU, conformité consommation)
— de la tolérance par produit. Éditée par la coordination nationale ; une
modification ne vaut que pour les cycles à venir. Chaque score historisé
référence la grille avec laquelle il a été calculé et reste immuable.
_Éviter_ : param_seuil, configuration, barème

**Mois PAQD** :
Le mois calendaire sur lequel porte une extraction et pour lequel les scores sont
calculés, noté M+1 à M+4 selon son rang dans le cycle.
_Éviter_ : période, mois de mesure

**Mois clos / mois en cours** :
Un mois PAQD est **clos** une fois passée l'échéance de réquisition la plus
tardive du référentiel des structures (par défaut le 10 de M+1) : plus aucune
soumission ne peut arriver « à l'heure », le score gelé devient définitif.
Avant cette date le mois est **en cours** : son score reste **provisoire**
(repère à l'écran, segment de courbe en pointillé). Fonction `dqa.mois_est_clos`.
Discriminant de plusieurs règles : P4 et P5 valent 0 % pour un site sans
inventaire seulement une fois le mois clos, NON_CALCULABLE tant qu'il est en
cours (l'échéance n'est pas arrivée).
_Éviter_ : mois terminé, mois figé

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
un mois PAQD M. Deux sous-composantes (ADR 0019) : une réquisition couvrant M
par programme éligible ; et l'acceptation des factures qui répondent aux
réquisitions ordinaires du mois précédent (complétude des réceptions).
L'inventaire n'y figure plus : il est mesuré par la promptitude (P2) et par
P4 / P5.

**Réception** :
Une facture fournisseur `si` finalisée (statut `fn`) : la réception est admise
à la date de finalisation (ADR 0018). Une facture `nw` (adressée au site) ou
`cn` (confirmée) n'est pas encore une réception. Seule une facture finalisée
dans son **mois d'émission** compte pour la complétude des réceptions. Mois
d'émission : celui de la livraison du district qui a produit la facture, à
défaut celui de la création de la facture (site livré par la NPSP).
_Éviter_ : `rc`, reçu, bon de réception

**Encaissement** :
Un reçu de paiement mSupply (type `rc`, « Reçu pour facture(s) … »), sans
produit. Il n'entre dans aucun pilier (ADR 0018).
_Éviter_ : réception

**Programme éligible** :
Programme rattaché à un site (SITE_PROGRAMME) et actif : seul un programme
éligible attend une réquisition (P1, P2) et un inventaire (P2). Le statut se
règle dans la console (écran « Programmes ») ; un import ne revient jamais sur
un choix de la coordination (ADR 0020).
_Éviter_ : programme géré (quand il s'agit du statut administré)

**Échéance** :
Date après laquelle l'absence d'une transaction attendue compte 0 :
jour limite du mois suivant pour une réquisition, dernier jour du mois pour
l'inventaire de fin de mois. Avant l'échéance, la sous-composante est non
calculable, jamais 0 (ADR 0019). La complétude des réceptions fait exception :
elle se suit en continu pendant le mois, comme un signal d'action.

**Promptitude (P2)** :
Part des inventaires et réquisitions d'un site réalisés dans les délais
réglementaires. Inventaire : dans les trois derniers jours du mois. Réquisition :
au plus tard le 5 du mois suivant (centres de santé), le 7 (HG, CHR), le 10
(autres structures).

**Produit traceur** :
Un des produits retenus par la mission pour les calculs d'écart (P4) et de
concordance (P5). La liste est tenue dans le script d'extraction de la DAP ;
tout produit de l'onglet PRODUITS d'un import est traceur d'office, un produit
absent du dernier lot devient inactif (ADR 0015). Un code peut couvrir
plusieurs **articles** mSupply : il compte une fois dans les taux P4 et P5,
conforme seulement si tous ses articles le sont (ADR 0016).

**Article** :
Un enregistrement `item` de mSupply. Deux articles peuvent porter le même code
produit (même médicament enregistré deux fois). Les calculs se font par
article, les taux par code.
_Éviter_ : produit (quand on parle de l'enregistrement mSupply)

**Inventaire retenu** :
Pour un site, un jour et un produit, le seul inventaire qui compte quand
plusieurs ont été finalisés : le dernier finalisé (heure, puis numéro mSupply).
Par programme, le dernier du programme ; tous programmes, le dernier tous
programmes confondus.
_Éviter_ : produit suivi, produit critique

**Taux de conformité (P4)** :
Libellé du pilier P4 sur les écrans et dans `CLAUDE.md` §5 : ses deux
sous-composantes (conformité SDU, conformité consommation) sont des taux de
conformité, pas des amplitudes d'écart. Lecture : avec la grille par défaut,
un produit est conforme si son écart tient dans 2 %, et la sous-composante est
CONFORME si au moins 90 % des traceurs le sont (« ≥ 90 · tolérance 2 % »). Les
termes internes `ecart_sdu` / `ecart_consommation` (enum, contrats, base)
restent inchangés ; « écart » ne désigne plus à l'écran que l'écart d'un
produit (tableau produit de la fiche site, fiche produit).

**Conformité SDU (P4)** :
Part des produits traceurs dont le stock physiquement compté au dernier
inventaire du mois est **dans la tolérance** de la quantité théorique mSupply :
`|théorique − compté| / compté ≤ tolérance` (le compté, la réalité, au
dénominateur). Statut CONFORME si ce taux atteint le seuil de la grille.
Tolérance et seuil viennent de la grille. Si le site n'a aucun inventaire
finalisé daté dans le mois : **0 %** (ALERTE) une fois le mois clos (ne pas
inventorier est alors un manquement), **NON_CALCULABLE** tant qu'il est en
cours (l'inventaire de fin de mois n'est pas encore dû).

**Conformité consommation (P4)** :
Part des produits traceurs dont la consommation *déclarée* (somme des
dispensations saisies ; pour un district, somme des **quantités distribuées**)
est dans la tolérance de la consommation *reconstituée* :
`|déclarée − reconstituée| / reconstituée ≤ tolérance`. La consommation
reconstituée d'un produit = `stock ouverture + réceptions − stock clôture` entre
deux inventaires bornants : **ouverture** = dernier inventaire finalisé du mois
**M-1** (le stock de clôture de M-1 est le stock d'entrée de M) ; **clôture** =
dernier inventaire finalisé du mois M. À défaut d'inventaire en M-1, on retombe
sur le premier et le dernier inventaire de M (s'il y en a deux). Un produit sans
borne d'ouverture exploitable ou dont la reconstituée est ≤ 0 est exclu. Sans
aucune borne d'ouverture exploitable pour le site : **0 %** (ALERTE) si le mois
est clos, **NON_CALCULABLE** s'il est en cours. NON_CALCULABLE aussi si des
bornes existent mais qu'aucune reconstituée n'est positive.
_Éviter_ : écart SDU, écart consommation (pour la sous-composante : c'est un taux, pas un écart)

**Conformité distribution (P4)** :
Nom que prend la conformité consommation pour un district : mêmes bornes, même
reconstruction, mais la consommation déclarée est la somme des quantités
distribuées (et non dispensées). Un district ne dispense pas.

**Concordance physique / théorique (P5)** :
Rapport moyen entre stock compté et stock théorique au dernier inventaire du
mois, sur les produits traceurs. Statut binaire selon le seuil de la grille.
Si le site n'a aucun inventaire finalisé daté dans le mois : **0 %** (ALERTE)
une fois le mois clos, **NON_CALCULABLE** tant qu'il est en cours. P5 n'ayant
qu'une sous-composante, le pilier entier suit.

**Réquisition** :
Une commande mensuelle de réapprovisionnement, par programme, adressée par un
site à son fournisseur. Elle couvre un mois M (celui de son inventaire de
référence de fin de mois) et doit être soumise au plus tard le 5, 7 ou 10 du
mois M+1 selon le type de structure. Comptée pour M, jamais pour M+1. Aussi
appelée **rapport** : les deux termes désignent le même objet (voir *Rapport
mensuel*). C'est la réquisition du site lui-même (`request` dans mSupply).

**Réquisition de réponse** :
La copie de travail que mSupply crée chez le fournisseur (district) quand un
site lui adresse une réquisition (`response`, liée à la demande par
`linked_requisition_id`). Elle appartient au fournisseur mais n'est pas une
réquisition qu'il a soumise : exclue de l'extraction, elle sert seulement à
relier la distribution du district à la demande du site.
_Éviter_ : réquisition du district (pour désigner une réponse)

**Régularité de saisie (P3)** :
Part des jours du mois où le site a enregistré au moins une sortie de stock
(dispensation ou distribution). Aucun jour n'est retranché : en milieu
hospitalier la dispensation a lieu 7 j/7, le PAQD ne défalque ni week-ends ni
jours fériés.
**Compteur au fil de l'eau, borné au mois** : le dénominateur croît jour après
jour et plafonne au dernier jour du mois ; un mois en cours est mesuré sur les
jours écoulés, un mois clos sur tous ses jours. **Toujours calculable** pour un
site de soins : aucune sortie sur les jours écoulés vaut 0 %, jamais
NON_CALCULABLE (un hôpital qui ne dispense rien est un signal, pas une absence
de données). Pour un **district**, qui ne dispense pas, P3 mesure autre chose
(voir *Régularité de saisie — district*).

**Régularité de saisie — district (P3)** :
Pour un district (`est_district`, voir *Régime de scoring*), P3 mesure sa
capacité à honorer les réquisitions de sa zone : réquisitions DISTINCTES de la
zone couvrant M-1,
servies dans M par une distribution du district, sur le total de ces
réquisitions. Seuil ≥ 80 %. NON_CALCULABLE si aucune réquisition de zone à
évaluer (ADR 0011).

**Statut d'une sous-composante** :
Binaire : CONFORME si le seuil du pilier est atteint, ALERTE sinon. Ou
NON_CALCULABLE quand les données ne permettent pas de trancher — exclu des
agrégats. Sur un **mois clos**, le silence d'un site attendu actif (aucune
sortie, aucun inventaire de fin de mois) est rendu par un **0 %** ALERTE, pas
par NON_CALCULABLE. Sur un **mois en cours**, une échéance non encore arrivée
(inventaire ou réquisition de fin de mois) reste NON_CALCULABLE : pas de
pénalité pour un retard qui n'existe pas encore. Il n'y a pas d'état
intermédiaire au niveau sous-composante.
_Éviter_ : statut d'indicateur, PARTIEL, état, résultat

**Périmètre DQA** :
L'ensemble des sites sanitaires retenus pour la mission (40 à ce jour), déclaré
par la DAP dans l'extraction. Seuls ces sites entrent dans les scores nationaux.
_Éviter_ : sites suivis, sites cibles

**Type de structure** :
Le `name_category3.description` d'un site dans mSupply — le palier de la
pyramide sanitaire, pas le sous-type. Le référentiel réel n'a que trois valeurs
présentes (`District sanitaire`, `Hôpital de référence`, `ESPC`) ; `CHU` et
`INSTITUT` sont prêts. Le sous-type (CSU vs CSR, CHR vs HG) n'est pas un champ :
il vit dans `site_nom` et l'infixe de `site_code`.
Chaque `type_structure` est administré dans la console (écran « Types de
structure », table `strate_structure`, ADR 0013) et porte trois attributs :
la **strate** d'affichage, le **jour limite** de soumission d'une réquisition
et le **régime de scoring** (`est_district`). Un `type_structure` non mappé
tombe dans « Non classé » / échéance 10 / site de soins (jamais ignoré). Édité
comme les traceurs ou la grille : une valeur nouvelle se rattache sans
migration, non historisé (effet au rafraîchissement suivant).
_Éviter_ : catégorie de site, niveau, type d'établissement (réservé à la valeur brute), strate de structure (la strate n'est qu'un des trois attributs)

**Strate** :
Un des trois attributs d'un *type de structure* : le regroupement d'affichage
des lectures nationales « rapports & inventaires ». Distincte de la valeur
brute `type_structure` et du *régime de scoring*.

**Régime de scoring** :
Booléen `est_district` porté par le référentiel des *types de structure*. Un
district (`est_district = true`) mesure P3 sur les réquisitions de sa zone
servies et P4 sur les quantités distribuées ; un site de soins mesure P3 sur
ses dispensations et P4 sur sa consommation. Seule différence de calcul entre
les deux. Repli : site de soins.
_Éviter_ : type de site district (le régime, pas le type)

**Coordination** :
Rôle de la coordination nationale dans l'application : consulte tous les écrans,
déclenche les imports, édite la grille de paramètres. Le rôle `lecteur` (équipes
district, DAP) consulte seulement ; le rôle `admin` gère les comptes sans toucher
aux données.

**Les six piliers** (libellés et seuils de `CLAUDE.md` §5, faisant autorité) :

| Code | Pilier | Poids | Sous-composantes |
|------|--------|-------|------------------|
| P1 | Complétude des transactions | 10 % | complétude des réquisitions, des réceptions |
| P2 | Promptitude des transactions | 15 % | promptitude des inventaires, des réquisitions |
| P3 | Régularité de saisie (dispensation) | 15 % | régularité de saisie |
| P4 | Taux de conformité | 25 % | conformité SDU, conformité consommation |
| P5 | Concordance physique / théorique | 25 % | concordance |
| P6 | Ratio d'ajustements | 10 % | ratio d'ajustements |
