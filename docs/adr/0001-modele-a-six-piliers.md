# Modèle à six piliers ; `initial.sql` réécrit

**Contexte.** Trois définitions incompatibles du modèle de score coexistaient
dans le dépôt : `CLAUDE.md` §5 et `packages/contracts` décrivent six piliers
P1–P6 (poids 10/15/15/25/25/10) ; `initial.sql` implémente un modèle P2–P5 à
quatre piliers, sans promptitude dans le score composite et avec la complétude
pondérée à 25 %.

**Décision.** Le modèle à **six piliers** de `CLAUDE.md` §5 fait autorité, avec
la structure pilier → sous-composante précisée dans `CONTEXT.md` (P1 : trois
sous-composantes, P2 : deux, P3–P6 : une). `initial.sql` est **réécrit** pour
s'y conformer : nouvelles vues matérialisées `mv_p1_*` … `mv_p6_*`, score de
pilier = moyenne simple des sous-composantes calculables, score composite = somme
pondérée avec renormalisation des poids quand un pilier entier est
NON_CALCULABLE.

**Pourquoi.** Le modèle P2–P5 de `initial.sql` était un brouillon antérieur au
cadrage PAQD ; le conserver aurait figé des poids et un périmètre de piliers
faux. Le coût de la réécriture est réel mais localisé à la couche SQL, qui
n'est pas encore en production.
