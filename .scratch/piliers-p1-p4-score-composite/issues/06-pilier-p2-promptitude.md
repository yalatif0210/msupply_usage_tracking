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

**Status:** done (branche piliers-p1-p4-score-composite)

- [x] `db/migrations/0019_vue_p2_promptitude.sql` crée `mv_p2_promptitude` :
      deux sous-composantes, par site et par programme (+ agrégat tous programmes).
- [x] Un inventaire est à l'heure s'il est daté dans les trois derniers jours du
      mois (`date_inventaire >= début(M+1) − 3 jours`).
- [x] Le jour limite de réquisition vient de `dim_site.jour_limite_requisition`,
      à défaut 5 (CSU/CSR/ESPC), 7 (HG/CHR), 10 (autres) ; comparé à
      `date_soumission` contre le jour limite du mois M+1.
- [x] Score de pilier P2 (moyenne des sous-composantes calculables) câblé dans
      `mv_score_pilier` et `rafraichir_et_geler` — les six piliers sont mesurés.
- [x] `GET /api/sites/:id` renvoie P2 avec ses deux sous-composantes ou
      NON_CALCULABLE avec raison ; `pilierNonMesure` supprimé (plus de pilier
      non outillé).
- [x] La fiche site affiche la carte P2 (rendu générique, deux sous-composantes).
- [x] Couture B (nouveau bloc `vue P2 — promptitude`) : inventaire le 28 vs 30,
      réquisition le 5 vs 6 pour un ESPC, le 7 vs 8 pour un HG, override
      `jour_limite_requisition`, catégorie absente → NON_CALCULABLE + moyenne.
      Couture A : `lecture-indicateurs` — six piliers, composite sur six ;
      `import` — composite renormalisé bout en bout.

## Comments

- Le seuil de « trois derniers jours » est calculé par mois calendaire
  (`date_trunc('month', date_inventaire) + 1 mois − 3 jours`), donc robuste aux
  mois de 28/30/31 jours sans dépendre de `import_lot.mois_fin`.
- **Suivi 2026-08-31 (migration 0020)** : arbitrage de la coordination sur la
  contradiction de la spec — dénominateur des deux sous-composantes = **programmes
  gérés** (pas « ÷ ce qui a été saisi »), seuil **100 %**. `mv_p2_promptitude`
  et `mv_score_pilier` réécrites ; grille mise à jour ; `CLAUDE.md` §5,
  `spec.md` et le guide indicateurs alignés. Un programme géré sans transaction
  du mois compte 0 (P2 pénalise la non-soumission), NON_CALCULABLE seulement si
  aucun programme géré déclaré.
