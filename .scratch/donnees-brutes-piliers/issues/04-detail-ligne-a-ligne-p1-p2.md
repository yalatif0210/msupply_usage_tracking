# 04: Détail ligne à ligne des piliers P1 et P2

**What to build:** sous la carte d'un pilier, un dépliant montre le détail
transaction par transaction qui compose le taux, lu en direct du core. Ce
ticket établit la route générique de détail par pilier et la traite pour P1 et
P2 ; P3/P6 suivent au ticket 05, P4/P5 au ticket 06.

**Blocked by:** 02 (comptes bruts figés + avertissement ré-import)

**Status:** done (branche donnees-brutes-piliers)

- [ ] Route `GET /api/sites/:id/piliers/:code` (code P1 à P6). Réponse
      `DetailPilier`, union discriminée sur le code ; variantes P1 et P2
      livrées. Contrat dans `@dqa/contracts`, validé par Zod.
- [ ] Chaque réponse porte les comptes bruts figés du pilier, l'horodatage de
      calcul et l'horodatage de dernière modification du core pour ce site /
      mois.
- [ ] P1 : liste des inventaires finalisés du mois (date, programme), liste des
      réquisitions (programme, mois couvert), liste des réceptions et des
      factures fournisseur (date, référence). Manques signalés.
- [ ] P2 : chaque inventaire finalisé avec sa date et « dans les 3 derniers
      jours du mois O/N » ; chaque réquisition avec date de soumission, date
      limite et « à l'heure O/N ».
- [ ] Sur la fiche site, un `<details>` par pilier rend ces listes, cas
      fautifs en tête, conformes ensuite.
- [ ] Quand le core a été ré-importé après le gel du mois consulté, un
      avertissement visible signale que le détail live peut différer des
      comptes figés.
- [ ] Le détail se charge au dépli, pas au chargement de la fiche.
- [ ] Changer le mois ou un filtre ne remonte pas la vue (via `core/ressource`).
- [ ] Tests : lectures repository pour P1 et P2 (base éphémère) ; validation de
      l'union discriminée sur des réponses réelles.
