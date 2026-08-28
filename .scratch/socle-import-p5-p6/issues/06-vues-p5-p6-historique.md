# 06: Vues P5 et P6 + gel de l'historique

**What to build:** Après un import propre, les scores des piliers P5
(concordance) et P6 (ratio d'ajustements) sont calculés par site, par mois PAQD,
par programme, en lisant les seuils de la grille de paramètres active pour ce
mois. Chaque sous-composante reçoit un statut binaire (CONFORME / ALERTE) ou
NON_CALCULABLE quand les données ne permettent pas le calcul. Les scores du mois
PAQD déclaré dans le classeur sont gelés dans l'historique, chaque ligne
référençant la version de grille utilisée ; la colonne de score composite reste
vide. Les données que la fenêtre de 45 jours réapporte pour un cycle déjà clos
mettent à jour le core mais ne re-gèlent jamais ce mois. Le rafraîchissement
s'exécute après la promotion, hors de sa transaction.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] `mv_p5_concordance` et `mv_p6_ajustements` existent, calculés par (site, mois PAQD, programme), filtrant `dim_site.dans_perimetre_dqa`.
- [ ] Les seuils P5 / P6 sont lus depuis la ligne de `grille_parametre` active — aucun seuil codé en dur dans la vue.
- [ ] Une sous-composante à données insuffisantes vaut NON_CALCULABLE et est exclue de son score de pilier ; le score de pilier est la moyenne simple de ses sous-composantes calculables (une seule ici).
- [ ] La procédure de rafraîchissement gèle une ligne d'historique par site du périmètre pour le `mois_paqd` du classeur (`ON CONFLICT` update), stocke `p_concordance` / `p_ajustements` et la version de grille, laisse `score_composite` NULL.
- [ ] Importer un classeur dont le `mois_paqd` appartient à un cycle clos ne re-gèle pas ce mois.
- [ ] Le rafraîchissement s'exécute hors de la transaction de promotion ; un échec de rafraîchissement ne perd pas le lot promu.
- [ ] Tests : couture B (fixtures de core fabriquées à la main → rafraîchissement → assertions sur la vue et les lignes d'historique, dont NON_CALCULABLE et les bornes de seuil).
