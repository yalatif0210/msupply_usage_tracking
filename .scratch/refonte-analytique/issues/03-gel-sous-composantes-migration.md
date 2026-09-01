# 03: Migration — gel des 10 valeurs de sous-composante + rattrapage

**What to build:** figer les dix valeurs mesurées de sous-composante mois par
mois dans `hist_score_site`, comme les scores de pilier (ADR 0003).

**Blocked by:** —

**Status:** done (fusionné dans master)

## Comments

- Migration 0025. `mv_score_pilier` recréée pour exposer les dix valeurs
  brutes (copie de 0024 + 10 colonnes — prix du découpage).
- Rattrapage : `UPDATE hist_score_site FROM mv_score_pilier` filtré
  `dans_perimetre_dqa`. Vérifié en local (`sc_regularite_saisie = 71.0` sur les
  lignes SITE-1 préexistantes).
- Test immuabilité : sentinelle sur 2026-08 + `rafraichir_et_geler` pour un
  lot 2026-07 → 2026-08 intact (`WHERE mois_paqd = v_mois`).

- [ ] Migration numérotée : dix colonnes `numeric` sur `hist_score_site`,
      préfixe `sc_`, une par sous-composante (`sc_completude_inventaires`,
      `sc_completude_requisitions`, `sc_completude_receptions`,
      `sc_promptitude_inventaires`, `sc_promptitude_requisitions`,
      `sc_regularite_saisie`, `sc_ecart_sdu`, `sc_ecart_consommation`,
      `sc_concordance`, `sc_ratio_ajustements`). Valeur mesurée brute, pas le
      seuil ni le statut.
- [ ] `rafraichir_et_geler` recréée : l'`INSERT ... ON CONFLICT ... DO UPDATE`
      renseigne aussi les dix `sc_*` depuis les vues `mv_p1..mv_p6` du mois
      gelé.
- [ ] Rattrapage one-shot dans la migration : `UPDATE hist_score_site SET
      sc_* = (SELECT ... FROM mv_* ...)` pour toutes les lignes existantes.
      Commentaire explicite : valeurs recalculées avec les vues courantes
      (P3 = jours calendaires pour les mois d'avant la migration 0024).
- [ ] `docs/adr/0007-gel-des-valeurs-de-sous-composante.md`.
- [ ] `CONTEXT.md` : entrée « Valeur de sous-composante gelée ».
- [ ] `ARCHITECTURE.md` §2 : `hist_score_site` porte désormais les valeurs de
      sous-composante gelées.
- [ ] Tests (couture intégration API, prior art `import.test.ts`) :
      import + freeze → `sc_*` attendus (une assertion par sous-composante
      calculable + un cas NULL) ; rattrapage (NULL puis rejeu de la requête
      de backfill → valeurs identiques) ; immuabilité (un mois antérieur non
      ré-importé garde ses `sc_*`).
