# Registre visuel d'une console d'administration (famille StarAdmin)

**Contexte.** Le `DESIGN_SYSTEM.md` initial visait un « outil de pilotage
institutionnel sobre » : palette navy sur blanc cassé, bandeau horizontal
unique, pas de librairie tierce. En cours de projet la coordination a demandé
un registre de vraie **console d'administration**, en prenant pour référence le
template StarAdmin : schéma chromatique bleu, coquille à deux barres
horizontales, page d'accueil transformée en tableau de bord dense.

**Décision.** On adopte le **schéma de couleurs** de la famille StarAdmin
(bleu franc `#1f6fd6` en accent, fond clair froid `#f1f4f9`, surfaces
blanches, texte slate `#1f2733`) et une **coquille à deux barres** (barre de
titre + compte ; barre de navigation de sections), **sans barre latérale**.
Les valeurs sont **recréées en jetons CSS maison** dans `styles.css` ; aucun
fichier SCSS, police, icône ou illustration du template n'entre dans le dépôt.
Les couleurs de statut (CONFORME / ALERTE / …) restent calibrées pour la
projection et ne suivent pas la palette du template. Les graphes restent en
SVG inline maison, sans librairie. `DESIGN_SYSTEM.md` est réécrit en
conséquence.

**Pourquoi.** Le tableau de bord est projeté en réunion : le public attend le
registre familier d'un outil d'administration, pas celui d'un rapport. Le
bénéfice (lisibilité de la navigation quand les sections se multiplient,
densité de la page d'accueil) est réel. Le coût — rompre avec le design system
d'origine — est assumé et circonscrit : on emprunte un schéma chromatique et
un patron de mise en page, pas une stack. Cloner le template à l'identique
(Angular 7, Bootstrap 4, jQuery, chart.js) aurait imposé une régression
technique lourde à une application Angular 20 zoneless, pour un gain esthétique
marginal.

**Conséquence.** Toute couleur passe par un `var(--jeton)` ; aucune valeur
hexadécimale en dur dans un composant. `ui/coquille` est le seul point d'entrée
de la navigation. La barre latérale colorée du template n'est pas reprise : la
couleur de marque passe sur la barre 1. Les tranches suivantes feront de `/` un
tableau de bord national et déplaceront la liste des sites sur `/sites`. La
règle « aucun tiret long » et le patron des deux barres sont désormais dans
`DESIGN_SYSTEM.md`.
