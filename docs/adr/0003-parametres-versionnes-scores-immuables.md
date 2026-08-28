# Paramètres PAQD versionnés, scores historisés immuables

**Contexte.** Les poids des piliers et les seuils des sous-composantes vivent
en base (`param_seuil`) et sont édités par la coordination nationale via une UI ;
`CLAUDE.md` §5 prévoit qu'ils changent entre deux cycles. Or `hist_score_site`
fige un score par site et par mois PAQD, consulté ensuite pour du reporting de
conformité.

**Décision.** `param_seuil` devient une **grille de paramètres datée** : chaque
jeu de poids/seuils a une période de validité. Une modification par la
coordination crée une nouvelle version et **ne prend effet qu'au cycle suivant**.
Chaque ligne de `hist_score_site` référence la version de grille avec laquelle
elle a été calculée et n'est jamais recalculée : le score d'un mois passé reste
celui qui a été produit à l'époque.

**Pourquoi.** Un score de conformité doit être reproductible et défendable en
audit : « le score de mars a été calculé avec la grille de mars ». Recalculer
rétroactivement à chaque ajustement de barème rendrait l'historique instable et
les comparaisons entre cycles trompeuses. Le coût est un modèle de données un
peu plus lourd (versionnement + référence de grille sur chaque score) ; il est
justifié par l'usage conformité.

**Conséquence.** Les vues d'indicateurs lisent la grille active pour la période
calculée ; elles ne codent plus aucun poids ni seuil en dur (contrairement à
`initial.sql`).
