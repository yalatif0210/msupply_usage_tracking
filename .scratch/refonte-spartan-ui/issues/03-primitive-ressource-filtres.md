# 03: Primitive `core/ressource` + recâblage des écrans à filtres

**What to build:** changer un filtre (mois, période, district, programme,
région) ne fait plus jamais clignoter ni recharger la vue. Le contenu courant
reste affiché pendant que la donnée se rafraîchit en arrière-plan ; l'état des
filtres suit dans l'URL sans navigation. **Aucun changement visuel** dans ce
ticket.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Primitive de données asynchrone partagée (nom indicatif `core/ressource`)
      autour d'un appel de service :
  - `valeur()` = dernière donnée connue, `enCours()` = un refetch est en vol ;
  - retient la valeur précédente pendant un refetch (jamais `null` si une
    donnée existe) ;
  - sur échec, conserve la valeur précédente + expose une erreur non bloquante ;
  - synchronise l'état de filtre dans l'URL **en place** (`replaceUrl` /
    `replaceState`), sans `router.navigate`, sans re-run des guards, sans
    ré-exécution du `loadComponent`, sans reset du scroll, sans entrée
    d'historique par frappe ;
  - restaure l'état de filtre depuis l'URL au montage.
- [ ] Tests unitaires (env node, prior art `core/valider-reponse.test.ts`) :
      valeur précédente conservée pendant et après un refetch ; `enCours()`
      correct ; valeur conservée sur échec ; l'URL est mise à jour sans que
      `navigate` soit appelé ; état restauré depuis un query param au montage.
- [ ] `liste-sites` recâblé : liste complète chargée une fois par `programmeId` ;
      `district` = filtre client instantané ; `programmeId` = refetch en
      arrière-plan ; pas de clignotement.
- [ ] `synthese` recâblé : `mois`, `programmeId`, `region` = refetch en
      arrière-plan ; la bascule d'onglet reste client.
- [ ] `detail-site` recâblé : `de`, `a`, `programme` = refetch en arrière-plan ;
      le score composite et les cartes de pilier **restent en place**, seul le
      bloc « Analyse fine » montre l'attente.
- [ ] Affordance d'attente : fine barre de progression en haut du panneau
      concerné + `aria-busy` ; jamais de spinner plein écran. Squelette toléré
      au seul premier chargement.
- [ ] Copier l'URL d'un écran filtré et la rouvrir (ou F5) restaure les
      filtres ; « précédent » ne remonte pas frappe à frappe.
- [ ] `ng build` + typecheck verts ; `conventions-source.test.ts` verte.
