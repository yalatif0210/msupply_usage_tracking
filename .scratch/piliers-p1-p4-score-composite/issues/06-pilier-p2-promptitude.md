# 06: Pilier P2 — promptitude des transactions

**What to build:** la fiche site affiche le pilier P2, promptitude des
transactions, avec ses deux sous-composantes : promptitude des inventaires,
promptitude des réquisitions. Chacune est la part des transactions du site
réalisées dans les délais réglementaires.

- Promptitude des inventaires : un inventaire est à l'heure s'il est réalisé
  dans les trois derniers jours du mois. Sous-composante = inventaires à
  l'heure ÷ inventaires saisis.
- Promptitude des réquisitions : une réquisition est à l'heure si elle est
  soumise au plus tard le 5 du mois suivant pour les centres de santé (CSU,
  CSR, ESPC), le 7 pour HG et CHR, le 10 pour les autres structures. Le seuil
  de date dépend du type de structure du site. Sous-composante = réquisitions à
  l'heure ÷ réquisitions couvrant le mois.

Chaque sous-composante est CONFORME si le taux atteint le seuil de grille du
pilier, ALERTE sinon. NON_CALCULABLE si aucune transaction de la catégorie sur
le mois. Le score de pilier P2 est la moyenne simple des scores des
sous-composantes calculables. Câblé dans la vue de score de pilier et figé au
rafraîchissement.

Après ce ticket, les six piliers sont mesurés : le score composite se calcule
sur six piliers, et la mention « calculé sur N piliers sur 6 » n'apparaît plus
que pour les sites aux données incomplètes.

**Blocked by:** 01, 05

**Status:** ready-for-agent

- [ ] Une migration numérotée crée la vue matérialisée de P2 : deux
      sous-composantes, par site et par programme.
- [ ] Un inventaire est à l'heure dans les trois derniers jours du mois.
- [ ] La date limite de réquisition (5 / 7 / 10 du mois suivant) est fonction du
      type de structure du site.
- [ ] Le score de pilier P2 est câblé dans la vue de score de pilier et la
      procédure de rafraîchissement ; le composite se calcule sur six piliers.
- [ ] `GET /api/sites/:id` renvoie P2 avec ses deux sous-composantes ou
      NON_CALCULABLE avec raison.
- [ ] La fiche site affiche la carte P2 avec ses deux sous-composantes.
- [ ] Couture B : un test par sous-composante et par type de structure —
      inventaire au 27 / 28 du mois, réquisition au 5 / 6 pour un CS et au 7 / 8
      pour un HG, catégorie vide → NON_CALCULABLE. Couture A : bout en bout, un
      site avec données complètes affiche les six piliers et un composite sur
      six.
