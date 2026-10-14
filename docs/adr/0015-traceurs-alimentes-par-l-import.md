# La liste des traceurs vient du script d'extraction, via l'import

**Statut.** Accepté. Remplace l'ADR 0005 pour la liste des produits traceurs
(la grille de paramètres reste administrée dans la console).

**Contexte.** L'ADR 0005 faisait administrer les traceurs dans la console
(`/admin/traceurs`) et faisait envoyer par la DAP **tous** les produits
mSupply, sans marquage. En pratique, la liste vit déjà dans le script
d'extraction (`tmp_traceurs`), qui s'en sert pour filtrer les mouvements, le
stock et les inventaires. Deux listes tenues à deux endroits divergeaient
fatalement : un produit filtré à l'extraction mais absent de la console (ou
l'inverse) faussait P4 et P5 sans le moindre message. Et l'onglet PRODUITS
pesait 5449 lignes pour 13 produits utiles.

**Décision.**

- Le script d'extraction fait foi. L'onglet PRODUITS ne contient que les
  produits de `tmp_traceurs` ; **tout produit de cet onglet est traceur
  d'office**.
- À chaque import, la promotion met `dim_produit_traceur` à jour : les produits
  du lot sont actifs (libellé repris de `produit_nom`), ceux qui n'y figurent
  plus passent inactifs. Ils restent en base pour la trace des anciens paniers.
- Un lot dont l'onglet PRODUITS est vide ne touche pas à la liste.
- `/admin/traceurs` devient une page de consultation ; l'API n'expose plus que
  la lecture.

**Pourquoi.** Une seule source, celle qui filtre réellement les données. Un
changement de panier se fait à un seul endroit (le script), et le tableau de
bord le reflète au premier import suivant.

**Conséquences.**

- Un fichier produit avec l'ancien script (tous les produits dans PRODUITS)
  rendrait traceurs tous les produits mSupply. Les fichiers antérieurs à ce
  changement doivent être régénérés avant import.
- Le dernier lot reçu fait foi pour la liste, y compris un lot de rattrapage.
- La révision du panier redevient un aller-retour avec la DAP, ce que l'ADR
  0005 voulait éviter : accepté, parce que la DAP devait de toute façon
  modifier son filtre.
