# Gel des valeurs de sous-composante dans l'historique

**Contexte.** `hist_score_site` fige, par site et par mois PAQD, les scores de
pilier (`p_*`, 0 / 100 / renormalisé), le score composite et la classification
(ADR 0003). Les **valeurs mesurées** des dix sous-composantes (« taux de
régularité = 71 % », « taux de conformité SDU = 98 % »…) n'étaient pas figées :
elles étaient relues à la volée depuis les vues matérialisées `mv_p1..mv_p6`,
donc recalculées avec les règles *courantes*. La migration 0024 l'a rendu
visible : le dénominateur de P3 est passé aux jours calendaires et toutes les
valeurs P3 des mois déjà clos ont changé rétroactivement dans `mv_p3_regularite`
(le score de pilier `p_regularite` gelé, lui, n'a pas bougé).

Les écrans à venir — courbes d'évolution par sous-composante, diagramme en
araignée « points forts / faibles » — ont besoin de ces valeurs dans le temps.
Sur une base non gelée, une courbe sur un cycle clos deviendrait instable à
chaque évolution de règle et un radar historique mentirait.

**Décision.** `hist_score_site` gagne dix colonnes `sc_*`, une par
sous-composante, portant la **valeur brute mesurée** (pas le seuil ni le
statut, déductibles via `grille_id`). `rafraichir_et_geler` les fige en même
temps que les scores de pilier. Le taux d'atteinte du seuil, lui, n'est pas
gelé : il se déduit d'une valeur gelée et d'un seuil retrouvable (vue de
reshaping `v_sous_composante_atteinte`).

Rattrapage : la migration d'introduction recalcule et gèle les mois déjà clos
depuis les vues courantes — donc P3 en jours calendaires même pour les mois
gelés avant 0024. One-shot, assumé et documenté dans la migration.

**Pourquoi.** Même exigence que l'ADR 0003 : « les scores déjà calculés ne
changent jamais ». Étendre le gel aux valeurs de sous-composante est la seule
manière d'avoir des courbes et des radars historiques reproductibles. Le coût
est de dix colonnes numériques sur une table déjà large ; il est justifié par
l'usage (analyse fine dans le temps). L'alternative — une table
`hist_sous_composante` séparée — a été écartée : la clé et le cycle de vie sont
exactement ceux de `hist_score_site`, une table de plus n'apporterait que des
jointures.

**Conséquence.** `mv_score_pilier` expose désormais les dix valeurs brutes
(elle jointait déjà `mv_p1..mv_p6`). L'API lit les `sc_*` gelés pour
l'historique d'un site ; la fiche du mois courant peut continuer de lire les
vues live ou basculer sur `hist_score_site` pour cohérence.
