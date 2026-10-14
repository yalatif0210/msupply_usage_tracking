## RÔLE

Agis comme un **expert senior en changement de comportement, adoption des technologies numériques, digital health, supply chain management et suivi-évaluation des programmes de santé publique**, ayant une expérience des projets financés par des bailleurs internationaux, notamment le **Département d’État des États-Unis**.

Tu maîtrises notamment :

* les stratégies d'adoption et de pérennisation des outils numériques ;
* le changement de comportement organisationnel ;
* le suivi de l'utilisation réelle des systèmes d'information ;
* les approches de performance management ;
* les systèmes nationaux de gestion des stocks de produits de santé ;
* le renforcement des capacités et le coaching des utilisateurs ;
* les approches de suivi-évaluation orientées vers l'utilisation des données ;
* les principes de redevabilité, traçabilité et gestion axée sur les résultats des projets financés par des bailleurs internationaux.

---

## CONTEXTE

Dans le cadre d'un projet de santé publique financé par le **Département d'État des États-Unis**, nous devons élaborer un **Plan de suivi de l'utilisation de mSupply**.

mSupply est utilisé comme système de gestion des stocks de produits de santé au niveau décentralisé.

L'objectif du plan ne doit cependant pas être limité à mesurer si les utilisateurs « utilisent ou n'utilisent pas » mSupply.

Il doit permettre de comprendre et de piloter :

1. **l'adoption de mSupply** ;
2. **la régularité de son utilisation** ;
3. **la qualité des transactions et des données saisies** ;
4. **l'utilisation effective des fonctionnalités essentielles** ;
5. **les comportements des utilisateurs face au système** ;
6. **les facteurs qui favorisent ou empêchent son utilisation** ;
7. **la capacité des structures à maintenir une utilisation régulière sans assistance externe** ;
8. **l'effet du niveau d'utilisation de mSupply sur la qualité de la gestion des stocks**.

Nous disposons par ailleurs d'une **application de suivi et de monitoring de l'utilisation de mSupply** (celle que tu viens de coder).

Je souhaite faire de cette application **l'épine dorsale opérationnelle du Plan de suivi**.

L'application ne doit donc pas être présentée comme un simple tableau de bord de reporting. Elle doit être conçue conceptuellement comme le **système central permettant de détecter, analyser, prioriser, suivre et documenter les problèmes d'utilisation de mSupply et les actions correctives associées**.

---

# MISSION

À partir de ce contexte, conçois un **Plan de suivi de l'utilisation de mSupply complet, professionnel, réaliste et directement exploitable par une équipe de projet**.

Le plan doit être construit autour d'une logique :

**DONNÉES D'UTILISATION → ANALYSE DES COMPORTEMENTS → IDENTIFICATION DES BARRIÈRES → ACTION CORRECTIVE → SUIVI → AMÉLIORATION DE L'ADOPTION**

L'application de monitoring doit être au centre de cette boucle.

---

# 1. COMMENCE PAR LE CADRE CONCEPTUEL

Avant de proposer les activités, explique clairement :

### 1.1. Le problème de fond

Pourquoi mesurer uniquement le « taux d'utilisation » de mSupply est insuffisant.

Distingue notamment :

* accès au système ;
* utilisation ;
* utilisation régulière ;
* utilisation correcte ;
* utilisation complète des fonctionnalités ;
* qualité des données ;
* utilisation des données pour la prise de décision ;
* appropriation durable du système.

### 1.2. Le modèle d'adoption

Propose un modèle permettant de représenter le parcours d'une structure/utilisateur :

**Accès → Première utilisation → Utilisation régulière → Utilisation correcte → Maîtrise → Appropriation → Pérennisation**

Explique pour chaque niveau :

* ce que l'on cherche à observer ;
* comment le mesurer ;
* quel comportement attendu ;
* quel risque existe lorsque le niveau n'est pas atteint ;
* quelle intervention peut être déclenchée.

---

# 2. CONÇOIS UN CADRE DE SUIVI MULTIDIMENSIONNEL

Ne limite pas le plan à un seul indicateur.

Propose un cadre structuré autour de plusieurs dimensions, par exemple :

### A. Disponibilité / Accessibilité

* accès au système ;
* connectivité ;
* disponibilité des équipements ;
* disponibilité du compte utilisateur.

### B. Utilisation

* fréquence de connexion ;
* fréquence des transactions ;
* régularité ;
* fraîcheur des données.

### C. Qualité d'utilisation

* complétude ;
* cohérence ;
* exactitude ;
* respect des processus ;
* anomalies.

### D. Utilisation fonctionnelle

Analyse les principales fonctionnalités de mSupply et identifie celles dont l'utilisation doit être suivie.

### E. Comportement utilisateur

* habitudes ;
* contournement du système ;
* dépendance à un autre support ;
* résistance ;
* appropriation ;
* autonomie.

### F. Capacité / Compétence

* niveau de maîtrise ;
* besoins de coaching ;
* erreurs récurrentes ;
* nouveaux utilisateurs ;
* turnover.

### G. Environnement organisationnel

* supervision ;
* leadership ;
* organisation du travail ;
* disponibilité du personnel ;
* responsabilisation ;
* processus internes.

### H. Pérennisation

* capacité à utiliser mSupply sans appui externe ;
* maintien des pratiques ;
* capacité à résoudre les problèmes ;
* institutionnalisation de l'utilisation.

Tu peux ajouter ou supprimer des dimensions si ton analyse démontre qu'une autre structuration est plus pertinente.

---

# 3. FAIS DE L'APPLICATION LE CENTRE DU PLAN

Décris précisément comment l'application doit soutenir le plan de suivi.

Je veux que tu définisses son rôle dans chacune des étapes suivantes :

**Collecter → Consolider → Analyser → Détecter → Alerter → Prioriser → Agir → Vérifier → Documenter**

Pour chaque étape, précise :

* les données nécessaires ;
* la source des données ;
* le rôle de l'application ;
* l'utilisateur concerné ;
* le résultat attendu.

L'application doit notamment permettre de distinguer :

### GREEN

Utilisation satisfaisante.

### AMBER

Signes de dégradation ou risque d'abandon nécessitant une attention.

### RED

Sous-utilisation, mauvaise utilisation ou problème critique nécessitant une intervention.

Propose une logique de **scoring et de classification des structures**, sans inventer de seuils arbitraires : lorsqu'un seuil doit être défini, propose une méthode permettant de le déterminer à partir des données historiques, des exigences du programme et des objectifs nationaux.

---

# 4. PASSE D'UN MONITORING DESCRIPTIF À UN MONITORING ACTIONNABLE

Le plan ne doit pas simplement produire des statistiques.

Pour chaque indicateur important, réponds à la question :

> **« Si cet indicateur se dégrade, qu'est-ce que l'équipe doit faire ? »**

Construis donc une logique :

**Indicateur → Seuil/Signal → Diagnostic → Cause probable → Action → Responsable → Délai → Vérification**

Propose un système de suivi des actions correctives.

Exemple conceptuel :

**Baisse de la fraîcheur des données**
→ détection automatique
→ identification de la structure
→ analyse de l'historique
→ diagnostic de la cause
→ coaching/appui technique
→ échéance
→ nouvelle mesure
→ clôture ou escalade.

---

# 5. INTÈGRE UNE APPROCHE DE CHANGEMENT DE COMPORTEMENT

Le plan doit aller au-delà de la formation.

Analyse les différentes causes possibles de la sous-utilisation de mSupply :

* manque de compétence ;
* manque de confiance ;
* absence de motivation ;
* mauvaise compréhension du bénéfice ;
* surcharge de travail ;
* problèmes techniques ;
* connectivité ;
* équipements ;
* changement de personnel ;
* supervision insuffisante ;
* absence de responsabilisation ;
* processus parallèles ;
* préférence pour les anciennes pratiques ;
* manque de feedback ;
* absence de conséquences liées à la non-utilisation.

Construis une **matrice Barrière → Cause → Intervention → Responsable → Indicateur de succès**.

Les interventions doivent pouvoir inclure :

* formation ;
* coaching ;
* supervision ;
* accompagnement ciblé ;
* support technique ;
* rappel ;
* communication ;
* démonstration de la valeur ajoutée ;
* responsabilisation managériale ;
* analyse des performances ;
* partage des bonnes pratiques.

---

# 6. CONÇOIS UNE STRATÉGIE DE SEGMENTATION

Toutes les structures ne doivent pas recevoir le même niveau d'accompagnement.

Propose une segmentation des structures/utilisateurs selon leur niveau de performance et leur comportement.

Par exemple :

* **Performers** : utilisation élevée et durable ;
* **At risk** : utilisation correcte mais tendance à la baisse ;
* **Low users** : utilisation insuffisante ;
* **Non-users** : absence ou quasi-absence d'utilisation ;
* **New users** : nouveaux utilisateurs nécessitant un accompagnement rapproché.

Pour chaque segment, propose :

* niveau de surveillance ;
* fréquence de suivi ;
* type d'intervention ;
* responsable ;
* mode d'escalade.

---

# 7. DÉFINIS LES INDICATEURS

Propose un **cadre d'indicateurs SMART**, avec au minimum :

| Indicateur | Définition | Méthode de calcul | Source | Fréquence | Désagrégation | Seuil/Signal | Action déclenchée |
| ---------- | ---------- | ----------------- | ------ | --------- | ------------- | ------------ | ----------------- |

Les indicateurs doivent couvrir :

* utilisation ;
* fréquence ;
* fraîcheur ;
* complétude ;
* performance ;
* fonctionnalités ;
* qualité ;
* autonomie ;
* évolution dans le temps ;
* efficacité des interventions.

Distingue clairement :

**KPI de résultat**, **KPI de comportement**, **KPI de processus** et **KPI d'alerte**.

---

# 8. DÉFINIS LA GOUVERNANCE DU SUIVI

Décris qui fait quoi entre :

* équipe projet ;
* responsables régionaux ;
* responsables de district ;
* gestionnaires de stock ;
* superviseurs ;
* support technique ;
* responsables mSupply ;
* management.

Construis une matrice **RACI** pour les principales activités du plan.

---

# 9. CONÇOIS LE CYCLE DE SUIVI

Propose un cycle opérationnel réaliste :

### Quotidien

Détection automatique des signaux critiques.

### Hebdomadaire

Analyse des anomalies et des structures à risque.

### Mensuel

Revue de performance et suivi des actions correctives.

### Trimestriel

Analyse des tendances, comportements et progrès.

### Semestriel / annuel

Évaluation de l'adoption et de la pérennisation.

Adapte ces fréquences si une meilleure logique est justifiée.

---

# 10. DÉFINIS LES TABLEAUX DE BORD

Propose les tableaux de bord nécessaires dans l'application.

Au minimum :

### Dashboard 1 — Executive

Vue nationale/projet.

### Dashboard 2 — Performance des structures

Classement et segmentation.

### Dashboard 3 — Adoption

Évolution de l'utilisation.

### Dashboard 4 — Alertes

Structures nécessitant une intervention.

### Dashboard 5 — Fonctionnalités

Utilisation des principales fonctionnalités de mSupply.

### Dashboard 6 — Qualité des données

Fraîcheur, complétude, cohérence, anomalies.

### Dashboard 7 — Actions correctives

Actions ouvertes, en cours, en retard, clôturées.

### Dashboard 8 — Impact des interventions

Avant/après intervention.

Pour chaque dashboard, indique :

* audience ;
* objectif ;
* indicateurs ;
* visualisations ;
* décision attendue.

---

# 11. PROPOSE UNE MATRICE DE SUIVI DES ACTIONS

Conçois un mécanisme permettant de suivre chaque intervention :

| Structure | Problème | Cause | Action | Responsable | Date | Statut | Résultat attendu | Résultat obtenu | Vérification |

L'application doit permettre de conserver l'historique des interventions afin d'éviter de recommencer indéfiniment les mêmes actions.

---

# 12. DÉFINIS UNE LOGIQUE D'ÉVALUATION DE L'EFFICACITÉ

Le plan doit permettre de répondre à la question :

> **« Nos interventions améliorent-elles réellement l'utilisation de mSupply ? »**

Propose une méthode permettant de comparer :

* situation avant intervention ;
* intervention ;
* situation après intervention ;
* maintien de l'amélioration dans le temps.

Propose des indicateurs tels que :

* variation de la fréquence d'utilisation ;
* amélioration de la fraîcheur ;
* amélioration de la complétude ;
* réduction des anomalies ;
* réduction du nombre de structures à risque ;
* taux de maintien de l'amélioration.

Ne prétends pas mesurer un impact causal si les données disponibles ne permettent pas de le démontrer.

---

# 13. INTÈGRE LA DIMENSION "DATA FOR DECISION"

Le suivi ne doit pas uniquement mesurer l'utilisation de mSupply.

Il doit progressivement permettre de déterminer si les données générées par mSupply sont **utilisées pour améliorer la gestion des stocks et la prise de décision**.

Propose donc une évolution du monitoring :

**Utilisation du système**
→ **Qualité des données**
→ **Confiance dans les données**
→ **Utilisation des données**
→ **Décisions basées sur les données**
→ **Amélioration de la performance de la chaîne d'approvisionnement**

Explique comment cette progression pourrait être mesurée.

---

# 14. PRODUIS UN PLAN OPÉRATIONNEL

À partir de toute l'analyse, construis un plan opérationnel comprenant :

| Activité | Objectif | Méthode | Responsable | Fréquence | Outil | Livrable | KPI |
| -------- | -------- | ------- | ----------- | --------- | ----- | -------- | --- |

Le plan doit être suffisamment concret pour pouvoir être présenté au chef de projet et utilisé par l'équipe.

---

# 15. PROPOSE UNE FEUILLE DE ROUTE DE MISE EN ŒUVRE

Construis une roadmap en phases :

### Phase 1 — Baseline

Établissement de la situation initiale.

### Phase 2 — Monitoring

Déploiement du suivi systématique.

### Phase 3 — Intervention

Mise en œuvre des actions ciblées.

### Phase 4 — Optimisation

Analyse des tendances et amélioration du dispositif.

### Phase 5 — Pérennisation

Institutionnalisation du suivi et réduction de la dépendance au projet.

Pour chaque phase, définis :

* activités ;
* résultats attendus ;
* indicateurs ;
* responsables ;
* prérequis.

---

# 16. PRINCIPES À RESPECTER

Respecte impérativement les principes suivants :

1. **Ne pas confondre formation et adoption.**
2. **Ne pas confondre connexion et utilisation réelle.**
3. **Ne pas confondre utilisation et utilisation correcte.**
4. **Ne pas considérer les utilisateurs comme un groupe homogène.**
5. **Ne pas produire d'indicateurs sans définir les décisions qu'ils doivent permettre de prendre.**
6. **Ne pas multiplier inutilement les indicateurs.**
7. **Privilégier les données automatiquement disponibles dans mSupply et dans l'application de monitoring.**
8. **Minimiser la collecte manuelle supplémentaire.**
9. **Faire du monitoring un mécanisme d'action et non uniquement de reporting.**
10. **Documenter les interventions et leur résultat.**
11. **Privilégier l'amélioration continue à une logique punitive.**
12. **Intégrer progressivement la pérennisation dans le dispositif.**

---

# 17. LIVRABLE FINAL ATTENDU

Rédige le document comme un **véritable Plan de suivi de l'utilisation de mSupply**, destiné à être présenté à la direction du projet et, si nécessaire, au bailleur.

Structure le document de manière professionnelle :

1. Résumé exécutif
2. Contexte et justification
3. Problématique
4. Objectif général
5. Objectifs spécifiques
6. Théorie du changement / modèle d'adoption
7. Cadre conceptuel du suivi
8. Dimensions de suivi
9. Cadre des indicateurs
10. Architecture du système de monitoring
11. Rôle de l'application de suivi
12. Système d'alertes et de segmentation
13. Stratégie de changement de comportement
14. Stratégie d'intervention
15. Suivi des actions correctives
16. Gouvernance et RACI
17. Cycle de suivi
18. Tableaux de bord
19. Évaluation de l'efficacité des interventions
20. Utilisation des données pour la décision
21. Plan opérationnel
22. Feuille de route
23. Risques et mesures d'atténuation
24. Conditions de pérennisation
25. Conclusion

---

## EXIGENCE IMPORTANTE

Ne rédige pas un document générique sur le suivi-évaluation.

Le document doit être **spécifiquement conçu autour de l'utilisation de mSupply et de l'application de monitoring existante**.

Avant de proposer une architecture ou des fonctionnalités supplémentaires, **analyse d'abord ce que l'application existante permet déjà de mesurer et de suivre**.

Si des informations nécessaires sont absentes, indique clairement :

**« Information à confirmer »**

et ne l'invente pas.

Lorsque tu proposes une fonctionnalité qui n'existe probablement pas encore, identifie-la explicitement comme :

**« Évolution proposée »**

Enfin, distingue clairement :

* **ce qui existe déjà ;**
* **ce qui peut être exploité immédiatement ;**
* **ce qui doit être amélioré ;**
* **ce qui constitue une évolution future.**

L'objectif final est de transformer l'application existante en **véritable système de pilotage de l'adoption et de l'utilisation de mSupply**, permettant à l'équipe projet de passer d'un suivi descriptif à un **pilotage comportemental et opérationnel fondé sur les données**.
