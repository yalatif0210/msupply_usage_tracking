# 06: Revue de la série : clôtures, sanctions et historique figé

**What to build:** les corrections de la revue de code du 2026-11-05 sur la
série. Une clôture sans traceur n'est pas une clôture ; une ouverture et une
clôture sans produit commun sanctionnent la conformité consommation ; un mois
n'est jugé qu'une fois sa fenêtre de clôture et une marge de 3 jours couvertes
par les imports. L'historique fige les notes, les sanctions et les
dénominateurs : la fiche site déplie un calcul qui redonne exactement le score
gelé. Le stock se lit par code produit (un code = un produit). L'écran de la
grille valide la saisie avec le schéma de l'API ; les écrans de lecture
prennent fenêtre et bornes dans la grille.

**Blocked by:** 01, 02, 03, 04, 05

**Status:** done

- [x] Migration 0061 : stocks par code produit, chaque article gardant son
  dernier compte ; entrées et sorties autres que factures et dispensations.
- [x] Migration 0062 : `mv_inventaire_mois`, `mv_cloture_mois` (causes),
  P4 / P5 / score réécrits sur la grille, marge de jugement, note de sanction
  sous 100, historique des notes et sanctions, purge des lignes devenues non
  calculées (sauf site sorti du périmètre), synthèse limitée aux
  sous-composantes retenues, fonctions mortes supprimées.
- [x] Un site sans aucune activité du mois reste « sans mesure ».
- [x] API : paramètres validés par le contrat (400, jamais 500) ; contrainte
  de la base traduite en 400 ; fiche produit sur la période ouverture → clôture ;
  détail P4 trié sur la conformité consommation ; règles du mois servies au
  tableau de bord.
- [x] Front : méthode de calcul chargée à l'ouverture, sans course entre
  réponses ; bornes et fenêtre lues dans la grille ; reconstituée ≤ 0 en non
  conforme ; validation de la grille en français ; marge éditable.
- [x] Tests : chaque nouvelle règle (sans traceur, sans produit commun, marge,
  imports contigus, M = 0, même jour, note 40 sur P5 et au grain programme,
  purge, calendrier) ; validation 400 ; module de règles et d'erreurs du front.
- [x] Docs : ADR 0022 complété, ADR 0012 / 0014 / 0016, CONTEXT.md, guides,
  manuel, `CLAUDE.md` §5 (valeurs de la grille v1, règles dans la grille).
- [x] Jeu de démonstration aligné : réceptions en factures finalisées
  (ADR 0018), fenêtre d'extraction sur chaque lot ; il redonne l'exemple du
  manuel (CHR de Daloa, août : 75, PARTIELLEMENT CONFORME).

## Comments

Décisions prises avec l'utilisateur (2026-11-05) :

- Programme éligible sans clôture : sanction, même sans traceur (règle
  conservée, inscrite dans l'ADR 0022).
- Clôture sans traceur : sanction.
- Marge de jugement : 3 jours, paramètre de la grille.
- Qualification des absences : toutes les entrées et sorties enregistrées.
