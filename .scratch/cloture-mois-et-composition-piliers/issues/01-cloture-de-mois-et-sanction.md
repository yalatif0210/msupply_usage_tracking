# 01: Clôture de mois et sanction (P4, P5)

**What to build:** P4 et P5 ne reposent plus que sur les inventaires de
clôture. Le mois n est clôturé par le dernier inventaire fait dans les 3
derniers jours de n ou le 1er de n+1 ; son ouverture est la clôture retenue de
n-1. Sans clôture, P4 et P5 valent 0 ; sans ouverture, P4 vaut 0 et P5 est
calculé. Tant que les données ne couvrent pas le 1er de n+1, le mois est non
calculable. P2 ne change pas.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] ADR 0022 rédigée (amende les ADR 0012 et 0014).
- [x] Migration : inventaire de clôture, ouverture, sanction ; vues P4, P5 et score recréées.
- [x] Un inventaire hors fenêtre ne compte ni pour P4 ni pour P5.
- [x] Tests : dernier jour, 1er de n+1, 4e jour avant la fin, deux inventaires dans la fenêtre, ouverture manquante, clôture manquante, mois non couvert.
- [x] Fiche site : raison de la sanction affichée (pas de clôture, pas d'ouverture).
- [x] Manuel, guide et CONTEXT.md à jour.

## Comments

- Le mois est jugé quand les fenêtres des imports validés couvrent toute sa
  fenêtre de clôture, début compris : une ouverture antérieure au début des
  données n'est pas sanctionnée.
- Tant que le ticket 02 n'a pas retiré l'écart SDU de P4, un site sans
  ouverture a P4 = moyenne (SDU, 0), pas 0.
