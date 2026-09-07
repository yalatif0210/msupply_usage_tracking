# Plan de suivi de l'utilisation de mSupply

**Programme :** gestion des stocks de produits de santé au niveau décentralisé, Côte d'Ivoire
**Maîtrise d'ouvrage :** Nouvelle PSP-CI / Direction de l'Approvisionnement et de la Pharmacie (DAP) / coordination nationale
**Financement :** Département d'État des États-Unis, jusqu'en 2030
**Instrument central :** Tableau de bord DQA mSupply (application de suivi existante)
**Version :** 1.0 (2026-09) · Document de travail soumis à la direction du projet
**Statut des mentions :** *Information à confirmer* = donnée non disponible à ce jour · *Évolution proposée* = fonctionnalité qui n'existe pas encore dans l'application

---

## 1. Résumé exécutif

Le programme a déployé mSupply comme système de gestion des stocks de produits de santé dans un réseau de sites décentralisés. Le déploiement d'un outil ne garantit pas son utilisation, et l'utilisation ne garantit pas une gestion des stocks de meilleure qualité. Le présent plan organise le passage d'un constat descriptif (« le site utilise ou n'utilise pas mSupply ») à un pilotage opérationnel de l'adoption : détecter au fil de l'eau les sites qui décrochent, comprendre pourquoi, décider d'une action, la suivre jusqu'à la vérification, et documenter le résultat pour ne pas recommencer indéfiniment les mêmes interventions.

Le plan s'appuie sur un actif déjà en production : le **Tableau de bord DQA mSupply**. Cette application consolide chaque semaine un extrait de la base mSupply transmis par la DAP, calcule par site un score de conformité des données sur six piliers, et historise la progression dans le temps. Le plan ne demande pas de construire un nouveau système. Il demande de **relire la donnée déjà disponible sous deux angles** : un **axe adoption** (le site fait-il réellement tourner sa gestion de stock sur mSupply) et un **axe qualité des données** (les données saisies sont-elles fiables), et d'ajouter autour de l'application une **boucle d'action** légère (une fiche de supervision trimestrielle d'une page, un registre des actions correctives).

Le dispositif est cadré par la contrainte structurante du programme : les données n'arrivent pas en temps réel, elles arrivent par lot hebdomadaire. Tout le cycle de suivi en découle. Le plan reste honnête sur ce qu'il peut mesurer : plusieurs dimensions souvent citées (fréquence de connexion individuelle, usage détaillé des modules, connectivité) ne sont pas observables avec la donnée actuelle et sont traitées comme des évolutions à négocier, pas comme des acquis.

Le périmètre de départ est de 40 sites. L'ambition, sur l'horizon 2030, est une couverture nationale progressive (33 régions, 113 districts), **conditionnée** à la capacité de la DAP à étendre l'extraction hebdomadaire. La feuille de route en cinq phases (Baseline, Monitoring, Intervention, Optimisation, Pérennisation) organise cette montée en charge et le transfert progressif de la routine à la coordination nationale.

---

## 2. Contexte et justification

### 2.1 mSupply au niveau décentralisé

mSupply est le système de gestion des stocks utilisé par le réseau. Au niveau d'un site, l'utilisation attendue se traduit par des actes concrets et datés : enregistrer les réceptions de produits, saisir les dispensations ou les distributions, réaliser l'inventaire de fin de mois, soumettre la réquisition mensuelle de réapprovisionnement, corriger le stock théorique par un ajustement lorsqu'un écart est constaté. Ces actes laissent une trace dans la base : c'est cette trace que le suivi exploite.

### 2.2 L'application de suivi existante

Le **Tableau de bord DQA mSupply** est en service. Son fonctionnement :

- **Source unique et cadence.** La DAP transmet chaque semaine un classeur Excel unique, extrait de mSupply sur une fenêtre glissante de 45 jours (le recouvrement permet de rattraper une semaine manquée). Ce classeur contient dix jeux de données : métadonnées de l'extraction, sites, rattachement site-programme, produits, transactions, lignes de transactions, photo du stock actuel, inventaires, lignes d'inventaire, réquisitions.
- **Traitement.** L'application valide le classeur, l'intègre dans un modèle en trois couches (miroir brut, données typées et dédoublonnées, indicateurs), calcule les indicateurs dans des vues de base de données, puis **fige** les scores du mois pour en garantir l'immuabilité.
- **Restitution.** Un tableau de bord national, une liste des sites, une fiche par site (scores par pilier, courbes d'évolution, radar, détail ligne à ligne), une fiche produit-mois, un écran de synthèse, un écran d'imports, et des écrans d'administration (produits traceurs, grille de paramètres, comptes, référentiel des structures).
- **Grain.** Site (magasin mSupply) x programme x mois. **Aucune donnée utilisateur mSupply** n'est extraite : ni identité de l'agent qui a saisi une transaction, ni journal de connexion, ni usage des écrans mSupply.

### 2.3 Justification du plan

L'application produit aujourd'hui un **verdict de qualité des données**. Le programme a besoin, en plus, d'un **pilotage de l'adoption** : savoir quels sites décrochent, agir avant l'abandon, et vérifier que l'appui porte ses fruits. Les deux besoins se nourrissent de la même donnée hebdomadaire mais répondent à des questions différentes. Le plan formalise cette double lecture et l'outille d'un cycle opérationnel et d'une boucle d'action.

---

## 3. Problématique

### 3.1 Pourquoi « le taux d'utilisation » ne suffit pas

Un indicateur binaire (« le site utilise / n'utilise pas mSupply ») masque huit réalités distinctes, chacune appelant une réponse différente :

| Niveau | Question | Ce qu'un « taux d'utilisation » ne dit pas |
|---|---|---|
| Accès | Le site a-t-il un poste, une connexion, un compte actif ? | Un site sans accès n'est pas un site qui refuse l'outil. |
| Utilisation | Le site enregistre-t-il des transactions ? | Une transaction par mois n'est pas une gestion de stock sur mSupply. |
| Utilisation régulière | Les saisies suivent-elles le rythme réel des mouvements de stock ? | Un site peut saisir en bloc une fois par mois, ce qui casse la valeur opérationnelle. |
| Utilisation correcte | Les saisies respectent-elles le processus (inventaire avant réquisition, ajustement justifié) ? | Des données saisies mais fausses sont pires qu'une absence de données. |
| Utilisation complète des fonctionnalités | Le site utilise-t-il l'inventaire, la réquisition, la dispensation, pas seulement la réception ? | Un usage partiel laisse des angles morts dans la chaîne. |
| Qualité des données | Les quantités saisies concordent-elles avec le stock physique ? | C'est l'objet des six piliers PAQD. |
| Utilisation des données pour la décision | Les données mSupply servent-elles à commander, à anticiper une rupture ? | Un système alimenté mais jamais consulté n'a pas d'effet. |
| Appropriation durable | Le site maintient-il ces pratiques sans appui externe ? | C'est la seule mesure qui compte à la fin du projet. |

### 3.2 Conséquence pour le plan

Le suivi doit distinguer explicitement ces niveaux, mesurer ceux qui sont observables, évaluer les autres en supervision, et attacher à chaque signal de dégradation une décision. Un plan qui produit des statistiques sans dire ce que l'équipe doit faire quand elles se dégradent n'est pas un plan de suivi, c'est un rapport.

---

## 4. Objectif général

Piloter l'adoption et l'utilisation effective de mSupply dans le réseau décentralisé, de manière à ce que chaque site atteigne et maintienne une gestion des stocks régulière, correcte et autonome sur le système, et à ce que l'équipe programme puisse détecter, prioriser et corriger les décrochages au fil de l'eau.

---

## 5. Objectifs spécifiques

1. **Mesurer l'adoption** de mSupply par site, sur une échelle opérationnelle claire, à partir de la donnée déjà disponible.
2. **Détecter au fil des imports hebdomadaires** les sites en décrochage ou à risque d'abandon.
3. **Comprendre les barrières** à l'utilisation, via une fiche de supervision trimestrielle légère.
4. **Déclencher et suivre des actions correctives** ciblées, jusqu'à leur vérification, dans un registre partagé.
5. **Évaluer l'efficacité des interventions** (l'appui améliore-t-il réellement l'utilisation, et l'amélioration tient-elle dans le temps).
6. **Segmenter l'appui** : concentrer les ressources sur les sites qui en ont besoin, alléger le suivi des sites autonomes.
7. **Préparer la pérennisation** : transférer la routine à la coordination nationale et réduire la dépendance au projet d'ici 2030.
8. **Documenter la progression vers l'usage des données pour la décision**, comme cap de moyen terme.

---

## 6. Théorie du changement et modèle d'adoption

### 6.1 Le parcours d'une structure

Une structure ne passe pas d'un coup de la non-utilisation à l'appropriation. Elle franchit des paliers, et peut régresser. Le modèle narratif compte sept niveaux. Pour chacun, le tableau indique ce que l'on cherche à observer, le comportement attendu, le risque si le niveau n'est pas atteint, l'intervention type, et **comment le niveau est apprécié** (par la donnée de l'application, par la fiche de supervision, ou non mesuré à ce jour).

| Niveau | Ce qu'on observe | Comportement attendu | Risque si non atteint | Intervention type | Mode d'appréciation |
|---|---|---|---|---|---|
| **Accès** | Poste, connexion, compte mSupply actif | Le site peut se connecter et saisir | Non-utilisation subie, faussement lue comme un refus | Résolution matérielle, activation du compte, appui connectivité | **Supervision** (checklist fiche) · *Information à confirmer* pour un suivi systématique |
| **Première utilisation** | Premières transactions enregistrées | Le site saisit au moins les réceptions et les dispensations | Le déploiement reste théorique | Formation initiale, accompagnement des premières saisies | **Donnée** : présence de transactions |
| **Utilisation régulière** | Rythme des saisies vs rythme réel des mouvements | Saisie au fil des jours, réquisition mensuelle à l'heure | Données périmées, sans valeur opérationnelle | Coaching sur la routine quotidienne, rappels calendaires | **Donnée** : P3 régularité, P2 promptitude |
| **Utilisation correcte** | Respect du processus, cohérence physique / théorique | Inventaire de clôture fait et saisi, ajustements justifiés, écarts maîtrisés | Décisions fondées sur des données fausses | Coaching processus (comptage, ordre des opérations, usage des ajustements) | **Donnée** : P1 complétude, P4 conformité, P5 concordance, P6 ajustements |
| **Maîtrise** | Autonomie de saisie, résolution des erreurs courantes | Le gestionnaire corrige seul ses erreurs, forme un remplaçant | Dépendance permanente à l'appui externe | Réduction progressive de l'accompagnement, tutoriels courts | **Supervision** (appréciation du point focal) · non mesuré par la donnée |
| **Appropriation** | Les données mSupply servent à décider (commande, anticipation de rupture) | Le stock mSupply est consulté en réunion de gestion | Système alimenté mais sans effet sur la disponibilité | Démonstration de valeur, intégration aux revues de stock | **Supervision** + un proxy de donnée (voir section 20) |
| **Pérennisation** | Maintien des pratiques sans intervention | Niveau tenu plusieurs cycles sans action corrective ouverte | Régression dès la fin du projet | Institutionnalisation, transfert à la routine de district | **Donnée** : stabilité de la trajectoire + absence d'action ouverte |

### 6.2 L'échelle opérationnelle

Pour le pilotage quotidien, ce parcours à sept niveaux est trop fin et à moitié non mesurable. Le plan retient une **échelle opérationnelle à quatre niveaux**, qui se calcule directement sur la donnée de l'application et qui pilote le classement, la segmentation et le routage de l'appui.

| Niveau | Définition mesurable | Correspondance narrative |
|---|---|---|
| **Actif** | Au moins une transaction saisie dans le mois | Première utilisation |
| **Régulier** | Niveau Actif + P3 (régularité) et P2 (promptitude) au seuil de la grille, sur les deux derniers cycles | Utilisation régulière |
| **Fiable** | Niveau Régulier + P1, P4, P5, P6 au seuil, sur le dernier cycle | Utilisation correcte |
| **Autonome** | Niveau Fiable tenu deux cycles consécutifs sans action corrective ouverte | Maîtrise + Pérennisation |

### 6.3 La boucle de pilotage

Le dispositif tourne selon une boucle unique, du signal à la documentation :

**Collecter → Consolider → Analyser → Détecter → Alerter → Prioriser → Agir → Vérifier → Documenter**

La section 7 détaille le rôle de l'application à chaque étape.

---

## 7. Cadre conceptuel du suivi

Rôle de l'application et des acteurs à chaque étape de la boucle.

| Étape | Données nécessaires | Source | Rôle de l'application | Acteur | Résultat attendu |
|---|---|---|---|---|---|
| **Collecter** | Transactions, inventaires, réquisitions, stock des 45 derniers jours | Extraction mSupply | (indirect) définit le contrat d'extraction (spécification v2) | DAP | Classeur hebdomadaire conforme |
| **Consolider** | Le classeur reçu | Import dans l'application | Validation, intégration en trois couches, dédoublonnage sur les identifiants mSupply | Application (auto) · coordination (contrôle) | Données du mois intégrées et contrôlées |
| **Analyser** | Données intégrées + grille de paramètres versionnée | Base de l'application | Calcul des six piliers, du score composite, du **niveau d'adoption** et du **signal** ; historisation | Application (auto) | Scores figés, niveaux et signaux à jour |
| **Détecter** | Scores et niveaux du mois + historique | Application | Comparaison au seuil et à la tendance (2 cycles), identification des sites en décrochage | Application (écran Alertes) | Liste des sites à traiter |
| **Alerter** | Liste des sites Rouge, sans transaction, fraîcheur dépassée | Application | Mise en évidence à l'écran ; *Évolution proposée* : notification au point focal | Coordination | Points focaux informés |
| **Prioriser** | Niveau, signal, segment, ancienneté de chaque site | Application (écran Performance & segmentation) | Classement et filtrage par segment | Coordination | Plan d'appui du mois |
| **Agir** | Diagnostic de la cause (barrière) | Fiche de supervision + échange avec le site | (indirect) fournit le contexte historique du site | Point focal district | Action convenue, responsable, échéance |
| **Vérifier** | Score et niveau du site aux cycles suivant l'action | Application | Mesure avant / après, tendance post-intervention | Coordination | Action confirmée ou ré-ouverte / escaladée |
| **Documenter** | Problème, cause, action, résultat attendu, résultat obtenu | Registre des actions correctives | (interim : tableur) *Évolution proposée n°1* : module applicatif | Coordination | Historique consultable, pas de répétition inutile |

---

## 8. Dimensions de suivi

Le plan structure le suivi autour de huit dimensions. Pour chacune : ce qu'elle couvre, et sa **disponibilité de donnée réelle** aujourd'hui.

| Dimension | Contenu | Disponibilité |
|---|---|---|
| **A. Disponibilité / Accessibilité** | Accès au système, connectivité, équipement, compte utilisateur | **Supervision uniquement.** Aucune donnée d'infrastructure dans l'extraction. *Information à confirmer* : possibilité d'un relevé d'accès par la DAP. |
| **B. Utilisation** | Fréquence des transactions, régularité, fraîcheur (délai depuis la dernière saisie) | **Donnée disponible.** Reformulation assumée : « fréquence de connexion » devient « fréquence des transactions ». |
| **C. Qualité d'utilisation** | Complétude, cohérence, exactitude, respect des processus, anomalies | **Donnée disponible.** C'est l'objet des piliers P1, P4, P5, P6. |
| **D. Utilisation fonctionnelle** | Usage des fonctions clés | **Partiel.** Observables : réquisition, réception, dispensation, inventaire, ajustement, et le mode (magasin / dispensaire). Non observables (commandes fournisseur, transferts inter-sites, prévisions, rapports) : *Évolution proposée* selon extension de l'extraction. |
| **E. Comportement utilisateur** | Habitudes, contournement, doublons papier, résistance, autonomie | **Supervision + inférence de donnée.** Le recours élevé aux ajustements et la saisie en bloc sont des proxies de comportement ; le reste s'apprécie en visite. |
| **F. Capacité / Compétence** | Maîtrise, besoins de coaching, erreurs récurrentes, nouveaux utilisateurs, turnover | **Supervision.** Le turnover est *Information à confirmer* faute de donnée utilisateur ; il est déclaré en fiche de supervision. |
| **G. Environnement organisationnel** | Supervision, leadership, organisation du travail, responsabilisation | **Supervision uniquement.** |
| **H. Pérennisation** | Capacité à utiliser mSupply sans appui, maintien des pratiques, résolution autonome des problèmes | **Donnée (proxy) + supervision.** Proxy : niveau Autonome tenu sans action ouverte. |

---

## 9. Cadre des indicateurs

### 9.1 Principe

Douze indicateurs pilotables, pas trente. Un indicateur n'entre dans le cadre que si une décision lui est attachée : « si cet indicateur se dégrade, l'équipe fait X ». Les autres mesures utiles mais non pilotables figurent en annexe E (mapping dimension vers donnée).

Quatre familles :
- **KPI d'alerte** : déclenchent une action à court terme sur un site.
- **KPI de comportement** : décrivent comment le site utilise le système.
- **KPI de processus** : décrivent la santé du dispositif de suivi lui-même.
- **KPI de résultat** : mesurent l'effet d'ensemble (adoption et qualité).

### 9.2 Les douze indicateurs

| # | Indicateur | Famille | Définition | Source | Fréquence | Désagrégation | Seuil / signal | Action déclenchée |
|---|---|---|---|---|---|---|---|---|
| 1 | Sites sans aucune transaction du mois | Alerte | Sites du périmètre sans transaction saisie sur le mois PAQD | Jeu Transactions | Hebdo / mensuel | District, programme | > 0 site : Rouge pour ces sites | Contact immédiat du point focal ; vérification accès, équipement, personnel |
| 2 | Fraîcheur des données | Alerte | Jours entre la dernière transaction saisie du site et la date d'extraction | Transactions + métadonnées | Hebdo | Site | > 10 j : Orange ; > 20 j : Rouge | Relance du site ; diagnostic connectivité / charge de travail |
| 3 | Sites en baisse sur 2 cycles | Alerte | Sites dont le niveau d'adoption ou le score composite recule deux cycles de suite | Historique de l'application | Cycle | District | Tout site concerné : Orange au minimum | Passage en revue mensuelle ; intervention ciblée selon segment |
| 4 | Régularité de saisie (P3) | Comportement | Part des jours du mois avec au moins une sortie de stock (dispensation) ; pour un district, part des réquisitions de zone servies | Vues d'indicateurs | Mensuel | Site, programme | Grille : 65 % (soins), 80 % (district) | Si sous le seuil : coaching sur la routine quotidienne de saisie |
| 5 | Promptitude des réquisitions (P2) | Comportement | Réquisition du mois soumise avant l'échéance de la strate (5, 7 ou 10 du mois suivant) | Jeu Réquisitions | Mensuel | Site, programme | Grille : 100 % | Rappel calendaire ; appui à la préparation de la réquisition |
| 6 | Complétude des transactions (P1) | Comportement | Présence de l'inventaire, de la réquisition et de la réception attendus en fin de mois | Vues d'indicateurs | Mensuel | Site, programme | Grille : 100 % | Vérifier que l'inventaire de clôture est fait puis saisi |
| 7 | Recours aux ajustements d'inventaire (P6) | Comportement | Ajustements d'inventaire rapportés au total des mouvements de stock du mois | Lignes de transactions | Mensuel | Site | Grille : 5 % maximum | Si dépassé : analyse des causes (saisie différée, erreurs de comptage) ; coaching processus |
| 8 | Part des sites Fiable ou Autonome | Résultat | Sites au niveau Fiable ou Autonome sur l'échelle d'adoption | Application (niveau calculé) | Cycle | District, région | Cible fixée en Phase 1 sur la distribution de baseline | Revue trimestrielle ; ajustement de la stratégie d'appui |
| 9 | Couverture de l'extraction | Processus | Sites présents dans le classeur hebdomadaire rapportés aux sites du périmètre | Métadonnées + jeu Sites | Hebdo | (national) | < 95 % : anomalie | Escalade DAP ; identification nominative des sites manquants |
| 10 | Délai import vers disponibilité | Processus | Jours entre la réception du classeur et le gel des scores du mois | Journal d'imports | Hebdo | (national) | Dérive vs cible interne | Revue du processus d'import avec l'équipe technique |
| 11 | Actions correctives : ouvertes, en retard, clôturées | Processus | Décompte du registre des actions correctives | Registre (tableur, puis module) | Mensuel | District | Toute action en retard | Revue mensuelle ; escalade des actions en retard |
| 12 | Score composite PAQD moyen et distribution des classifications | Résultat | Moyenne du score sur 100 et répartition CONFORME / PARTIELLEMENT CONFORME / NON CONFORME | Vues d'indicateurs | Cycle | District, région, programme | Classification en base (90 / 75) | Analyse par pilier des sous-composantes en difficulté (écran Synthèse) |

### 9.3 Indicateurs d'efficacité des interventions

Deux indicateurs supplémentaires, exploités en revue semestrielle (section 19) :

- **Taux de maintien de l'amélioration** : part des sites qui, après clôture d'une action corrective, restent au niveau atteint pendant les deux cycles suivants.
- **Réduction des segments à risque** : variation, d'un semestre à l'autre, du nombre de sites en segment « À risque » et « Faible usage ».

---

## 10. Architecture du système de suivi

### 10.1 Sources de données

| Source | Nature | Cadence | Responsable | Statut |
|---|---|---|---|---|
| Classeur d'extraction mSupply (10 jeux) | Automatique (extrait de la base mSupply) | Hebdomadaire, fenêtre 45 jours | DAP (extraction : point de contact nommé) | **Existe** · contrat = spécification d'extraction v2 |
| Fiche de supervision trimestrielle (1 page) | Manuelle | Trimestrielle, pendant la visite déjà prévue | Point focal district | **À mettre en place** (annexe B) |
| Registre des actions correctives | Manuelle | Continue, revue mensuelle | Coordination nationale | **À mettre en place** (annexe C) · module applicatif = *Évolution proposée n°1* |
| Journal d'accès / relevé d'équipement | Manuelle ou extraite | Trimestrielle | Point focal district / DAP | *Information à confirmer* |
| Colonne « agent qui a saisi » sur les transactions | Automatique | Hebdomadaire | DAP | *Information à confirmer* (négociation) · débloquerait le suivi par utilisateur |

### 10.2 Flux

1. La DAP produit et transmet le classeur hebdomadaire.
2. La coordination l'importe dans l'application ; l'application valide, intègre, calcule et fige.
3. L'application met à jour, par site : les six piliers, le score composite, le **niveau d'adoption**, le **signal** et le **segment**.
4. La coordination lit l'écran Alertes (hebdomadaire) et l'écran Performance & segmentation (mensuel).
5. Les points focaux district traitent les sites qui leur sont affectés, remplissent la fiche de supervision au trimestre, et alimentent le registre.
6. La coordination suit le registre, mesure les effets avant / après, et rend compte en revue semestrielle.

### 10.3 Ce que le suivi ne collecte pas

Pas de collecte manuelle mensuelle. Pas de questionnaire utilisateur. Pas de saisie parallèle de données de stock. La seule collecte manuelle est la fiche de supervision trimestrielle, d'une page, intégrée à une visite existante.

---

## 11. Rôle de l'application dans le plan

Classement de chaque capacité selon quatre statuts : **existe**, **exploitable immédiatement**, **à améliorer**, **évolution future**.

### 11.1 Ce qui existe et est exploitable immédiatement

- Import hebdomadaire validé, intégration en trois couches, gel des scores (immuabilité des mois clos).
- Calcul des six piliers PAQD et du score composite, par site, mois et programme.
- Historisation et courbes d'évolution ; distinction mois clos / mois en cours (score provisoire).
- Tableau de bord national : score moyen, tendance, répartition des classifications, sous-composantes en difficulté.
- Liste des sites paginée, filtrable par district et programme.
- Fiche site : scores par pilier, radar, courbes (composite, par pilier, par sous-composante), détail ligne à ligne lu en direct du core.
- Fiche produit-mois : toutes les grandeurs brutes derrière P3 à P6 pour un produit traceur.
- Écran de synthèse (agrégations district, région, programme), écran d'imports, écrans d'administration (produits traceurs, grille de paramètres versionnée, comptes, référentiel des structures).

### 11.2 Ce qui est à améliorer (adaptations de l'existant)

- **Calcul et affichage du niveau d'adoption et du signal** par site (dérivés des piliers déjà calculés et de la tendance).
- **Colonnes niveau / signal / segment** dans la liste des sites, avec filtre par segment.
- **Distribution des niveaux d'adoption et des signaux** sur le tableau de bord national.
- **Indicateur de fraîcheur** (délai depuis la dernière transaction) par site.
- **Couverture de l'extraction** affichée à chaque import (sites reçus / attendus).

### 11.3 Ce qui constitue une évolution future

- **Module de registre des actions correctives** (*Évolution proposée n°1*) : création, affectation, échéance, statut, résultat attendu / obtenu, lien vers l'indicateur déclencheur, historique par site.
- **Écran Alertes & actions** dédié, avec notification au point focal.
- **Vue nationale d'adoption dans le temps** et analyse de cohortes (Nouveaux sites).
- **Suivi par utilisateur nommé** (conditionné à l'obtention de la colonne « agent » dans l'extraction).
- **Suivi de l'usage des fonctionnalités** hors des cinq natures actuelles (conditionné à l'extension de l'extraction).
- **Cadence infra-hebdomadaire** (conditionnée à un changement de mode d'alimentation, non prévu).

---

## 12. Système d'alertes et de segmentation

### 12.1 Deux lectures distinctes

- **Niveau d'adoption** (Actif, Régulier, Fiable, Autonome) : *où en est le site*. C'est un état.
- **Signal** (Vert, Orange, Rouge) : *quelle attention le site demande maintenant*. C'est une urgence, orthogonale au niveau. Un site Fiable mais en baisse deux cycles est Orange ; un nouveau site Actif et stable est Vert.

Le signal ne se confond pas avec la classification qualité PAQD (CONFORME / PARTIELLEMENT CONFORME / NON CONFORME), qui reste le verdict sur la fiabilité des données.

### 12.2 Règle de signal

| Signal | Condition |
|---|---|
| **Vert** | Niveau stable ou en progression, aucune alerte active (indicateurs 1, 2, 3) |
| **Orange** | Un signe de dégradation : une baisse sur 1 à 2 cycles, ou une sous-composante de l'axe adoption passée sous le seuil, ou une fraîcheur entre 10 et 20 jours |
| **Rouge** | Décrochage : sous le niveau Actif, ou baisse sur 2 cycles et plus, ou fraîcheur supérieure à 20 jours, ou aucune transaction du mois |

### 12.3 Méthode de fixation des seuils

Approche **hybride**, sans seuil arbitraire :

1. **Plancher normatif.** Les seuils des piliers de l'axe adoption sont ceux de la grille de paramètres versionnée, déjà validés avec la coordination PAQD (P3 : 65 % soins / 80 % district ; P2 : 100 % ; P1 : 100 %). Un site doit les passer pour prétendre au niveau Régulier ou Fiable.
2. **Règle de tendance.** Indépendamment du niveau atteint, deux cycles de baisse consécutifs entraînent un déclassement du signal (vers Orange, puis Rouge).
3. **Calage empirique en Phase 1.** Les seuils propres au plan (fraîcheur, cible de « part Fiable+ ») sont fixés après la période de baseline, sur la distribution réellement observée, puis révisés à chaque revue annuelle. Toute modification de la grille PAQD passe par l'écran d'administration et ne s'applique qu'au cycle suivant (immuabilité des scores figés).

### 12.4 Segmentation

Cinq segments, **dérivés** du niveau, du signal et de l'ancienneté. Un seul système, pas trois étiquettes parallèles. La segmentation pilote le routage de l'appui.

| Segment | Règle | Niveau de surveillance | Fréquence de suivi | Type d'intervention | Responsable | Escalade |
|---|---|---|---|---|---|---|
| **Performer** | Fiable ou Autonome, signal Vert | Léger | Cycle | Valorisation, mobilisation comme pair-formateur | Point focal district | (sans objet) |
| **À risque** | Tout niveau, signal Orange | Renforcé | Mensuel | Diagnostic de barrière, action préventive ciblée | Point focal district | Coordination si Orange persiste 2 cycles |
| **Faible usage** | Actif ou Régulier, signal Rouge | Intensif | Mensuel, contact intercalaire | Coaching sur site, plan de redressement | Point focal district + support technique | Coordination immédiate |
| **Non-utilisateur** | Sous le niveau Actif (aucune transaction depuis 1 cycle et plus) | Critique | Hebdomadaire jusqu'à reprise | Visite en urgence, diagnostic accès / personnel / matériel | Coordination + point focal | Management PSP-CI si non résolu en 1 mois |
| **Nouveau** | Site intégré au périmètre depuis moins de 2 cycles | Renforcé (accompagnement) | Bimensuel | Accompagnement des premières saisies, passation | Point focal district | Coordination si pas de progression après 2 cycles |

---

## 13. Stratégie de changement de comportement

Le plan ne se limite pas à la formation. Il traite la sous-utilisation comme un problème de comportement, dont la cause conditionne l'intervention.

### 13.1 Matrice Barrière vers Cause vers Intervention vers Responsable vers Indicateur de succès

| Barrière | Cause probable | Intervention | Responsable | Indicateur de succès |
|---|---|---|---|---|
| Manque de compétence | Formation initiale insuffisante, turnover | Coaching sur site, tutoriels courts ciblés sur les erreurs constatées | Point focal district | La fraîcheur repasse sous 5 jours ; P3 remonte au seuil |
| Manque de confiance | Peur de faire une erreur irréversible | Accompagnement, période de saisie supervisée | Point focal district | Nombre de transactions saisies en autonomie |
| Absence de motivation | Le site ne reçoit jamais de retour sur ce qu'il saisit | Restitution mensuelle des scores au site, reconnaissance des Performers | Coordination | Évolution du niveau d'adoption du site |
| Mauvaise compréhension du bénéfice | mSupply perçu comme une contrainte de reporting | Démonstration concrète : une rupture évitée grâce à la visibilité du stock | Point focal district | Consultation des données de stock en réunion de gestion (fiche de supervision) |
| Surcharge de travail | Sous-effectif, cumul de fonctions | Réorganisation de la routine, priorisation des saisies critiques (dispensation, réception) | Point focal district + responsable du site | P3 régularité |
| Problèmes techniques, connectivité, équipement | Matériel vétuste, coupures fréquentes | Signalement au support technique, cadrage d'un mode dégradé (saisie différée encadrée) | Support technique | Fraîcheur des données ; nombre d'incidents ouverts / résolus |
| Changement de personnel | Départ du gestionnaire formé | Passation documentée obligatoire, formation express du remplaçant sous 2 semaines | Point focal district | Maintien du niveau d'adoption au trimestre du remplacement |
| Supervision insuffisante | Visites de district espacées | Intégration du suivi mSupply à la visite trimestrielle (fiche 1 page) | Coordination | Taux de fiches de supervision remplies |
| Absence de responsabilisation | Aucune conséquence à la non-utilisation | Inscription de l'adoption dans les revues de performance de district | Coordination + management | Part des districts avec une revue mSupply documentée |
| Processus parallèles | Registre papier maintenu en doublon | Accompagnement à l'abandon progressif du papier une fois mSupply fiable | Point focal district | Segment du site (passage à Fiable) |
| Préférence pour les anciennes pratiques | Habitude, ancienneté | Démonstration de valeur, mise en relation avec des pairs Performers | Point focal district | Niveau d'adoption |
| Manque de feedback | Le site ne voit jamais ses propres scores | Accès en lecture au tableau de bord pour le point focal et, si possible, le site | Coordination | Consultation du tableau de bord (*Information à confirmer* : nécessite des comptes dédiés) |

### 13.2 Palette d'interventions

Formation, coaching, supervision, accompagnement ciblé, support technique, rappel calendaire, communication, démonstration de valeur, responsabilisation managériale, analyse des performances, partage des bonnes pratiques. Le choix se fait à partir de la cause identifiée, pas par défaut.

---

## 14. Stratégie d'intervention

L'intervention est calibrée par segment (section 12.4). Principes transversaux :

- **Priorité aux Non-utilisateurs et au Faible usage.** Ce sont les sites où l'effet marginal d'une action est le plus fort.
- **Accompagnement systématique des Nouveaux** pendant deux cycles, pour éviter qu'ils ne basculent en Faible usage.
- **Action préventive sur les À risque.** Un site Orange traité tôt coûte moins cher qu'un site Rouge.
- **Allègement pour les Performers.** Suivi au cycle, mobilisation comme pairs-formateurs.
- **Une action par cause, pas une formation pour tout.** La matrice de la section 13 est la référence.
- **Toute intervention est tracée** dans le registre (section 15), avec une échéance et une vérification.

---

## 15. Suivi des actions correctives

### 15.1 Le registre

Interim : un tableur unique tenu par la coordination nationale, sur le gabarit de l'annexe C. Cible : un module de l'application (*Évolution proposée n°1*).

Colonnes : site, date de détection, problème, indicateur déclencheur, cause identifiée, action décidée, responsable, échéance, statut (ouverte / en cours / en retard / clôturée / escaladée), résultat attendu, résultat obtenu, date et mode de vérification.

### 15.2 Cycle de revue

- **Mensuel.** La coordination passe en revue toutes les actions ouvertes : avancement, échéances dépassées, escalades. Nouvelle affectation pour les sites entrés en alerte depuis la revue précédente.
- **Trimestriel.** Le point focal met à jour, en fiche de supervision, le suivi des actions du trimestre précédent.
- **Vérification.** Une action n'est clôturée que lorsque l'indicateur déclencheur est revenu au seuil et s'y maintient sur le cycle suivant. Sinon, elle est ré-ouverte ou escaladée.

### 15.3 Mémoire

Le registre conserve l'historique par site. Avant toute nouvelle action, la coordination consulte les actions passées du site : si la même cause revient malgré une intervention antérieure, l'action change de nature (escalade, appui d'un autre type, décision managériale), elle ne se répète pas à l'identique.

---

## 16. Gouvernance et RACI

### 16.1 Acteurs

| Acteur | Rôle dans le plan |
|---|---|
| Équipe projet (Nouvelle PSP-CI / DAP / coordination nationale) | Pilotage d'ensemble, financement, décisions de périmètre |
| Coordination nationale | Tenue du cycle de suivi, registre des actions, revues, reporting |
| DAP (point de contact extraction) | Production et transmission du classeur hebdomadaire, contrat d'extraction |
| Point focal district (1 par district) | Traitement des sites affectés, visite de supervision trimestrielle, interventions de terrain |
| Gestionnaire de stock du site | Utilisation de mSupply, participation à la supervision |
| Support technique mSupply | Incidents, mode dégradé, évolutions applicatives |
| Management PSP-CI | Arbitrages, escalades non résolues, décision d'extension |

### 16.2 Matrice RACI (R = réalise, A = redevable, C = consulté, I = informé)

| Activité | Coordination | DAP | Point focal district | Gestionnaire de stock | Support technique | Management PSP-CI |
|---|---|---|---|---|---|---|
| Production et transmission du classeur hebdomadaire | A | R | I | I | C | I |
| Import et contrôle de complétude | R / A | C | I | | C | |
| Revue hebdomadaire des signaux critiques | R / A | I | I | | | I |
| Revue mensuelle de performance et des actions | A | | R | | C | I |
| Visite de supervision trimestrielle et fiche | A | | R | C | | I |
| Tenue du registre des actions correctives | R / A | | C | | | I |
| Interventions de coaching sur site | A | | R | C | C | |
| Résolution des incidents techniques | C | C | C | I | R / A | I |
| Revue semestrielle d'adoption et de pérennisation | A | C | C | | | R |
| Négociation de l'extension de l'extraction | C | R | I | | C | A |
| Décision d'entrée / sortie du périmètre | A | C | C | | | R |

*Information à confirmer :* répartition exacte des rôles entre PSP-CI, DAP et coordination nationale, et existence d'un point focal dédié au suivi mSupply distinct du point focal district généraliste.

---

## 17. Cycle de suivi

| Fréquence | Activités | Données mobilisées | Responsable | Livrable |
|---|---|---|---|---|
| **Hebdomadaire** | Import du classeur ; rafraîchissement des scores ; lecture de l'écran Alertes (sites sans transaction, fraîcheur dépassée, signaux Rouge) ; contrôle de la couverture de l'extraction | Classeur, indicateurs 1, 2, 9 | Coordination | Note de signaux critiques |
| **Mensuel** | Revue des segments À risque, Faible usage, Non-utilisateur, Nouveau ; état du registre (actions ouvertes, en retard) ; affectation des interventions | Niveaux, signaux, segments, registre | Coordination + points focaux | Plan d'appui du mois, registre à jour |
| **Trimestriel** | Visite de supervision et fiche 1 page ; analyse des tendances par district ; revue des barrières ; mise à jour du suivi des actions | Fiche de supervision, historique, indicateurs 3, 4 à 8 | Points focaux district | Fiches de supervision, synthèse district |
| **Semestriel** | Bilan d'adoption (distribution des niveaux et segments) ; efficacité des interventions (indicateurs d'efficacité) ; ajustement de la stratégie d'appui | Historique complet, registre, indicateurs de résultat | Coordination + équipe projet | Rapport semestriel d'adoption |
| **Annuel** | Évaluation de la pérennisation (part des sites Autonomes) ; révision des seuils du plan ; revue du dispositif ; décision sur le périmètre et l'extension | Ensemble | Équipe projet + management | Rapport annuel, décisions de périmètre |

---

## 18. Tableaux de bord

Cinq tableaux de bord couvrent le cycle. La cible détaillée des huit tableaux de bord initialement envisagés figure en annexe G.

| # | Tableau de bord | Audience | Objectif | Indicateurs clés | Décision attendue | État |
|---|---|---|---|---|---|---|
| 1 | **Exécutif** | Management PSP-CI, bailleur | État national en un écran | Score PAQD moyen et tendance, répartition des classifications, distribution des niveaux d'adoption, nombre de sites par signal, couverture de l'extraction | Allocation des ressources d'appui, arbitrage de périmètre | **Existe** (tableau de bord national) · **à améliorer** : ajouter niveaux d'adoption et signaux |
| 2 | **Performance & segmentation** | Coordination, points focaux | Classer les sites et router l'appui | Liste des sites avec niveau, signal, segment, score PAQD, tendance ; tri et filtre par district / programme / segment | Qui reçoit quel appui ce mois | **Existe partiellement** (liste des sites) · **à améliorer** : colonnes et filtre par segment |
| 3 | **Adoption & tendance** | Coordination, équipe projet | Voir la trajectoire d'adoption | Courbe du niveau par site et agrégée, évolution de la part Fiable ou plus, cohortes de nouveaux sites | La stratégie d'appui produit-elle un effet | **Existe partiellement** (courbes fiche site) · **évolution proposée** : vue nationale et cohortes |
| 4 | **Alertes & actions** | Coordination, points focaux | Ce qui exige une action maintenant | Sites sans transaction, fraîcheur dépassée, baisses sur 2 cycles, actions ouvertes et en retard | Déclencher ou escalader une intervention | **N'existe pas** · **évolution proposée n°1** (avec le module de registre) · interim : suivi manuel + tableur |
| 5 | **Qualité des données** | Coordination, points focaux | Diagnostic par pilier | Sous-composantes en difficulté (P4, P5, P6), fiche site détaillée, fiche produit-mois | Coaching processus ciblé (comptage, ajustements, ordre des opérations) | **Existe** (Synthèse, fiche site, fiche produit-mois) |

---

## 19. Évaluation de l'efficacité des interventions

### 19.1 Question

Nos interventions améliorent-elles réellement l'utilisation de mSupply, et l'amélioration tient-elle dans le temps ?

### 19.2 Méthode

Pour chaque action corrective clôturée, comparaison de quatre moments :

1. **Avant** : niveau d'adoption et score du site au cycle précédant la détection.
2. **Intervention** : nature, date, responsable (registre).
3. **Après** : niveau et score aux deux cycles suivant la clôture.
4. **Maintien** : niveau et score deux cycles plus tard encore.

### 19.3 Indicateurs

- Variation du niveau d'adoption avant / après intervention.
- Amélioration de la fraîcheur, de la régularité (P3), de la complétude (P1).
- Réduction du recours aux ajustements (P6).
- Réduction du nombre de sites en segment À risque et Faible usage d'un semestre à l'autre.
- **Taux de maintien** : part des sites restés au niveau atteint sur les deux cycles suivant la clôture.

### 19.4 Limite assumée

Le dispositif ne permet pas d'établir un effet causal rigoureux : il n'y a pas de groupe de comparaison, et plusieurs facteurs agissent en même temps. Les résultats sont présentés comme des **tendances associées aux interventions**, pas comme un impact démontré. Cette limite est explicitée dans tout rapport au bailleur.

---

## 20. Utilisation des données pour la décision

### 20.1 Cap de moyen terme

Le suivi ne s'arrête pas à l'utilisation du système. Il vise à terme une progression :

**Utilisation du système → Qualité des données → Confiance dans les données → Utilisation des données → Décisions fondées sur les données → Amélioration de la performance de la chaîne d'approvisionnement**

### 20.2 Comment cette progression est appréciée

- **Utilisation et qualité** : mesurées par les douze indicateurs (axes adoption et qualité).
- **Confiance** : appréciée en fiche de supervision (le gestionnaire et le point focal se fient-ils au stock mSupply, ou maintiennent-ils un comptage parallèle).
- **Utilisation des données** : appréciée en fiche de supervision (les données mSupply sont-elles consultées lors des décisions de commande et des réunions de gestion).
- **Décisions fondées sur les données** : un **proxy quantitatif unique**, la cohérence entre les quantités réquisitionnées et la tendance de consommation reconstituée du site. Une réquisition très éloignée de la consommation observée suggère qu'elle n'est pas préparée à partir des données du système.
- **Performance de la chaîne** : hors périmètre de cet instrument (relève du suivi logistique du programme : taux de rupture, taux de service). Le plan se contente de signaler le lien.

### 20.3 Évolution du monitoring

À mesure que les sites atteignent le niveau Fiable, la revue trimestrielle déplace progressivement son attention de « le site saisit-il » vers « le site décide-t-il à partir de ce qu'il saisit ». Ce glissement est explicite dans l'ordre du jour des revues à partir de la Phase 4.

---

## 21. Plan opérationnel

| Activité | Objectif | Méthode | Responsable | Fréquence | Outil | Livrable | KPI |
|---|---|---|---|---|---|---|---|
| Import et contrôle du classeur | Données du mois intégrées et fiables | Import applicatif, contrôle des compteurs de métadonnées, vérification de la couverture | Coordination | Hebdomadaire | Application (écran Imports) | Journal d'import | Couverture de l'extraction (ind. 9) |
| Lecture des signaux critiques | Détecter les décrochages immédiats | Écran Alertes : sites sans transaction, fraîcheur, signaux Rouge | Coordination | Hebdomadaire | Application (écran Alertes) · interim : tableur | Note de signaux | Ind. 1, 2, 3 |
| Revue mensuelle de performance | Router l'appui vers les bons sites | Écran Performance & segmentation, filtre par segment ; affectation aux points focaux | Coordination + points focaux | Mensuelle | Application + registre | Plan d'appui du mois | Actions ouvertes dans le mois (ind. 11) |
| Interventions de terrain | Corriger les causes de sous-utilisation | Matrice barrière vers intervention (section 13), contact ou visite selon segment | Points focaux district | Selon segment | Fiche de contact, registre | Actions tracées | Ind. 4 à 8 des sites concernés |
| Visite de supervision trimestrielle | Diagnostiquer les barrières, suivre les actions | Fiche 1 page pendant la visite déjà prévue | Points focaux district | Trimestrielle | Fiche de supervision (annexe B) | Fiches remplies | Taux de fiches remplies |
| Tenue du registre des actions | Ne pas répéter les mêmes interventions | Registre unique, revue mensuelle, vérification avant clôture | Coordination | Continue | Tableur (puis module) | Registre à jour | Actions en retard (ind. 11) |
| Revue semestrielle d'adoption | Évaluer l'effet d'ensemble et ajuster la stratégie | Analyse des distributions et des indicateurs d'efficacité | Coordination + équipe projet | Semestrielle | Application + registre | Rapport semestriel | Part Fiable ou plus (ind. 8), taux de maintien |
| Revue annuelle du dispositif | Réviser seuils, périmètre, extension | Analyse annuelle, décision de la direction | Équipe projet + management | Annuelle | Ensemble | Rapport annuel, décisions | Score PAQD moyen (ind. 12), part Autonome |
| Négociation de l'extraction | Sécuriser et étendre la source | Accord de service avec la DAP, dimensionnement de l'extension | Équipe projet + DAP | Continue / annuelle | Contrat d'extraction | Accord de service, plan d'extension | Couverture, délai de transmission |

---

## 22. Feuille de route

Cinq phases sur l'horizon 2030. Les cycles PAQD durent quatre mois (trois par an).

### Phase 1 : Baseline (cycles C1 à C2, environ 8 mois)

- **Activités** : stabiliser l'import hebdomadaire ; analyse rétrospective de l'historique disponible ; calage empirique des seuils du plan (fraîcheur, cible de part Fiable) sur la distribution observée ; création de la fiche de supervision et du registre ; formation des points focaux au dispositif.
- **Résultats attendus** : situation initiale documentée (niveau, signal et segment de chaque site) ; seuils du plan validés.
- **Indicateurs** : couverture de l'extraction supérieure ou égale à 95 % ; 100 % des sites classés.
- **Prérequis** : classeur hebdomadaire conforme et régulier.

### Phase 2 : Monitoring systématique (cycles C3 à C6, environ 16 mois)

- **Activités** : cycle opérationnel complet (hebdomadaire, mensuel, trimestriel) ; tenue du registre ; développement du module d'actions correctives (*Évolution proposée n°1*) et des adaptations de la section 11.2.
- **Résultats attendus** : chaque site en alerte a une action tracée et vérifiée.
- **Indicateurs** : délai signal vers action ouverte inférieur à un mois ; part des actions clôturées dans les délais.
- **Prérequis** : Phase 1 achevée.

### Phase 3 : Intervention ciblée (démarre en C3, en parallèle de la Phase 2)

- **Activités** : déploiement des interventions par segment (coaching Faible usage, accompagnement Nouveaux, action préventive À risque, démonstration de valeur).
- **Résultats attendus** : réduction du nombre de sites Rouge et du segment Faible usage.
- **Indicateurs** : variation du niveau d'adoption après intervention ; taux de maintien.

### Phase 4 : Optimisation (années 2 à 3)

- **Activités** : analyse des tendances ; révision annuelle des seuils ; évaluation de l'efficacité des interventions ; préparation de l'extension (dimensionnement de l'extraction avec la DAP, découpage en vagues de districts).
- **Résultats attendus** : dispositif ajusté ; dossier d'extension prêt.
- **Indicateurs** : part Fiable ou plus en progression ; efficacité des interventions mesurée.

### Phase 5 : Pérennisation et mise à l'échelle (année 3 jusqu'en 2030)

- **Activités** : transfert de la routine à la coordination nationale ; réduction progressive de l'appui projet ; extension au-delà des 40 sites par vagues, **conditionnée** à la capacité d'extraction de la DAP ; institutionnalisation (intégration aux revues de performance de district, inscription du suivi mSupply dans les attributions des points focaux).
- **Résultats attendus** : le suivi tourne sans le projet ; périmètre étendu vers la couverture nationale.
- **Indicateurs** : part des sites Autonomes ; nombre de sites couverts ; part du dispositif financée hors projet.
- **Prérequis** : extraction extensible ; engagement budgétaire national.

---

## 23. Risques et mesures d'atténuation

| Risque | Probabilité / Impact | Mesures d'atténuation |
|---|---|---|
| Extraction DAP non tenue ou de qualité insuffisante | Moyenne / Critique (tout le dispositif en dépend) | Accord de service sur le contenu, le format et la cadence ; fenêtre de 45 jours qui amortit une semaine manquée ; contrôle de complétude à chaque import (compteurs de métadonnées) ; point de contact DAP nommé |
| Extraction non extensible au national | Moyenne / Élevé (bloque la Phase 5) | Dimensionner tôt (Phase 4) ; extension par vagues de districts ; ne pas conditionner le succès du plan à l'échelle nationale immédiate |
| Fiche de supervision non remplie | Élevée / Moyen | Une page, intégrée à une visite déjà prévue ; taux de remplissage suivi comme KPI de processus ; relance systématique par la coordination |
| Dépendance au projet, non-appropriation | Moyenne / Élevé | Phase 5 dédiée ; transfert progressif ; institutionnalisation dans les revues de district ; transfert budgétaire graduel |
| Usage punitif perçu, rétention d'information | Moyenne / Élevé | Cadrage explicite « amélioration continue » ; restitution des scores aux sites ; valorisation des Performers ; aucune sanction automatique |
| Petits effectifs par district (dénominateur du P3 district, taille des segments) | Élevée / Faible | Agrégation au district et à la région ; prudence sur les petits nombres ; lecture en tendance plutôt qu'en niveau ponctuel |
| Turnover des gestionnaires de stock formés | Élevée / Moyen | Passation documentée obligatoire ; formation express du remplaçant sous deux semaines ; le niveau d'adoption au trimestre du remplacement est suivi |
| Évolution de mSupply cassant l'extraction | Faible / Élevé | Le contrat d'extraction (spécification v2) fait foi ; test de non-régression à chaque évolution mSupply signalée |
| Comptes de consultation non déployés pour les points focaux | Moyenne / Moyen | Prévoir la création des comptes en Phase 1 ; à défaut, restitution par export de la coordination |

---

## 24. Conditions de pérennisation

Le dispositif est pérenne lorsque, simultanément :

1. L'extraction hebdomadaire est produite en routine par la DAP, indépendamment du projet.
2. Le suivi mSupply est inscrit dans les attributions du point focal district et dans les revues de performance de district.
3. La coordination nationale tient le cycle de revue (hebdomadaire, mensuel, trimestriel) sans appui externe.
4. Le registre des actions correctives est alimenté et **exploité** (pas seulement rempli).
5. Une part croissante du coût du dispositif est portée par le budget national.
6. Les sites atteignent et maintiennent le niveau Autonome sans intervention répétée.

Chacune de ces conditions est suivie comme un indicateur de la Phase 5.

---

## 25. Conclusion

Le programme dispose déjà de l'instrument central : une application qui consolide chaque semaine la donnée mSupply et calcule, par site, un score de qualité des données. Ce plan ne demande pas de la remplacer. Il demande de lui faire porter une seconde question, opérationnelle : chaque site fait-il vraiment tourner sa gestion de stock sur mSupply, et si non, pourquoi, et qu'a-t-on fait pour l'aider. La réponse tient dans une échelle d'adoption à quatre niveaux, un signal d'attention, une segmentation qui route l'appui, une fiche de supervision d'une page, et un registre d'actions qui donne au dispositif sa mémoire.

L'ambition est nationale et l'horizon est 2030. Le chemin est phasé et honnête sur ses dépendances : rien n'est possible sans une extraction hebdomadaire fiable, et l'échelle nationale suppose que la DAP puisse l'étendre. À l'arrivée, le succès ne se mesure pas au nombre de tableaux de bord, mais au nombre de sites qui utilisent mSupply correctement, s'en servent pour décider, et le font sans nous.

---

# Annexes

## Annexe A : Tableau détaillé des indicateurs

Reprend le tableau de la section 9.2, enrichi par indicateur des éléments suivants, à compléter en Phase 1 :

- **Formule exacte** (référence à la vue de base de données ou au calcul).
- **Valeur de baseline** (mesurée sur les deux premiers cycles).
- **Cible** (fixée sur la distribution observée, révisée annuellement).
- **Règle de désagrégation** (site, programme, district, région).
- **Responsable de la mesure** et **responsable de l'action**.
- **Rattachement** à la ou aux dimensions de la section 8.

## Annexe B : Gabarit de fiche de supervision trimestrielle (1 page)

**En-tête** : district, site, date de visite, nom du point focal, nom du gestionnaire de stock présent.

**1. Accès et environnement** (cases à cocher)
- Poste fonctionnel : oui / non
- Connexion utilisable : oui / non / intermittente
- Compte mSupply actif : oui / non
- Gestionnaire de stock formé en poste : oui / non · si changement depuis la dernière visite : date, passation faite oui / non

**2. Barrières observées** (checklist, cocher ce qui s'applique)
Manque de compétence · manque de confiance · absence de motivation · bénéfice mal compris · surcharge de travail · problème technique ou connectivité · équipement · changement de personnel · supervision insuffisante · absence de responsabilisation · registre papier parallèle · préférence pour les anciennes pratiques · manque de feedback

**3. Niveau perçu** (appréciation du point focal, à confronter au niveau calculé par l'application)
Actif · Régulier · Fiable · Autonome
Le site consulte-t-il les données mSupply pour ses décisions de commande : jamais / parfois / systématiquement

**4. Actions**
- Suivi des actions du trimestre précédent : référence, statut (clôturée / en cours / sans effet), commentaire
- Nouvelle(s) action(s) convenue(s) : description, cause visée, responsable, échéance

**Signature** : point focal, responsable du site.

## Annexe C : Gabarit du registre des actions correctives

Une ligne par action. Colonnes :

| Champ | Contenu |
|---|---|
| Identifiant | Numéro séquentiel |
| Site | Nom et identifiant |
| District / région | |
| Date de détection | |
| Problème | Description courte |
| Indicateur déclencheur | Numéro de l'indicateur (section 9) ou observation de supervision |
| Cause identifiée | Référence à la matrice de la section 13 |
| Action décidée | Description |
| Responsable | Nom et fonction |
| Échéance | Date |
| Statut | Ouverte / en cours / en retard / clôturée / escaladée |
| Résultat attendu | Ce que l'indicateur devrait montrer |
| Résultat obtenu | Valeur constatée à la vérification |
| Vérification | Date et mode (cycle de mesure, visite) |
| Historique | Lien vers les actions passées du même site sur la même cause |

## Annexe D : Matrice RACI complète

Reprend la section 16.2. À compléter en Phase 1 avec les noms des titulaires et la confirmation de la répartition PSP-CI / DAP / coordination (*Information à confirmer*).

## Annexe E : Mapping dimension vers donnée disponible

| Dimension (section 8) | Sous-élément | Donnée / source | Statut |
|---|---|---|---|
| A. Disponibilité | Accès système, connexion, équipement, compte | Fiche de supervision | Supervision |
| B. Utilisation | Fréquence des transactions | Jeu Transactions | Existe |
| B. Utilisation | Régularité | Vue P3 | Existe |
| B. Utilisation | Fraîcheur | Transactions + date d'extraction | À améliorer (calcul à exposer) |
| C. Qualité | Complétude | Vue P1 | Existe |
| C. Qualité | Promptitude | Vue P2 | Existe |
| C. Qualité | Conformité, concordance | Vues P4, P5 | Existe |
| C. Qualité | Ajustements | Vue P6 | Existe |
| D. Fonctionnelle | Réquisition, réception, dispensation, inventaire, ajustement | Transactions, natures dérivées | Existe |
| D. Fonctionnelle | Mode magasin / dispensaire | Champ mode des transactions | Exploitable immédiatement |
| D. Fonctionnelle | Commandes fournisseur, transferts, prévisions, rapports | (non extrait) | Évolution proposée |
| E. Comportement | Saisie en bloc, recours aux ajustements | Dates de saisie, vue P6 | Inférence de donnée |
| E. Comportement | Contournement, résistance, autonomie | Fiche de supervision | Supervision |
| F. Capacité | Maîtrise, coaching, erreurs récurrentes | Fiche de supervision | Supervision |
| F. Capacité | Turnover | Fiche de supervision | Supervision · *Information à confirmer* pour une donnée automatique |
| G. Organisationnel | Supervision, leadership, responsabilisation, processus | Fiche de supervision | Supervision |
| H. Pérennisation | Niveau tenu sans action ouverte | Application (niveau + registre) | À améliorer |
| H. Pérennisation | Résolution autonome des problèmes | Fiche de supervision | Supervision |

## Annexe F : Glossaire

| Terme | Définition |
|---|---|
| **Site** | Un magasin mSupply du réseau, unité d'analyse et d'intervention du plan. Remplace « structure » et « utilisateur » du cadrage initial : le suivi porte sur la fonction de gestion de stock du site, pas sur un agent nommé. |
| **Périmètre de suivi** | Ensemble des sites dont les données sont extraites et suivis par l'application (40 à ce jour). Les critères d'entrée et de sortie sont fixés par la coordination. |
| **Mois PAQD** | Le mois calendaire sur lequel portent l'extraction et le calcul des scores. |
| **Cycle PAQD** | Quatre mois consécutifs. Trois cycles par an calés sur l'année civile. |
| **Mois clos / mois en cours** | Un mois est clos une fois passée l'échéance de réquisition la plus tardive (environ le 10 du mois suivant) : son score devient définitif. Avant, il est en cours et son score est provisoire. |
| **Pilier PAQD** | Une des six composantes du score de qualité des données : P1 complétude, P2 promptitude, P3 régularité de saisie, P4 taux de conformité, P5 concordance physique / théorique, P6 ratio d'ajustements. |
| **Score composite PAQD** | Note sur 100 d'un site, moyenne pondérée des six piliers. Classification : CONFORME (90 et plus), PARTIELLEMENT CONFORME (75 à 89), NON CONFORME (moins de 75). C'est le **verdict de qualité des données**. |
| **Axe adoption** | Lecture de la donnée d'import orientée « le site utilise-t-il réellement mSupply » : s'appuie sur P1, P2, P3 et la fraîcheur. |
| **Axe qualité des données** | Lecture orientée « les données saisies sont-elles fiables » : le score composite PAQD et ses piliers P4, P5, P6. |
| **Niveau d'adoption** | État d'un site sur l'échelle opérationnelle : Actif, Régulier, Fiable, Autonome. |
| **Signal** | Statut d'attention d'un site : Vert, Orange, Rouge. Orthogonal au niveau (l'un dit l'état, l'autre l'urgence). Distinct de la classification qualité PAQD. |
| **Segment** | Catégorie de routage de l'appui : Performer, À risque, Faible usage, Non-utilisateur, Nouveau. Dérivée du niveau, du signal et de l'ancienneté. |
| **Fraîcheur** | Nombre de jours entre la dernière transaction saisie par un site et la date de l'extraction. |
| **Fiche de supervision** | Instrument trimestriel d'une page, rempli par le point focal district pendant la visite de supervision. |
| **Registre des actions correctives** | Journal des interventions (une ligne par action, du problème à la vérification). Interim : tableur. Cible : module de l'application. |
| **Point focal district** | Agent de district (un par district) chargé du suivi de terrain des sites de son ressort. |
| **Grille de paramètres** | Jeu daté des poids de pilier et des seuils de sous-composante, administré dans l'application, effectif au cycle suivant seulement. |

*Note de gestion du modèle :* si le plan est adopté, les termes **niveau d'adoption**, **signal**, **segment** et **fraîcheur** deviendront des concepts de l'application et devront être ajoutés au glossaire technique du produit (`CONTEXT.md`) au moment de leur implémentation.

## Annexe G : Cible détaillée des huit tableaux de bord

Le cadrage initial envisageait huit tableaux de bord. Le plan en retient cinq (section 18). Correspondance et cible :

| Tableau de bord envisagé | Traitement dans le plan |
|---|---|
| 1. Executive (vue nationale) | Tableau de bord 1 (Exécutif) |
| 2. Performance des structures (classement, segmentation) | Tableau de bord 2 (Performance & segmentation) |
| 3. Adoption (évolution de l'utilisation) | Tableau de bord 3 (Adoption & tendance) |
| 4. Alertes (structures à intervenir) | Tableau de bord 4 (Alertes & actions) · *évolution proposée* |
| 5. Fonctionnalités (usage des fonctions mSupply) | Intégré partiellement au tableau de bord 3 pour les cinq natures observées ; le reste est une *évolution proposée* conditionnée à l'extension de l'extraction |
| 6. Qualité des données (fraîcheur, complétude, cohérence, anomalies) | Tableau de bord 5 (Qualité des données) |
| 7. Actions correctives (ouvertes, en cours, en retard, clôturées) | Intégré au tableau de bord 4 (Alertes & actions) |
| 8. Impact des interventions (avant / après) | Non tableau de bord permanent : traité en revue semestrielle (section 19), sur la base du registre et de l'historique |

---

*Fin du document.*
