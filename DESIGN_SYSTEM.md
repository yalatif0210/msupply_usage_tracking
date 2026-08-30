# DESIGN_SYSTEM.md — Tableau de bord DQA mSupply

Registre visuel : **outil de pilotage institutionnel**, dense en information,
sobre. Le tableau de bord est consulté en réunion et **projeté** : la lisibilité
à distance prime sur l'esthétique.

Interdits : gradients, ombres portées décoratives, animations gratuites,
iconographie superflue.

---

## 1. Couleurs

Palette restreinte, forte séparation figure / fond.

| Rôle | Valeur | Usage |
|---|---|---|
| Fond page | `#f7f7f5` | arrière-plan général |
| Surface | `#ffffff` | cartes, tableaux |
| Texte principal | `#1a1a1a` | corps, chiffres clés |
| Texte secondaire | `#5b5b5b` | libellés, légendes |
| Bordure | `#d9d9d6` | séparateurs, contours de cellule |
| Accent | `#1f3d7a` | en-têtes, liens, sélection |

**Statuts** (contrastes francs, jamais la couleur seule — toujours doublée d'un
libellé) :

| Statut | Fond | Texte |
|---|---|---|
| CONFORME | `#e3f1e4` | `#1b5e20` |
| ALERTE | `#fde3e1` | `#8a1c13` |
| NON_CALCULABLE | `#ececec` | `#4a4a4a` |

Classification de site : CONFORME → vert, PARTIELLEMENT CONFORME → ambre
(`#fff3d6` / `#7a5200`), NON CONFORME → rouge.

## 2. Typographie

- Police système (`system-ui`), pas de webfont : démarrage instantané, rendu
  homogène sur les postes de la mission.
- Échelle : corps `16px`, libellés `14px`, titres de section `20px` / `1.6rem`.
- **Chiffres clés généreux** : `2.4rem` minimum, `font-variant-numeric:
  tabular-nums` pour l'alignement en colonne.

## 3. Espacement et grille

- Unité de base `8px` ; marges de carte `16px` ; gouttières `16px`.
- Largeur de contenu max `72rem`, centrée.
- Tableaux : lignes hautes (`44px`), zébrage léger, en-tête collant.

## 4. Composants

- **Carte de pilier** : libellé, valeur mesurée en grand, seuil en secondaire,
  badge de statut. Pas de bordure colorée — le badge porte la couleur.
- **Badge de statut** : pastille + libellé texte, coins à `4px`, jamais rond.
- **Badge « n piliers sur 6 »** : neutre, discret, toujours visible tant que la
  couverture est partielle.
- **État vide** : phrase explicite (« Aucun import n'a encore été traité pour ce
  site »), jamais une page en erreur ni un tableau vide muet.

## 5. Angular

- Composants `standalone`, `ChangeDetectionStrategy.OnPush`, signals pour l'état
  local. Détection de changement **zoneless**.
- Pas de librairie d'UI tierce en V1 : HTML + CSS natif suffisent au registre
  visé.
- Pas d'état global : services injectés + signals.
