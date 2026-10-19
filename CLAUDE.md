# CLAUDE.md — SUM (Suivi de l'Utilisation de mSupply)

Instructions pour Claude Code sur ce dépôt. À lire intégralement avant toute
modification.

---

## 1. Ce que fait ce produit

**Nom :** SUM, « Suivi de l'Utilisation de mSupply » (sous-titre affiché :
suivi de l'utilisation et de la qualité des données mSupply). Anciennement
« Tableau de bord DQA ». Le vocabulaire PAQD / DQA reste celui des écrans ;
les identifiants techniques (`dqa`, `@dqa/contracts`) ne changent pas.

Tableau de bord de suivi de la qualité des données mSupply pour 40 sites
sanitaires en Côte d'Ivoire.

Il calcule, par site, un score composite de conformité sur six piliers PAQD
et affiche la progression dans le temps. Public : équipes district,
coordination nationale, DAP.

**Contrainte structurante :** les données n'arrivent PAS en temps réel. La DAP
transmet un fichier Excel hebdomadaire. Toute l'architecture découle de ce
fait : import par lot, validation défensive, historisation explicite.

---

## 2. Stack

| Couche    | Techno                                    |
|-----------|-------------------------------------------|
| API       | NestJS 10, TypeScript strict              |
| Front     | Angular 21 zoneless, standalone components, signals |
| UI front  | spartan/ui (Tailwind v4 + Angular CDK), ApexCharts, @ng-icons/lucide, Inter |
| Base      | PostgreSQL 16                             |
| Contrats  | Package TS partagé `@dqa/contracts`       |
| Infra     | Docker Compose, Nginx                     |

Design : `DESIGN_SYSTEM.md` et `docs/adr/0008-adoption-spartan-ui.md`.

Monorepo npm workspaces.

```
/apps/api          NestJS
/apps/web          Angular
/packages/contracts Types partagés API ↔ front
/db/migrations     SQL versionné
/docs              Documentation par module
```

---

## 3. Règles non négociables

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`. Ne jamais désactiver.
- **`any` interdit.** Si un type est inconnu, utiliser `unknown` et restreindre.
- Pas d'assertion `as` pour contourner une erreur de type. Corriger le type.
- Types dérivés plutôt que dupliqués : `Pick`, `Omit`, `satisfies`.
- Les unions discriminées priment sur les booléens optionnels.

### Dépendances

- Le socle UI du front est une **liste fermée** : spartan/ui (Tailwind v4 +
  Angular CDK, avec ses compagnons `clsx` / `tailwind-merge` /
  `class-variance-authority` / `tw-animate-css`), ApexCharts (graphes),
  @ng-icons/lucide (icônes), `@fontsource/inter` (police, auto-hébergée). Toute
  autre dépendance runtime — front ou API — passe par un ADR.
- Hors socle UI : préférer la bibliothèque standard, ne pas ajouter de
  dépendance sans nécessité démontrée.
- Les composants spartan sont **copiés** dans `apps/web/src/app/ui/spartan/`
  (générateur `spartan/cli:ui`, modèle Helm, alias `@spartan-ng/helm/*`) : on
  les possède et on les édite ; ce ne sont pas une boîte noire à mettre à jour
  en masse.

### Frontière API ↔ front

- Tout type traversant la frontière vit dans `@dqa/contracts`. Aucun
  duplicata dans `apps/api` ou `apps/web`.
- Validation à l'entrée avec Zod. Les schémas Zod sont la source de vérité,
  les types s'en déduisent par `z.infer`. Jamais l'inverse.
- Un DTO n'est jamais une entité base de données. Les deux évoluent séparément.

### Base de données

- Aucun `synchronize: true`. Toute évolution passe par une migration SQL
  dans `/db/migrations`, numérotée et irréversible en production.
- Les calculs d'indicateurs vivent dans les vues matérialisées PostgreSQL,
  pas dans le code TypeScript. L'API lit les vues, elle ne recalcule pas.
- Toute requête filtre sur `dim_site.dans_perimetre_dqa` sauf mention explicite.

### Tests

- Logique métier de l'import : tests unitaires obligatoires.
- Un test par règle de validation, avec un cas passant et un cas échouant.
- Les tests d'intégration utilisent une base éphémère, jamais de mock de
  PostgreSQL.

---

## 4. Modèle de données

Trois couches, décrites en détail dans `/docs/guide_module_import.md`.

**Staging (`stg_*`)** — miroir brut des onglets Excel, colonnes en `TEXT`,
aucune contrainte. Absorbe les fichiers mal formés sans échouer.

**Core (`dim_*`, `fact_*`)** — données typées et dédoublonnées. Les
identifiants mSupply sont les clés primaires, donc un enregistrement présent
dans deux exports successifs s'écrase proprement.

**Indicateurs (`mv_*`)** — vues matérialisées, une par indicateur PAQD plus le
score composite. Seule couche interrogée par l'API.

Le SQL de référence est dans `/db/migrations`. Ne jamais le contourner par du
SQL inline dans le code.

---

## 5. Les six piliers PAQD

| Code | Indicateur                          | Poids | Seuil conforme |
|------|-------------------------------------|-------|----------------|
| P1   | Complétude des transactions (réquisition - réception, ADR 0019)        | 10 %  | 100 %          |
| P2   | Promptitude des transactions (Inventaire - requisition) | 15 %  | = 100 %        |
| P3   | Régularité de saisie (dispensation)  | 15 %  | ≥ 65 %         |
| P4   | Taux de conformité                  | 25 %  | tolérance produit 2 % |
| P5   | Concordance physique / théorique    | 25 %  | = 100 %         |
| P6   | Ratio d'ajustements                 | 10 %  | ≤ 5 %          |

Classification : CONFORME ≥ 90, PARTIELLEMENT CONFORME 75–89, NON CONFORME < 75.

Les seuils sont en base (`param_seuil`), pas en dur dans le code. Ils peuvent
changer entre deux cycles.

---

## 6. Point de vigilance connu

Les codes de type de transaction mSupply (`transact.type`) sont un champ texte
libre, sans énumération dans le schéma source. Les valeurs `im+` / `im-` que
l'on trouve dans d'anciennes documentations **ne sont pas fiables**.

L'identification des ajustements d'inventaire se fait par le suffixe `/INVAD`
posé à l'extraction, sur la base du type du tiers associé. Ne jamais coder en
dur une liste de codes de types sans l'avoir vérifiée contre les données
réelles.

---

## 7. Conventions de travail

### Documentation par module

Chaque module livré s'accompagne d'un `docs/guide_module_<nom>.md` couvrant :
rôle du module, schéma des données manipulées, points d'entrée, décisions de
conception et leurs raisons, pièges connus.

### Commits

Format `type(scope): sujet` en français, à l'impératif.
Exemple : `feat(import): valide les compteurs METADATA à la réception`.

### Ce qu'il ne faut pas faire

- Ne pas ajouter de dépendance hors du socle UI sans ADR (cf. §3 Dépendances).
- Ne pas créer de fichier `utils.ts` fourre-tout. Nommer par intention.
- Ne pas écrire de commentaire qui paraphrase le code. Commenter le pourquoi,
  jamais le quoi.
- Ne pas introduire d'état global côté Angular. Les signals et les services
  injectés suffisent (pas de store tiers).
- Ne pas utiliser de valeur Tailwind arbitraire (`bg-[#…]`, `w-[13px]`) :
  toujours un utilitaire mappé au thème. Une couleur = un jeton.

---

## 8. Interface

Système de design : `DESIGN_SYSTEM.md`. Décision d'adopter spartan/ui :
`docs/adr/0008-adoption-spartan-ui.md` (remplace l'ADR 0006).

Registre visuel : console d'administration dense et sobre, recréée à partir du
template **shadcn-admin** sur **spartan/ui**. Coquille à **deux barres
horizontales, aucune barre latérale**. **Mode clair uniquement.**

Le tableau de bord est consulté en réunion et **projeté** : contrastes francs,
chiffres clés généreux (`tabular-nums`), légendes de graphe toujours complètes
et jamais tronquées.

Interdits : dégradés, animation décorative, tiret long (`—` `–` `−` ; test de
garde `apps/web/src/app/conventions-source.test.ts`). Autorisés depuis l'ADR 0008 :
ombre `xs` sur les surfaces, transitions courtes sur repli / dépli.

Un changement de filtre (`select`, onglet, case, champ de recherche) ne démonte
jamais la vue et n'affiche jamais de spinner plein écran : filtrage côté client
quand la donnée est déjà chargée, sinon requête en arrière-plan avec le contenu
courant laissé visible. L'état des filtres est reflété dans l'URL (query params)
sans navigation qui remonte le composant.

---

## Agent skills

### Issue tracker

Les tickets et specs vivent en fichiers markdown sous `.scratch/<feature>/`.
See `docs/agents/issue-tracker.md`.

### Domain docs

Contexte unique : un `CONTEXT.md` + `docs/adr/` à la racine.
See `docs/agents/domain.md`.
