# DESIGN_SYSTEM.md — Console DQA mSupply

Registre visuel : **console d'administration institutionnelle**, dense en
information, consultée en réunion et **projetée**. Schéma chromatique de la
famille StarAdmin (bleu franc, fond clair froid, surfaces blanches), recréé en
jetons maison (ADR 0006). La lisibilité à distance prime.

Interdits : gradients, ombres portées décoratives, animations gratuites,
iconographie superflue, **tiret long** (voir §6).

Aucune librairie d'UI ni de graphes tierce : HTML + CSS natif, SVG inline.
Angular standalone, `ChangeDetectionStrategy.OnPush`, signals, zoneless. Pas
d'état global : services injectés et signals suffisent.

Palette relevée du dépôt public StarAdmin
(`template/demo_1/src/assets/styles/_variables.scss` : bleu `#00aeef` /
`#128bfc`, fond `#F3F3F3`, bordure `#cdd6dc`) puis retranscrite en jetons
maison ci-dessous. Sa barre latérale colorée n'est pas reprise (aucune
sidebar, cf. §2) ; la couleur de marque passe sur la barre 1.

---

## 1. Couleurs

Jetons CSS définis sur `:root` dans `apps/web/src/styles.css`. Aucune valeur
hexadécimale en dur dans un composant : toujours `var(--jeton)`.

### Chrome

| Jeton | Valeur | Usage |
|---|---|---|
| `--fond` | `#f1f4f9` | arrière-plan général |
| `--surface` | `#ffffff` | cartes, tableaux, barre de navigation |
| `--surface-alt` | `#f7f9fc` | zébrage, remplissages discrets |
| `--texte` | `#1f2733` | corps, chiffres clés |
| `--texte-doux` | `#5b6b7f` | libellés, légendes |
| `--texte-tres-doux` | `#a8b0bd` | repères d'axe, valeurs sans objet |
| `--bordure` | `#d7dee7` | séparateurs, contours de cellule |
| `--accent` | `#1f6fd6` | liens, sélection, onglet actif, fond de la barre 1 |
| `--accent-doux` | `#e8f1fc` | ligne survolée, fond de sélection |
| `--neutre` | `#eceff3` | jauge vide, fond de segment neutre |
| `--sur-accent-*` | blanc translucide | éléments interactifs posés sur la barre 1 |

### Statuts (contraste franc, la couleur jamais seule : toujours doublée d'un libellé)

| Statut | Fond | Texte |
|---|---|---|
| CONFORME | `--conforme-fond` `#e3f1e4` | `--conforme-texte` `#1b5e20` |
| ALERTE | `--alerte-fond` `#fde3e1` | `--alerte-texte` `#8a1c13` |
| NON_CALCULABLE | `--nc-fond` `#ececec` | `--nc-texte` `#4a4a4a` |

Classification de site : CONFORME → vert, PARTIELLEMENT CONFORME →
`--partiel-fond` `#fff3d6` / `--partiel-texte` `#7a5200`, NON CONFORME → rouge.

Ces couleurs de statut sont calibrées pour la projection ; elles ne suivent pas
la palette du template.

## 2. Coquille : deux barres horizontales

`ui/coquille` remplace tout bandeau ad hoc. **Aucune barre latérale.**

- **Barre 1** (texte blanc sur fond `--accent`) : titre à gauche, nom + rôle
  de l'utilisateur et bouton Déconnexion à droite.
- **Barre 2** (surface blanche, bordure basse) : navigation de sections,
  filtrée par rôle. Onglet actif souligné à `--accent`.
- **Aucun sélecteur global** (mois, programme, plage) dans les barres : chaque
  écran porte ses propres filtres dans son `<main>`.
- Écran étroit : les barres s'empilent, la navigation passe à la ligne.

## 3. Typographie

- Police système (`system-ui`), pas de webfont : démarrage instantané.
- Échelle : corps `16px`, libellés `14px`, titres de section `1.6rem`.
- **Chiffres clés généreux** : `2.4rem` minimum, `font-variant-numeric:
  tabular-nums` pour l'alignement en colonne.

## 4. Espacement et grille

- Unité de base `8px` ; marges de carte `16px` ; gouttières `16px`.
- Largeur de contenu max `72rem`, centrée.
- Tableaux : lignes hautes (`44px`), zébrage léger (`--surface-alt`), en-tête
  collant.

## 5. Composants

- **Carte de pilier** : libellé, valeur mesurée en grand, seuil en secondaire,
  badge de statut. Pas de bordure colorée : le badge porte la couleur.
- **Badge de statut** : pastille + libellé texte, coins à `4px`, jamais rond.
- **Badge « n piliers sur 6 »** : neutre, discret, visible tant que la
  couverture est partielle.
- **Graphes** : SVG inline, sans librairie. Courbe de progression, radar
  (taux d'atteinte du seuil), barre de répartition. Couleur toujours doublée
  d'une légende ou d'un libellé.
- **État vide** : phrase explicite (« Aucun import n'a encore été traité pour
  ce site »), jamais une page en erreur ni un tableau vide muet.

## 6. Ponctuation

**Aucun tiret long dans la console** : ni cadratin `—` (U+2014), ni
demi-cadratin `–` (U+2013), ni signe moins typographique `−` (U+2212). Un test
de garde (`apps/web/src/app/typographie.test.ts`) échoue s'il en réapparaît.

| Cas | Remplacement |
|---|---|
| Valeur absente (`{{ x ?? … }}`) | `n/d` (`VALEUR_ABSENTE`) |
| Grandeur sans objet (tolérance d'une sous-composante qui n'en porte pas) | `s/o` (`SANS_OBJET`) |
| Séparateur de titre (« P1 … Complétude ») | point médian `·` |
| Apposition en ligne | deux-points |
| Delta négatif | trait d'union `-3 pts` (la couleur porte le sens) |

Pas de référence à un numéro d'ADR ou de décision dans les textes d'écran.
