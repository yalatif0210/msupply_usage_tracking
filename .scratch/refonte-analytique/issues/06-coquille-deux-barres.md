# 06: Coquille à deux barres en remplacement de `ui/entete`

**What to build:** remplacer le bandeau horizontal `<dqa-entete>` par une
coquille à deux barres horizontales, sans sidebar.

**Blocked by:** 05

**Status:** ready-for-agent

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
