# 04: Import du classeur jusqu'au staging + validation + journal

**What to build:** Un utilisateur `coordination` dépose le classeur Excel
hebdomadaire. Le système le lit onglet par onglet (en-têtes ligne 5, données
ligne 6, valeurs lues comme du texte brut), applique toutes les règles de
validation, et soit fait atterrir les lignes d'un classeur propre en `stg_*`
avec le lot marqué « validé », soit le rejette avec un motif et une liste
d'anomalies typées. Rien n'atteint le core. Un `lecteur` ouvre un journal des
imports — une ligne par lot avec sa date, son mois PAQD, son statut et ses
compteurs — et descend dans un lot pour voir ses anomalies. Un `lecteur` ne peut
pas déposer.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] `POST` d'un classeur par un `coordination` renvoie un `ResultatImport` (union discriminée valide/rejeté) ; un `lecteur` reçoit 403.
- [ ] Classeur propre : les lignes de chaque onglet écrites dans le `stg_*` correspondant, lot « validé », réponse portant le lot et les anomalies non bloquantes.
- [ ] Règles bloquantes (gravité `erreur`, rejettent le classeur entier) : écart d'un compteur METADATA ; onglet obligatoire absent ou nom de colonne (ligne 5) modifié ; `mois_paqd` absent / mal formé / dans le futur / hors cycle connu / plus ancien que le mois précédent ; `mois_debut` / `mois_fin` incohérents avec `mois_paqd`.
- [ ] Règles non bloquantes (avertissement, remontées dans les anomalies) : référence croisée non résolue ; date / nombre / booléen mal formé.
- [ ] Les dates saisies en texte `AAAA-MM-JJ` sont lues sans décalage de reconversion Excel.
- [ ] `GET` journal liste les lots (date, mois PAQD, statut, compteurs) ; `GET` anomalies d'un lot liste gravité / onglet / ligne source / code / message.
- [ ] La couche staging n'échoue jamais sur une valeur mal formée — elle la capture.
- [ ] Tests : un cas passant + un cas échouant par règle de validation (couture C) ; aller-retour HTTP sur un classeur de fixture (couture A).
