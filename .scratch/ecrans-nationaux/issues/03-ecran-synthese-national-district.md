# 03: Écran `/synthese` — indicateurs nationaux et ventilation par district

**What to build:** la route `/synthese` et son composant, avec le bloc national
et le tableau par district. C'est l'écran projeté en réunion : score moyen en
grand, répartition en couleurs franches, tableau dense mais aéré
(DESIGN_SYSTEM). La liste des sites reste la page d'accueil ; l'en-tête gagne un
lien « Synthèse nationale ».

Le bloc national montre le score composite moyen (très grand, tabular-nums), la
mention « calculé sur N sites sur M », et une barre de répartition à quatre
segments (CONFORME vert / PARTIELLEMENT CONFORME ambre / NON CONFORME rouge /
SANS MESURE gris) avec les comptes. En dessous, les six moyennes de pilier
(P1..P6, libellé + valeur, barre horizontale sobre ; `—` explicite si `null`).

Le tableau par district : district | nb sites | mesurés | score moyen |
répartition compacte ; une ligne est cliquable et ouvre la liste des sites
présélectionnée sur ce district.

Sélecteurs mois (si plusieurs mois) et région. État vide explicite si aucun
site n'a de score pour le mois.

**Blocked by:** 02

**Status:** done (branche `ecrans-nationaux`)

- [x] Route `/synthese` (`gardeAuthentifie`), lazy-loaded ; la liste des sites
      reste `/`. Lien « Synthèse nationale » ajouté à `ui/entete`.
- [x] `core/synthese.service.ts` : `synthese(opts)` valide la réponse avec
      `syntheseNationaleSchema` (`validerReponse`). `regions()` ajouté
      (à `SitesService` ou un `ReferentielService`).
- [x] `pages/synthese.ts` : bloc national (score moyen, « N sites sur M »,
      barre de répartition), six moyennes de pilier, sélecteurs mois + région.
- [x] `ui/repartition-classification.ts` : barre à quatre segments réutilisable
      (version pleine pour le bloc national, version compacte pour les lignes
      de tableau).
- [x] Tableau par district trié comme l'API le renvoie ; ligne cliquable →
      `/` avec le district présélectionné (query param lu par `ListeSitesPage`).
- [x] État vide : `moisPaqd === null` ou `national.nbMesures === 0` → phrase
      explicite, pas de zéros muets.
- [x] Le `typecheck` et `ng build` passent ; la réponse API est validée par Zod
      (une réponse non conforme lève, cf. couture D du ticket 02).
