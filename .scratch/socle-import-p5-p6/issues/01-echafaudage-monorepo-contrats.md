# 01: Échafaudage du monorepo, contrats corrigés, socle de migrations et de test

**What to build:** Le dépôt devient un monorepo qui tourne. Un développeur
installe les dépendances, build chaque workspace, lance le type-check en mode
strict sans erreur, et exécute le lanceur de tests (vert). Le process API
démarre et répond à un contrôle de santé ; le front build et sert une coquille.
Le package de contrats partagés est importable des deux côtés et expose le
vocabulaire PAQD corrigé : piliers P1–P6, sous-composantes, statut de
sous-composante binaire, classification sérialisée avec des underscores, plus
aucune trace du mot « composante », plus aucune clé d'enum cassée. Un exécuteur
de migrations SQL amène une base PostgreSQL vierge à jour et liste ce qu'il a
appliqué.

**Blocked by:** None (can start immediately)

**Status:** done (commit 4da8436, branche feat/01-echafaudage)

- [x] `npm install` à la racine câble les workspaces `apps/api`, `apps/web`, `packages/contracts` ; chacun build.
- [x] Le type-check passe en strict (`strict`, `noUncheckedIndexedAccess`) sur tous les workspaces, zéro `any`, zéro assertion `as` de contournement.
- [x] `packages/contracts` expose des schémas Zod comme source de vérité, types par `z.infer` ; `Pilier` = P1–P6 ; `Classification` en underscores (`PARTIELLEMENT_CONFORME`, `NON_CONFORME`) ; statut de sous-composante = `CONFORME | ALERTE | NON_CALCULABLE` ; aucun symbole nommé « composante » ; aucune clé d'enum avec espace.
- [x] L'API répond `200` à un endpoint de santé documenté (`GET /api/sante`).
- [x] Le front build et rend une coquille (composant standalone, `OnPush`, zoneless).
- [x] L'exécuteur de migrations applique des migrations SQL ordonnées sur une base vide, liste les migrations appliquées ; une seconde exécution est un no-op. (testé contre PostgreSQL 16)
- [x] Le lanceur de tests s'exécute et rapporte au moins un test passant. (15 tests : contracts 13, api 1, web 1)
- [x] `DESIGN_SYSTEM.md` est créé (registre visuel : sobre, dense, lisible à distance).
