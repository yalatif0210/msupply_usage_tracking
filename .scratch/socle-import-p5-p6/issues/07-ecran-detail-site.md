# 07: Écran détail site (P5/P6) + API de lecture + filtre programme

**What to build:** Un `lecteur` connecté ouvre la page d'un site et voit, pour
le dernier mois PAQD mesuré, les piliers P5 et P6 — chacun avec sa
sous-composante, la valeur mesurée, le seuil de référence, et un badge de statut
binaire (ou NON_CALCULABLE avec sa raison). Il peut passer à un mois PAQD
antérieur et filtrer par un programme que le site gère. Aucun score composite
n'est affiché ; la page indique « 2 piliers sur 6 couverts ». Si aucun import
n'a tourné, la page montre un état vide explicite. Une liste des sites est
accessible, filtrable par district / région / programme. Le front rejette toute
réponse API non conforme au contrat plutôt que d'afficher `undefined`.

**Blocked by:** 03, 06

**Status:** ready-for-agent

- [ ] `GET` détail site renvoie un `DetailSite` restreint (P5, P6 uniquement) validé par le schéma Zod du contrat ; `GET` liste des sites supporte les filtres district / région / programme ; endpoints référentiels programmes et districts. Tout exige une session `lecteur`.
- [ ] L'écran de détail rend les piliers P5 et P6 avec sous-composante, valeur, seuil, badge de statut, et raison si NON_CALCULABLE.
- [ ] Un sélecteur de mois et un sélecteur de programme changent les chiffres affichés.
- [ ] Aucun score composite nulle part sur l'écran ; « 2 piliers sur 6 » est affiché.
- [ ] État vide explicite quand le site n'a pas d'historique gelé.
- [ ] Les services HTTP typés valident les réponses contre le contrat et lèvent sur non-conformité (couture D).
- [ ] La mise en page est lisible en projection (contrastes francs, chiffres généreux) selon `DESIGN_SYSTEM.md`.
- [ ] Tests : couture A (gel de l'historique via import → appels des endpoints → assertions) + couture D.
