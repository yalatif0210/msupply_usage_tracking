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

**Status:** done (commit 901b3f6)

- [x] `POST /api/imports` par `coordination` renvoie un `ResultatImport` (union discriminée) ; `lecteur` → 403.
- [x] Classeur propre : lignes écrites dans chaque `stg_*`, lot « validé » (mois PAQD figé), réponse portant le lot et les avertissements.
- [x] Règles bloquantes : compteur METADATA (R1) ; onglet / colonne manquants (R2) ; `mois_paqd` mal formé, futur, trop ancien (R3) ; `mois_debut`/`mois_fin` incohérents avec cycle + rang (R4).
- [x] Règles non bloquantes : référence croisée (R5) ; date / nombre / booléen mal formés (R6) ; `nature` hors vocabulaire (R7) ; champ requis vide.
- [x] Lecture `.xlsx` sans dépendance lourde (fflate) ; valeurs lues en texte brut, dates `AAAA-MM-JJ` sans reconversion.
- [x] `GET /api/imports` (lots : date, mois, statut, compteurs) ; `GET /api/imports/:id/anomalies` (gravité, onglet, ligne source, code, message). Front : écran journal.
- [x] Staging n'échoue jamais sur une valeur mal formée (null si vide, texte sinon) ; les avertissements n'empêchent pas le staging.
- [x] 23 tests : 18 de validation (couture C, cas passant + échouant par règle), 5 e2e (couture A).
