# 09: Onglet national « Rapports & inventaires »

**What to build:** un onglet de la synthèse nationale montre, par strate de
structure, combien de réquisitions (rapports mensuels) et d'inventaires de fin
de mois étaient attendus, ont été réalisés, et l'ont été dans les délais. Les
chiffres se réconcilient avec P1 / P2 : l'attendu est compté par programme géré.

**Blocked by:** 03 (comptes P1 et P2 figés pour tous les sites), 08 (table des
strates)

**Status:** ready-for-agent

- [ ] Nouvelle vue matérialisée agrégeant `hist_pilier_brut` (mesures
      réquisitions et inventaires de P1 et P2) jointe aux strates, par mois,
      région et programme, avec les lignes « toutes régions » / « tous
      programmes ». Rafraîchie par `rafraichir_et_geler`.
- [ ] `GET /api/synthese/rapports?mois=&region=&programmeId=` renvoie, par
      strate : réquisitions attendues / réalisées / à l'heure, et les trois
      mêmes pour les inventaires ; plus une ligne de total. Mois par défaut le
      plus récent. Contrat validé par Zod.
- [ ] La promptitude des inventaires suit la règle P2 (finalisé dans les 3
      derniers jours du mois).
- [ ] Nouvel onglet dans `/synthese`, à côté de « Par pilier » et
      « Sous-composantes » : tableau strate × { réquisitions, inventaires } ×
      { attendu, réalisé, à l'heure }, ligne de total, chiffres en
      `tabular-nums`.
- [ ] Sélecteurs mois / région / programme réutilisés de la synthèse ;
      changer un filtre ne remonte pas la vue, l'état est dans l'URL.
- [ ] Une strate sans site pour le mois n'apparaît pas ; « Non classé »
      apparaît si des sites y tombent.
- [ ] Tests d'intégration : agrégation par strate, réconciliation des totaux
      avec la matière P1 / P2, effet du filtre région (ré-agrégation, pas
      moyenne de moyennes) ; validation de contrat.
