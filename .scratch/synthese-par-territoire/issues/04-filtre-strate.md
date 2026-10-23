# 04: Filtre de strate sur les lectures par territoire

**What to build:** un filtre de strate (par exemple « ESPC ») sur les deux
lectures par territoire : seuls les sites de cette strate entrent dans les
comptes, les taux et les scores de chaque niveau.

**Blocked by:** 02, 03

**Status:** done

- [x] Dimension strate dans les vues de synthèse par territoire (NULL =
  toutes).
- [x] API et contrat : paramètre `strate` ; liste des strates disponibles.
- [x] Front : sélecteur de strate, reflété dans l'URL, sans démonter la vue.
- [x] Tests : une région filtrée sur « ESPC » ne compte que ses ESPC ; une
  zone sans ESPC disparaît de la lecture filtrée.
- [x] Manuel utilisateur, guide du module Indicateurs à jour (lecture par
  territoire, filtres, « non renseigné »).
