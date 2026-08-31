# P3 — dénominateur en jours calendaires

## Contexte

P3 (régularité de saisie) a été livré avec un dénominateur en **jours
ouvrables** : lundi–vendredi du mois PAQD, jours fériés de Côte d'Ivoire
retranchés (`dim_temps.est_ouvrable`, table `jour_ferie`).

Arbitrage de la coordination (2026-08-31) : **le PAQD ne défalque rien**. On
est en milieu hospitalier, la dispensation a lieu 7 j/7, week-ends et jours
fériés compris. Le site est jugé sur tous les jours du mois.

Conséquence : tout l'appareil « jour ouvrable / férié » devient du code mort.
Seul `mv_p3_regularite` lit `est_ouvrable` ; aucun autre pilier n'y touche.

## Ce qui change

- **`mv_p3_regularite`** : dénominateur = nombre de jours calendaires du mois
  PAQD (`count(*)` sur `dim_temps` groupé par `mois_paqd`). Numérateur = jours
  DISTINCT où le site a ≥ 1 sortie (`nature ∈ {dispensation, distribution}`,
  non annulée), **quel que soit le jour de la semaine**. Colonne `nb_ouvrables`
  → `nb_jours`.
- **`dim_temps.est_ouvrable`** supprimée ; **table `jour_ferie`** supprimée ;
  le seed de `jour_ferie` dans `0008` reste tel quel (migration historique,
  déjà passée — on ne réécrit pas le passé).
- `mv_score_pilier` + `rafraichir_et_geler` reconstruites à l'identique de
  `0023` (le `DROP … CASCADE` de `mv_p3_regularite` les emporte).
- Seuil grille inchangé : `regularite_saisie` ≥ 65 %.

## Ce qui ne change pas

- Le rendu front : P3 passe par le rendu générique des `ScorePilier`, aucun
  libellé « jours ouvrables » n'existe côté web.
- Les scores déjà gelés dans `hist_score_site` : non recalculés (ADR 0003).
  Les prochains imports regèlent leur mois avec la nouvelle règle.
- Le statut binaire (CONFORME / ALERTE / NON_CALCULABLE) et la
  renormalisation du composite.

## Périmètre exclu

- Pas de rattrapage des scores historiques.
- Pas de fêtes mobiles à semer (`jour_ferie` disparaît).
