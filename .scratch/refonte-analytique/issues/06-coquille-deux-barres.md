# 06: Coquille à deux barres en remplacement de `ui/entete`

**What to build:** remplacer le bandeau horizontal `<dqa-entete>` par une
coquille à deux barres horizontales, sans sidebar.

**Blocked by:** 05

**Status:** done (fusionné dans master)

## Comments

- Répartition des deux barres confirmée pendant le grilling (Q7, Q20 :
  « Barre 1 : titre + compte ; Barre 2 : nav ; aucun sélecteur de mois dans
  les barres ») et cohérente avec la capture du template (navbar haute +
  sous-barre de sections).
- Barre 1 en fond `--accent` (la sidebar colorée du template n'étant pas
  reprise, la couleur de marque y passe).
- Libellés de la barre 2 : « Sites » (→ `/`), « Synthèse », « Imports ». Les
  libellés « Tableau de bord » / « Sites » (→ `/sites`) arrivent avec le
  ticket 08 (routes créées à ce moment) ; « Synthèse » reste le nom de la
  page, la tranche 10 y ajoute l'onglet sous-composantes.
- `journal-imports` : lien de retour redondant retiré (la coquille porte la
  nav).

- [ ] Nouveau composant coquille (standalone, OnPush) remplaçant `ui/entete`
      sur toutes les pages.
  - Barre 1 : titre à gauche ; nom utilisateur + rôle + bouton Déconnexion à
    droite.
  - Barre 2 : navigation de sections — Tableau de bord (`/`), Sites
    (`/sites`), Sous-composantes (`/synthese`, onglet ou route), Imports
    (`/imports`), puis Traceurs (coordination, admin), Grille (coordination),
    Comptes (admin). Même filtrage par rôle que l'actuel `entete`.
- [ ] Aucune barre latérale. Aucun sélecteur global (mois, programme, plage)
      dans les barres.
- [ ] Repli lisible sur écran étroit (barres qui s'empilent ou nav qui passe
      en menu).
- [ ] Supprimer `ui/entete` et mettre à jour tous les imports (`liste-sites`,
      `detail-site`, `synthese`, `journal-imports`, `admin-*`).
- [ ] La répartition exacte des deux barres est confirmée visuellement au
      démarrage (capture StarAdmin) avant de coder.
- [ ] `ng build` + captures de deux pages (une publique, une admin).
