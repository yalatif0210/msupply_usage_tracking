# 07: Fiche produit-mois

**What to build:** un écran dédié, à URL partageable, montre toutes les
grandeurs brutes d'un produit traceur pour un site et un mois : le stock
théorique et physique à chaque inventaire, le stock disponible à chaque photo,
les réceptions, les dispensations, les ajustements, et la consommation
reconstituée vs déclarée. C'est le point d'entrée « données brutes d'un
produit », transversal aux piliers P3, P4, P5, P6.

**Blocked by:** 06 (le tableau produit d'où part le lien)

**Status:** ready-for-agent

- [ ] `GET /api/sites/:id/produits/:code?mois=` renvoie `FicheProduitMois` ;
      404 si le code n'est pas un produit traceur. Contrat validé par Zod.
- [ ] La réponse porte : inventaires du mois (date, stock théorique mSupply,
      stock physique compté, écart) ; photos de stock du mois (date, stock
      disponible) ; réceptions (date, quantité) ; dispensations (total et
      nombre de jours) ; ajustements (date, quantité, sens) ; consommation
      reconstituée, consommation déclarée et leur écart ; stock des deux
      inventaires bornants ; horodatages de calcul et de dernière modification
      du core.
- [ ] Route web `/sites/:id/produits/:code?mois=` avec un sélecteur de mois
      parmi les mois disponibles du site ; l'état est reflété dans l'URL sans
      remontage.
- [ ] Un bouton ou fil d'Ariane ramène à la fiche site.
- [ ] Avertissement visible si le core a été ré-importé après le gel du mois.
- [ ] Toutes les grandeurs en `tabular-nums`, légendes complètes.
- [ ] Tests : lecture repository (base éphémère, core fabriqué à la main) sur un
      produit avec inventaires bornants et un produit sans ; 404 sur un non
      traceur ; validation de contrat.
