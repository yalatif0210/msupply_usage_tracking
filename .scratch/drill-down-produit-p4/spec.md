# Spec — Drill-down par produit de l'écart SDU / consommation (P4)

Status: ready-for-agent
Feature: drill-down-produit-p4
Date: 2026-08-31

Références : `CONTEXT.md` (Écart SDU, Écart consommation, Produit traceur),
`CLAUDE.md` §3/§6/§8, `DESIGN_SYSTEM.md`,
`.scratch/piliers-p1-p4-score-composite/spec.md` (P4 défini au niveau site,
drill-down explicitement renvoyé à plus tard),
`db/migrations/0017_vue_p4_ecart.sql`, `docs/guide_module_indicateurs.md`.

---

## Problem Statement

P4 est calculé et affiché **au niveau site** : deux taux de conformité (écart
SDU, écart consommation) sur le panier de produits traceurs. Quand un site est
en ALERTE sur P4, l'agent de district ne sait pas **quel produit** décroche :
un écart SDU global de 60 % peut venir de deux produits sur cinq très mauvais
ou de cinq produits légèrement hors tolérance. Impossible de cibler l'action
(recomptage, formation, enquête vol) sans la vue produit par produit.

`mv_p4_ecart` calcule déjà tout par produit dans ses CTE (`sdu_produit`,
`conso_produit`) avant d'agréger — l'information existe, elle est jetée.

## Solution

1. **Vue `mv_p4_ecart_produit`** : le détail par (site, mois PAQD, programme,
   produit traceur) — pour l'écart SDU : théorique, compté, écart %, conforme ;
   pour l'écart consommation : stock début / fin, réceptions, consommation
   déclarée / reconstituée, écart %, conforme, ou exclu avec raison.
2. **`GET /api/sites/:id/piliers/p4?mois=&programmeId=`** → `DetailP4Produits` :
   les lignes produit du mois PAQD affiché, une par produit traceur inventorié.
3. **Table de détail sous la carte P4** de la fiche site (repliable), avec pour
   chaque produit ses deux écarts et un badge conforme / alerte / exclu.

Aucun changement des taux, scores, ni du score composite : `mv_p4_ecart` et
`mv_score_pilier` restent tels quels.

## User Stories

1. En tant qu'agent de district, je veux voir sous la carte P4 la liste des produits traceurs inventoriés du mois, afin de savoir lesquels tirent l'écart SDU vers le bas.
2. En tant qu'agent de district, je veux pour chaque produit le stock théorique mSupply, le stock compté et l'écart en pourcentage, afin de juger l'ampleur.
3. En tant qu'agent de district, je veux un statut binaire par produit (dans la tolérance / hors tolérance), calé sur la même tolérance de grille que le pilier.
4. En tant qu'agent de district, je veux pour l'écart consommation, par produit, le stock de début, les réceptions, le stock de fin, la consommation reconstituée et la consommation déclarée, afin de comprendre l'écart.
5. En tant qu'agent de district, je veux qu'un produit exclu de l'écart consommation (pas de deux inventaires bornants, ou consommation reconstituée ≤ 0) soit marqué « non évaluable » avec la raison, jamais un zéro ni une ligne absente.
6. En tant qu'agent de district, je veux que la somme des « conformes » et des « inventoriés » de la table corresponde exactement au taux affiché sur la carte P4.
7. En tant qu'agent de district, je veux que le cas limite « compté 0 / théorique 0 » soit conforme et « compté 0 / théorique > 0 » soit hors tolérance (écart infini), cohérent avec la carte.
8. En tant qu'agent de district, je veux que la table respecte le filtre programme de la fiche.
9. En tant qu'agent de district, je veux que la table n'apparaisse que si le pilier P4 a une valeur (au moins un produit traceur inventorié).
10. En tant qu'agent de coordination, je veux que le détail vienne de l'historique / des vues, jamais d'un recalcul en TypeScript (CLAUDE.md §3).
11. En tant que développeur, je veux que le front rejette une réponse `DetailP4Produits` non conforme au contrat.
12. En tant qu'agent de coordination, je veux que seuls les produits traceurs **actifs** et les sites `dans_perimetre_dqa` entrent dans la table.
13. En tant qu'agent de coordination, je veux que `mv_p4_ecart_produit` soit rafraîchie par `rafraichir_et_geler`, comme les autres vues.

## Implementation Decisions

### Schéma

- **Nouvelle vue matérialisée `mv_p4_ecart_produit`** (couche indicateurs).
  Grain `(site_id, programme_id nullable, mois_paqd, produit_id)` — une ligne
  par produit traceur inventorié dans un inventaire finalisé du mois. Colonnes :
  `produit_code`, `libelle` (de `dim_produit_traceur`), `theorique`, `comptee`,
  `ecart_sdu_pct` (numeric(6,1), `NULL` = écart infini quand `comptee = 0` et
  `theorique > 0`), `sdu_conforme` (boolean), `stock_debut`, `stock_fin`,
  `receptions`, `declaree`, `reconstituee`, `ecart_conso_pct` (numeric(6,1),
  nullable), `conso_evaluable` (boolean), `conso_raison_exclusion` (text :
  `un_seul_inventaire` | `reconstituee_non_positive` | `NULL`), `conso_conforme`
  (boolean). Index unique sur
  `(site_id, mois_paqd, coalesce(programme_id,''), produit_id)`.
- **La logique est celle de `mv_p4_ecart`** (`0017`), reprise sans agréger :
  `sdu_produit` (dernier inventaire du mois) pour la partie SDU, `bornes` +
  `conso_produit` pour la partie consommation. Le doublon de CTE avec
  `mv_p4_ecart` est **assumé** : les deux vues sont rafraîchies ensemble et un
  changement de règle P4 passera par une migration qui touche les deux. On
  évite ainsi de dropper/recréer `mv_p4_ecart` → `mv_score_pilier` → la
  procédure pour une vue de lecture seule.
- **`rafraichir_et_geler`** : `CREATE OR REPLACE PROCEDURE` avec
  `REFRESH MATERIALIZED VIEW dqa.mv_p4_ecart_produit` juste après
  `mv_p4_ecart` (la procédure n'est pas une dépendance de vue : pas de
  cascade). Rien d'autre ne change.
- Aucun changement de `mv_p4_ecart`, `mv_score_pilier`, `hist_score_site`, de la
  grille, des contrats de pilier existants.

### Contrats (`@dqa/contracts`)

```
ecartSduProduit = {
  theorique: number | null,
  comptee: number | null,
  ecartPct: number | null,        // null = écart infini (compté 0, théorique > 0)
  conforme: boolean,
}
ecartConsoProduit = {
  evaluable: boolean,
  raisonExclusion: 'un_seul_inventaire' | 'reconstituee_non_positive' | null,
  stockDebut: number | null, stockFin: number | null, receptions: number | null,
  declaree: number | null, reconstituee: number | null,
  ecartPct: number | null,
  conforme: boolean,
}
ligneEcartProduitP4 = {
  produitCode: string,
  libelle: string | null,
  sdu: ecartSduProduit,
  consommation: ecartConsoProduit,
}
detailP4Produits = {
  site: Site,
  moisPaqd: MoisPaqd | null,
  moisDisponibles: MoisPaqd[],
  programmeId: string | null,
  produits: ligneEcartProduitP4[],   // trié : SDU hors tolérance d'abord, puis par code produit
}
```

- `raisonExclusion` : union discriminante en `z.enum` + `.nullable()`.
- `MesureSousComposante` / `ScorePilier` / `DetailSite` : inchangés.

### API

- **`GET /api/sites/:id/piliers/p4`** (tout authentifié) — query `mois?`,
  `programmeId?` (`detailSiteQuerySchema`, déjà existant). 404 si le site est
  hors périmètre ou inconnu. `moisPaqd` = le mois demandé s'il existe dans
  `mv_p4_ecart_produit` pour ce site, sinon le plus récent, sinon `null`
  (`produits: []`). Le repository lit `mv_p4_ecart_produit`, aucune arithmétique
  d'indicateur en TypeScript.

### Front

- **`SitesService.p4Produits(siteId, opts)`** : valide avec
  `detailP4ProduitsSchema`.
- **`pages/detail-site.ts`** : sous la carte du pilier P4 (seulement si
  `pilierP4.score !== null`), un `<details>` « Détail par produit traceur » qui,
  à l'ouverture, charge et affiche une table :
  Produit | Théorique | Compté | Écart SDU | (statut) | Reconstituée | Déclarée |
  Écart conso | (statut). Statut = `dqa-badge-statut` (`CONFORME` / `ALERTE`) ;
  pour la consommation non évaluable, un texte « non évaluable — <raison
  lisible> » à la place du badge. Écart `NULL` (SDU infini) rendu « ∞ ».
- La table est rechargée avec le `programmeId` et le `mois` courants de la
  fiche.
- **Composant** : pas de nouveau composant d'UI nécessaire ; réutilise
  `dqa-badge-statut`.

## Testing Decisions

Base PostgreSQL **éphémère** (testcontainers), jamais mockée (CLAUDE.md §3).

### Couture B — `mv_p4_ecart_produit`

Étend `test/indicateurs.test.ts` (bloc P4) ou nouveau `test/p4-produit.test.ts`.
Fixtures de core à la main (plusieurs produits traceurs, un produit non
traceur, un site hors périmètre, un produit avec un seul inventaire, un produit
à consommation reconstituée négative, cas limites compté 0). Assertions :
- une ligne par produit traceur inventorié ; produit non traceur et site hors
  périmètre absents ;
- `ecart_sdu_pct` et `sdu_conforme` cohérents avec la tolérance de grille ;
  cas `compté 0 / théorique 0` → conforme, `compté 0 / théorique > 0` →
  `ecart_sdu_pct` NULL et `sdu_conforme` false ;
- `conso_evaluable = false` + `conso_raison_exclusion` pour un seul inventaire
  et pour reconstituée ≤ 0 ; `reconstituee = stock_debut + receptions -
  stock_fin` pour un produit évaluable ;
- **cohérence avec `mv_p4_ecart`** : `count(sdu_conforme) / count(*)` de la vue
  produit = `taux_sdu_pct` de `mv_p4_ecart` pour le même (site, mois, prog) ;
  idem consommation sur les évaluables ;
- `CALL rafraichir_et_geler` rafraîchit `mv_p4_ecart_produit`.

### Couture A — frontière HTTP

Étend `test/lecture-indicateurs.test.ts` : `GET /api/sites/SITE-1/piliers/p4`
rend un objet conforme à `detailP4ProduitsSchema` ; 404 hors périmètre ;
`?programmeId=` restreint ; un site sans produit traceur inventorié →
`produits: []`.

### Couture D — service HTTP Angular

Étend `apps/web/src/app/core/valider-reponse.test.ts` : un `DetailP4Produits`
complet passe ; une `raisonExclusion` inconnue, ou un `sdu.conforme` absent →
lève.

## Out of Scope

- Le drill-down produit de **P5** (concordance) — même principe, tranche
  distincte si demandé.
- Un **historique** de l'écart par produit (courbe par produit).
- L'**export** de la table.
- Toute évolution des **taux P4**, du **score composite**, de la **grille**.
- Les **UI d'administration**, les **fêtes mobiles** — tranches distinctes.

## Further Notes

- `CLAUDE.md` §6 : les ajustements d'inventaire sont identifiés par le suffixe
  `/INVAD`, jamais par un code de type. `mv_p4_ecart_produit` n'y touche pas —
  elle lit `fact_inventaire_ligne` (comptes) et `fact_transaction` de nature
  `reception` / `dispensation`, exactement comme `mv_p4_ecart`.
- Le doublon de CTE avec `mv_p4_ecart` est le prix d'une migration sans
  cascade ; une consolidation (vue produit → agrégat) est possible plus tard
  quand une règle P4 changera.
- Toutes les quantités sont en unités de dispensation, comme dans
  `mv_p4_ecart`.
