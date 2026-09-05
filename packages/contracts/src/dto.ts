import { z } from 'zod';
import {
  classificationSchema,
  cyclePaqdSchema,
  dateIsoSchema,
  mesureBruteSchema,
  moisPaqdSchema,
  pilierSchema,
  pourcentageSchema,
  SOUS_COMPOSANTES,
  sousComposanteSchema,
  statutSousComposanteSchema,
  type SousComposante,
} from './paqd.js';

/** Score d'un pilier réduit à l'essentiel : le code du pilier et sa note (ou `null`). */
export const scorePilierBrefSchema = z.object({
  pilier: pilierSchema,
  score: pourcentageSchema.nullable(),
});
export type ScorePilierBref = z.infer<typeof scorePilierBrefSchema>;

/**
 * DTO exposés par l'API et consommés par le front.
 *
 * Un DTO n'est jamais une entité base : il peut omettre des colonnes, renommer
 * ou combiner plusieurs sources. Chaque DTO correspond à une vue matérialisée
 * ou à une agrégation de vues.
 */

// ─── Référentiels ───────────────────────────────────────────────────────────

export const siteSchema = z.object({
  siteId: z.string(),
  siteCode: z.string().nullable(),
  siteNom: z.string(),
  district: z.string().nullable(),
  region: z.string().nullable(),
  typeStructure: z.string().nullable(),
});
export type Site = z.infer<typeof siteSchema>;

export const programmeSchema = z.object({
  programmeId: z.string(),
  programmeCode: z.string().nullable(),
  programmeNom: z.string(),
});
export type Programme = z.infer<typeof programmeSchema>;

/** Produit traceur — liste de référence administrée dans la console (ADR 0005). */
export const produitTraceurSchema = z.object({
  produitCode: z.string().min(1),
  libelle: z.string().nullable(),
  actif: z.boolean(),
  majLe: z.string().datetime(),
});
export type ProduitTraceur = z.infer<typeof produitTraceurSchema>;

export const entreeProduitTraceurSchema = z.object({
  produitCode: z.string().min(1).max(120),
  libelle: z.string().max(300).optional(),
  actif: z.boolean().optional(),
});
export type EntreeProduitTraceur = z.infer<typeof entreeProduitTraceurSchema>;

/**
 * Correspondance `type_structure → strate` d'affichage des lectures nationales
 * (voir CONTEXT.md « Strate de structure »). Administrée dans la console, pas
 * historisée : un changement prend effet à la consultation suivante.
 */
export const strateStructureSchema = z.object({
  typeStructure: z.string(),
  strate: z.string().min(1),
});
export type StrateStructure = z.infer<typeof strateStructureSchema>;

/** Corps d'un `PUT /api/admin/strates/:typeStructure`. */
export const entreeStrateSchema = strateStructureSchema.pick({ strate: true });
export type EntreeStrate = z.infer<typeof entreeStrateSchema>;

/**
 * État complet de l'écran d'admin des strates : les correspondances
 * enregistrées et les `type_structure` présents dans `dim_site` qui n'en ont
 * pas encore (ils agrègent sous « Non classé » tant qu'ils ne sont pas mappés).
 */
export const vueStratesSchema = z.object({
  mappings: z.array(strateStructureSchema),
  nonClasses: z.array(z.string()),
});
export type VueStrates = z.infer<typeof vueStratesSchema>;

// ─── Détail d'un site ───────────────────────────────────────────────────────

export const uniteMesureSchema = z.enum(['pct', 'jours', 'nombre', 'ratio']);
export type UniteMesure = z.infer<typeof uniteMesureSchema>;

/**
 * Mesure d'une sous-composante pour un site et un mois PAQD.
 *
 * `valeur` est nulle quand `statut` vaut NON_CALCULABLE ; `raison` porte alors
 * l'explication. Le front doit traiter ce cas explicitement, jamais l'afficher
 * comme un zéro.
 */
export const mesureSousComposanteSchema = z.object({
  sousComposante: sousComposanteSchema,
  libelle: z.string(),
  valeur: z.number().nullable(),
  unite: uniteMesureSchema,
  seuil: z.number().nullable(),
  statut: statutSousComposanteSchema,
  raison: z.string().nullable(),
});
export type MesureSousComposante = z.infer<typeof mesureSousComposanteSchema>;

/**
 * Couple attendu / réalisé d'une sous-composante, figé mois par mois
 * (`hist_pilier_brut`). `aLHeure` n'est renseigné que pour les sous-composantes
 * qui portent un délai (P2). Les trois compteurs sont nuls quand la
 * sous-composante est NON_CALCULABLE pour le mois : le front n'affiche alors
 * pas de couple.
 */
export const compteBrutSchema = z.object({
  mesure: mesureBruteSchema,
  libelle: z.string(),
  attendu: z.number().int().nonnegative().nullable(),
  realise: z.number().int().nonnegative().nullable(),
  aLHeure: z.number().int().nonnegative().nullable(),
});
export type CompteBrut = z.infer<typeof compteBrutSchema>;

export const scorePilierSchema = z.object({
  pilier: pilierSchema,
  libelle: z.string(),
  poids: z.number(),
  /** Score sur 100, ou `null` si toutes les sous-composantes sont NON_CALCULABLE. */
  score: pourcentageSchema.nullable(),
  sousComposantes: z.array(mesureSousComposanteSchema),
  /**
   * Couples attendu / réalisé figés du pilier, un par sous-composante mesurée.
   * Vide tant que le mois n'a pas de gel de comptes bruts (mois antérieurs au
   * backfill).
   */
  comptesBruts: z.array(compteBrutSchema),
});
export type ScorePilier = z.infer<typeof scorePilierSchema>;

/**
 * Valeur gelée d'une sous-composante à un mois PAQD : la valeur mesurée, le
 * seuil de la grille du mois, le statut qui s'en déduit (`valeur` ou `seuil`
 * nul → NON_CALCULABLE), et le taux d'atteinte du seuil (0..100, échelle
 * commune aux dix ; `v_sous_composante_atteinte`). Champs de mesure dérivés de
 * `mesureSousComposanteSchema`.
 */
export const sousComposanteBrefSchema = mesureSousComposanteSchema
  .pick({ sousComposante: true, valeur: true, seuil: true, statut: true })
  .extend({ tauxAtteinte: pourcentageSchema.nullable() });
export type SousComposanteBref = z.infer<typeof sousComposanteBrefSchema>;

/** Les dix sous-composantes gelées d'un mois, dans l'ordre canonique `SOUS_COMPOSANTES`. */
export const dixSousComposantesSchema = z
  .array(sousComposanteBrefSchema)
  .length(10)
  .refine((scs) => scs.every((s, i) => s.sousComposante === SOUS_COMPOSANTES[i]), {
    message: 'les dix sous-composantes doivent suivre l’ordre de SOUS_COMPOSANTES',
  });

export const detailSiteSchema = z.object({
  site: siteSchema,
  /** Mois PAQD affiché, ou `null` si le site n'a encore aucune mesure. */
  moisPaqd: moisPaqdSchema.nullable(),
  /**
   * `false` tant que le mois affiché peut encore recevoir des données (délai
   * de réquisition non expiré) : le score est provisoire, pas un verdict
   * final. `true` (ou `moisPaqd` nul) sinon. Cf. ADR 0010.
   */
  moisClos: z.boolean(),
  /**
   * Vrai si le site est un district (`strate_de(type_structure) = 'District'`) :
   * P3 y mesure la réponse aux réquisitions de la zone, pas la dispensation
   * quotidienne (ADR 0011). Sert au front à adapter le libellé de P3.
   */
  estDistrict: z.boolean(),
  /** Mois PAQD pour lesquels le site a une mesure, du plus récent au plus ancien. */
  moisDisponibles: z.array(moisPaqdSchema),
  /** Filtre programme appliqué, ou `null` pour « tous programmes ». */
  programmeId: z.string().nullable(),
  piliersCouverts: z.number().int().nonnegative(),
  piliersTotal: z.literal(6),
  /**
   * Score composite du site. `null` tant que les six piliers ne sont pas
   * couverts — le front n'affiche alors pas de score.
   */
  scoreComposite: pourcentageSchema.nullable(),
  classification: classificationSchema.nullable(),
  piliers: z.array(scorePilierSchema),
  /**
   * Les dix sous-composantes du mois affiché (ordre canonique), valeurs gelées
   * + taux d'atteinte (`v_sous_composante_atteinte`) ; toutes NON_CALCULABLE si
   * le site n'a aucune mesure. Sert le tableau à plat et le radar ; distinct de
   * `piliers[].sousComposantes` (rendu live des cartes).
   */
  sousComposantes: dixSousComposantesSchema,
});
export type DetailSite = z.infer<typeof detailSiteSchema>;

// ─── Liste des sites ────────────────────────────────────────────────────────

export const scoreSiteSchema = z.object({
  site: siteSchema,
  moisPaqd: moisPaqdSchema.nullable(),
  /** Nombre de piliers effectivement mesurés (≤ 6) : le composite est renormalisé dessus. */
  piliersCouverts: z.number().int().min(0).max(6),
  scoreComposite: pourcentageSchema.nullable(),
  classification: classificationSchema.nullable(),
  scoresPiliers: z.array(scorePilierBrefSchema),
});
export type ScoreSite = z.infer<typeof scoreSiteSchema>;

export const filtreSitesSchema = z.object({
  district: z.string().optional(),
  region: z.string().optional(),
  programmeId: z.string().optional(),
});
export type FiltreSites = z.infer<typeof filtreSitesSchema>;

export const detailSiteQuerySchema = z.object({
  mois: moisPaqdSchema.optional(),
  programmeId: z.string().optional(),
});
export type DetailSiteQuery = z.infer<typeof detailSiteQuerySchema>;

// ─── Synthèse nationale ─────────────────────────────────────────────────────

/**
 * Répartition des sites du périmètre d'un ensemble entre les trois classes et
 * l'absence de mesure. `SANS_MESURE` = sites sans score composite pour le mois :
 * jamais confondu avec NON_CONFORME. La somme des quatre = nombre de sites.
 */
export const repartitionClassificationSchema = z.object({
  CONFORME: z.number().int().nonnegative(),
  PARTIELLEMENT_CONFORME: z.number().int().nonnegative(),
  NON_CONFORME: z.number().int().nonnegative(),
  SANS_MESURE: z.number().int().nonnegative(),
});
export type RepartitionClassification = z.infer<typeof repartitionClassificationSchema>;

export const blocSyntheseSchema = z.object({
  /** Sites du périmètre dans l'ensemble (pour une ligne programme : sites qui le gèrent). */
  nbSites: z.number().int().nonnegative(),
  /** Sous-ensemble ayant un score composite pour le mois. */
  nbMesures: z.number().int().nonnegative(),
  /** Moyenne des scores composites non nuls, ou `null` si `nbMesures = 0`. */
  scoreCompositeMoyen: pourcentageSchema.nullable(),
  repartition: repartitionClassificationSchema,
});
export type BlocSynthese = z.infer<typeof blocSyntheseSchema>;

export const ligneDistrictSyntheseSchema = blocSyntheseSchema.extend({
  district: z.string(),
});
export type LigneDistrictSynthese = z.infer<typeof ligneDistrictSyntheseSchema>;

export const ligneProgrammeSyntheseSchema = blocSyntheseSchema.extend({
  programmeId: z.string(),
  programmeNom: z.string(),
});
export type LigneProgrammeSynthese = z.infer<typeof ligneProgrammeSyntheseSchema>;

/**
 * Une sous-composante vue au niveau national (pour le filtre mois / programme /
 * région appliqué) : combien de sites CONFORME / ALERTE / NON_CALCULABLE, et la
 * moyenne du taux d'atteinte du seuil (0..100, `null` si aucun site calculable).
 */
export const ligneSousComposanteSyntheseSchema = z.object({
  sousComposante: sousComposanteSchema,
  pilier: pilierSchema,
  tauxAtteinteMoyen: pourcentageSchema.nullable(),
  nbConforme: z.number().int().nonnegative(),
  nbAlerte: z.number().int().nonnegative(),
  nbNonCalculable: z.number().int().nonnegative(),
});
export type LigneSousComposanteSynthese = z.infer<typeof ligneSousComposanteSyntheseSchema>;

export const syntheseNationaleSchema = z.object({
  /** Mois PAQD affiché, ou `null` si aucun mois n'est encore mesuré. */
  moisPaqd: moisPaqdSchema.nullable(),
  moisDisponibles: z.array(moisPaqdSchema),
  /** Filtre programme appliqué (national + districts), ou `null` pour « tous programmes ». */
  programmeId: z.string().nullable(),
  /** Filtre région appliqué (districts + programmes), ou `null` pour « toutes régions ». */
  region: z.string().nullable(),
  national: blocSyntheseSchema.extend({
    /** Moyenne nationale de chaque score de pilier — 6 entrées, ordre P1..P6. */
    moyennesPiliers: z
      .array(z.object({ pilier: pilierSchema, moyenne: pourcentageSchema.nullable() }))
      .length(6),
  }),
  /** Ventilation par district, triée du score moyen le plus faible au plus élevé. */
  parDistrict: z.array(ligneDistrictSyntheseSchema),
  /** Un item par programme géré par ≥ 1 site du périmètre, trié score croissant. */
  parProgramme: z.array(ligneProgrammeSyntheseSchema),
  /** Les dix sous-composantes au niveau du filtre, triées taux d'atteinte croissant. */
  parSousComposante: z.array(ligneSousComposanteSyntheseSchema),
});
export type SyntheseNationale = z.infer<typeof syntheseNationaleSchema>;

export const syntheseQuerySchema = z.object({
  mois: moisPaqdSchema.optional(),
  programmeId: z.string().optional(),
  region: z.string().optional(),
});
export type SyntheseQuery = z.infer<typeof syntheseQuerySchema>;

// ─── Synthèse nationale : rapports & inventaires ────────────────────────────

/**
 * Triplet de comptes d'un livrable mensuel (réquisition ou inventaire de fin de
 * mois), agrégé sur une strate : attendus / réalisés / réalisés à l'heure.
 * L'« attendu » est compté par programme géré, comme le dénominateur de P1 / P2.
 */
export const tripletRapportsSchema = z.object({
  attendu: z.number().int().nonnegative(),
  realise: z.number().int().nonnegative(),
  aLHeure: z.number().int().nonnegative(),
});
export type TripletRapports = z.infer<typeof tripletRapportsSchema>;

/** Les deux livrables mensuels suivis en parallèle. */
export const ligneRapportsSchema = z.object({
  requisitions: tripletRapportsSchema,
  inventaires: tripletRapportsSchema,
});
export type LigneRapports = z.infer<typeof ligneRapportsSchema>;

export const ligneStrateRapportsSchema = ligneRapportsSchema.extend({
  /** Strate de structure (`strate_de`) ; « Non classé » regroupe les types non mappés. */
  strate: z.string().min(1),
});
export type LigneStrateRapports = z.infer<typeof ligneStrateRapportsSchema>;

export const syntheseRapportsSchema = z.object({
  /** Mois PAQD affiché, ou `null` si aucun mois n'est encore gelé. */
  moisPaqd: moisPaqdSchema.nullable(),
  moisDisponibles: z.array(moisPaqdSchema),
  /** Filtre programme appliqué, ou `null` pour « tous programmes ». */
  programmeId: z.string().nullable(),
  /** Filtre région appliqué, ou `null` pour « toutes régions ». */
  region: z.string().nullable(),
  /** Une ligne par strate ayant au moins un site du périmètre pour le mois, triée par strate. */
  strates: z.array(ligneStrateRapportsSchema),
  /** Somme des strates affichées (ré-agrégation, pas une moyenne de moyennes). */
  total: ligneRapportsSchema,
});
export type SyntheseRapports = z.infer<typeof syntheseRapportsSchema>;

// ─── Tableau de bord national (page d'accueil) ──────────────────────────────

/** Nombre de sous-composantes « en difficulté » affichées sur la page d'accueil. */
export const TOP_SOUS_COMPOSANTES_DIFFICULTE = 5;

/** Score composite moyen national d'un mois PAQD, pour la mini-courbe d'accueil. */
export const pointProgressionNationaleSchema = z.object({
  moisPaqd: moisPaqdSchema,
  scoreCompositeMoyen: pourcentageSchema.nullable(),
});
export type PointProgressionNationale = z.infer<typeof pointProgressionNationaleSchema>;

export const tableauDeBordSchema = z.object({
  /** Mois PAQD affiché (le plus récent par défaut, ou celui demandé s'il existe), ou `null` si aucun. */
  moisPaqd: moisPaqdSchema.nullable(),
  /**
   * `false` tant que le mois affiché peut encore recevoir des données (délai
   * de réquisition non expiré) : le score national est provisoire. `true` (ou
   * `moisPaqd` nul) sinon. Cf. ADR 0010.
   */
  moisClos: z.boolean(),
  /** État national du mois : `nbSites` = périmètre, `repartition.SANS_MESURE` = sites sans score. */
  national: blocSyntheseSchema,
  /** Score composite moyen national par mois PAQD, du plus ancien au plus récent. */
  progression: z.array(pointProgressionNationaleSchema),
  /** Les sous-composantes qui mettent le plus de sites en ALERTE ce mois, triées ALERTE décroissant. */
  sousComposantesEnDifficulte: z
    .array(ligneSousComposanteSyntheseSchema)
    .max(TOP_SOUS_COMPOSANTES_DIFFICULTE),
});
export type TableauDeBord = z.infer<typeof tableauDeBordSchema>;

// ─── Progression d'un site sur un cycle PAQD ────────────────────────────────

/** Un mois PAQD mesuré d'un cycle, avec son rang M+1..M+4 (issu du calendrier). */
export const pointProgressionSchema = z.object({
  moisPaqd: moisPaqdSchema,
  rang: z.number().int().min(1).max(4),
  scoreComposite: pourcentageSchema.nullable(),
  classification: classificationSchema.nullable(),
  piliersCouverts: z.number().int().min(0).max(6),
  scoresPiliers: z.array(scorePilierBrefSchema).length(6),
  sousComposantes: dixSousComposantesSchema,
});
export type PointProgression = z.infer<typeof pointProgressionSchema>;

export const historiqueSiteSchema = z.object({
  site: siteSchema,
  /** Filtre programme appliqué, ou `null` pour « tous programmes ». */
  programmeId: z.string().nullable(),
  /**
   * Cycle PAQD affiché quand la fenêtre est un cycle ; `null` si le site n'a
   * aucune mesure, ou si la fenêtre est une plage `de`/`a` libre.
   */
  cyclePaqd: cyclePaqdSchema.nullable(),
  /** Cycles où le site a ≥ 1 mesure, du plus récent au plus ancien. */
  cyclesDisponibles: z.array(cyclePaqdSchema),
  /** Tous les mois PAQD où le site a une mesure, du plus récent au plus ancien (sélecteur de plage). */
  moisDisponibles: z.array(moisPaqdSchema),
  /** Points de la fenêtre, triés par mois PAQD croissant ; un mois non mesuré est absent. */
  points: z.array(pointProgressionSchema),
});
export type HistoriqueSite = z.infer<typeof historiqueSiteSchema>;

export const historiqueQuerySchema = z.object({
  /** Non validés : une fenêtre inconnue (cycle ou plage) retombe simplement sur le cycle le plus récent. */
  cycle: z.string().optional(),
  /** Plage de mois PAQD (bornes incluses). `de` + `a`, tous deux mesurés, priment sur `cycle`. */
  de: z.string().optional(),
  a: z.string().optional(),
  programmeId: z.string().optional(),
});
export type HistoriqueQuery = z.infer<typeof historiqueQuerySchema>;

// ─── Tableau produit P4 · P5 (écart SDU / consommation + concordance) ────────

/** Raison pour laquelle un produit est exclu du calcul de l'écart consommation. */
export const raisonExclusionConsoSchema = z.enum([
  'un_seul_inventaire',
  'reconstituee_non_positive',
]);
export type RaisonExclusionConso = z.infer<typeof raisonExclusionConsoSchema>;

/**
 * Écart SDU d'un produit : théorique (mSupply) contre compté (réalité) au
 * dernier inventaire finalisé du mois. `ecartPct` nul = écart infini
 * (compté 0, théorique > 0).
 */
export const ecartSduProduitSchema = z.object({
  theorique: z.number().nullable(),
  comptee: z.number().nullable(),
  ecartPct: z.number().nullable(),
  conforme: z.boolean(),
});
export type EcartSduProduit = z.infer<typeof ecartSduProduitSchema>;

/**
 * Union discriminée sur `evaluable` : un produit non évaluable n'a qu'une
 * raison ; un produit évaluable porte les cinq grandeurs et son statut.
 */
export const ecartConsoProduitSchema = z.discriminatedUnion('evaluable', [
  z.object({
    evaluable: z.literal(true),
    stockDebut: z.number(),
    stockFin: z.number(),
    receptions: z.number(),
    declaree: z.number(),
    reconstituee: z.number().positive(),
    ecartPct: z.number(),
    conforme: z.boolean(),
  }),
  z.object({
    evaluable: z.literal(false),
    raisonExclusion: raisonExclusionConsoSchema,
  }),
]);
export type EcartConsoProduit = z.infer<typeof ecartConsoProduitSchema>;

/**
 * Concordance physique / théorique d'un produit (pilier P5), au dernier
 * inventaire finalisé du mois :
 * `least(|théorique|, |compté|) / greatest(|théorique|, |compté|) · 100`
 * (même formule que `mv_p5_concordance`, sans agréger). `tauxPct` nul si aucune
 * quantité exploitable ; `conforme` = `tauxPct ≥ seuil 'concordance'` de la
 * grille du mois. Le score P5 du site reste calculé par la vue, jamais ici.
 */
export const concordanceProduitP5Schema = z.object({
  tauxPct: z.number().nullable(),
  conforme: z.boolean(),
});
export type ConcordanceProduitP5 = z.infer<typeof concordanceProduitP5Schema>;

/** Une ligne du tableau produit P4 · P5 : un produit traceur inventorié. */
export const ligneProduitP4P5Schema = z.object({
  produitCode: z.string(),
  libelle: z.string().nullable(),
  sdu: ecartSduProduitSchema,
  consommation: ecartConsoProduitSchema,
  concordance: concordanceProduitP5Schema,
});
export type LigneProduitP4P5 = z.infer<typeof ligneProduitP4P5Schema>;

// ─── Détail ligne à ligne d'un pilier (lu en direct du core) ────────────────

/**
 * Requête du détail par pilier : mêmes paramètres que le détail de site.
 * `mois` par défaut le plus récent gelé ; `programmeId` absent = tous programmes.
 */
export const detailPilierQuerySchema = detailSiteQuerySchema;
export type DetailPilierQuery = z.infer<typeof detailPilierQuerySchema>;

/**
 * Champs communs à toutes les variantes de `DetailPilier`.
 *
 * - `comptesBruts` : les couples figés du pilier (`hist_pilier_brut`), identiques
 *   à `DetailSite.piliers[].comptesBruts`.
 * - `calculeLe` : horodatage du gel des comptes bruts pour ce site / mois /
 *   programme (`hist_pilier_brut.calcule_le`, à défaut `hist_score_site`).
 * - `coreMajLe` : `max(maj_le)` des lignes de core que ce pilier lit pour ce
 *   site + mois. `reimporteDepuisLeGel` = `coreMajLe > calculeLe` : le détail
 *   live ci-dessous peut alors différer des comptes figés.
 */
const detailPilierBaseSchema = z.object({
  site: siteSchema,
  moisPaqd: moisPaqdSchema.nullable(),
  moisDisponibles: z.array(moisPaqdSchema),
  programmeId: z.string().nullable(),
  comptesBruts: z.array(compteBrutSchema),
  calculeLe: z.string().datetime().nullable(),
  coreMajLe: z.string().datetime().nullable(),
  reimporteDepuisLeGel: z.boolean(),
});

/** Un inventaire finalisé du mois (P1 : liste brute). */
export const ligneInventaireP1Schema = z.object({
  date: dateIsoSchema,
  programme: z.string(),
});

/** Une réquisition couvrant le mois (P1). */
export const ligneRequisitionP1Schema = z.object({
  programme: z.string(),
  moisCouvert: moisPaqdSchema,
  dateSoumission: dateIsoSchema.nullable(),
});

/** Une réception finalisée ou une facture fournisseur du mois (P1). */
export const ligneTransactionP1Schema = z.object({
  date: dateIsoSchema,
  reference: z.string().nullable(),
});

/** Un programme géré du site et l'état de ses deux livrables du mois (P1). */
export const programmeGereP1Schema = z.object({
  programme: z.string(),
  aInventaire: z.boolean(),
  aRequisition: z.boolean(),
});

export const detailPilierP1Schema = detailPilierBaseSchema.extend({
  code: z.literal('p1'),
  /** Inventaires finalisés du mois, un par ligne. */
  inventaires: z.array(ligneInventaireP1Schema),
  /** Réquisitions dont le mois couvert est le mois PAQD. */
  requisitions: z.array(ligneRequisitionP1Schema),
  /** Réceptions finalisées du mois. */
  receptions: z.array(ligneTransactionP1Schema),
  /** Factures fournisseur du mois (dénominateur des réceptions). */
  factures: z.array(ligneTransactionP1Schema),
  /** Un item par programme géré : signale l'inventaire ou la réquisition manquant. */
  programmesGeres: z.array(programmeGereP1Schema),
});
export type DetailPilierP1 = z.infer<typeof detailPilierP1Schema>;

/** Un inventaire finalisé du mois avec la règle des 3 derniers jours (P2). */
export const ligneInventaireP2Schema = z.object({
  date: dateIsoSchema,
  programme: z.string(),
  dansLes3DerniersJours: z.boolean(),
});

/** Une réquisition avec sa date limite et le verdict « à l'heure » (P2). */
export const ligneRequisitionP2Schema = z.object({
  programme: z.string(),
  dateSoumission: dateIsoSchema.nullable(),
  dateLimite: dateIsoSchema,
  aLHeure: z.boolean(),
});

export const detailPilierP2Schema = detailPilierBaseSchema.extend({
  code: z.literal('p2'),
  /** Inventaires finalisés du mois, hors des 3 derniers jours d'abord côté front. */
  inventaires: z.array(ligneInventaireP2Schema),
  /** Réquisitions du mois, en retard d'abord côté front. */
  requisitions: z.array(ligneRequisitionP2Schema),
});
export type DetailPilierP2 = z.infer<typeof detailPilierP2Schema>;

/** Un jour calendaire du mois affiché et s'il a porté au moins une sortie de stock (P3). */
export const jourP3Schema = z.object({
  jour: dateIsoSchema,
  /** Vrai si le site a confirmé ce jour-là ≥ 1 sortie (`dispensation` ou `distribution`, non annulée). */
  aSortie: z.boolean(),
});
export type JourP3 = z.infer<typeof jourP3Schema>;

/**
 * Détail P3 d'un district (ADR 0011) : au lieu du bandeau calendaire, le couple
 * réquisitions de la zone (couvrant M-1) / servies dans M par une distribution.
 */
export const reponseZoneP3Schema = z.object({
  /** Mois couvert des réquisitions évaluées (M-1 du mois PAQD affiché). */
  moisCouvert: moisPaqdSchema,
  /** Réquisitions DISTINCTES de la zone du district couvrant ce mois. */
  nbRequisitions: z.number().int().nonnegative(),
  /** Parmi elles, celles servies dans le mois PAQD par une distribution du district. */
  nbRepondues: z.number().int().nonnegative(),
});
export type ReponseZoneP3 = z.infer<typeof reponseZoneP3Schema>;

export const detailPilierP3Schema = detailPilierBaseSchema.extend({
  code: z.literal('p3'),
  /** Un item par jour calendaire du mois PAQD (28 à 31) ; vide pour un district. */
  jours: z.array(jourP3Schema),
  /** Renseigné pour un district : remplace le bandeau calendaire. `null` sinon. */
  reponseZone: reponseZoneP3Schema.nullable(),
});
export type DetailPilierP3 = z.infer<typeof detailPilierP3Schema>;

/** Un mouvement d'ajustement de stock du mois (P6). */
export const ligneAjustementP6Schema = z.object({
  date: dateIsoSchema,
  produit: z.string(),
  quantite: z.number(),
  sens: z.enum(['positif', 'negatif']),
});
export type LigneAjustementP6 = z.infer<typeof ligneAjustementP6Schema>;

export const detailPilierP6Schema = detailPilierBaseSchema.extend({
  code: z.literal('p6'),
  /** Seuls les mouvements d'ajustement du mois. */
  ajustements: z.array(ligneAjustementP6Schema),
  /** Dénominateur du ratio d'ajustements : nombre total de mouvements du mois (`mv_p6_ajustements`). */
  nbMouvements: z.number().int().nonnegative(),
});
export type DetailPilierP6 = z.infer<typeof detailPilierP6Schema>;

/**
 * Variante P4 : le tableau produit P4 · P5 fusionné. Une ligne par produit
 * traceur inventorié, écart SDU hors tolérance en tête (comme `mv_p4_ecart_produit`).
 * Alimente les cartes P4 **et** P5 de la fiche site.
 */
export const detailPilierP4Schema = detailPilierBaseSchema.extend({
  code: z.literal('p4'),
  produits: z.array(ligneProduitP4P5Schema),
});
export type DetailPilierP4 = z.infer<typeof detailPilierP4Schema>;

/**
 * Détail par pilier servi par `GET /api/sites/:id/piliers/:code`. Union
 * discriminée sur `code` : variantes livrées `p1`, `p2`, `p3`, `p4` (tableau
 * produit P4 · P5 fusionné), `p6`. `p5` est servi via la variante `p4`.
 */
export const detailPilierSchema = z.discriminatedUnion('code', [
  detailPilierP1Schema,
  detailPilierP2Schema,
  detailPilierP3Schema,
  detailPilierP4Schema,
  detailPilierP6Schema,
]);
export type DetailPilier = z.infer<typeof detailPilierSchema>;

// ─── Fiche produit-mois (données brutes d'un produit traceur) ───────────────

/**
 * Requête de la fiche produit-mois : mêmes paramètres que le détail de site.
 * `mois` par défaut le plus récent mesuré du site (`hist_score_site`) ;
 * `programmeId` absent = tous programmes.
 */
export const ficheProduitMoisQuerySchema = detailSiteQuerySchema;
export type FicheProduitMoisQuery = z.infer<typeof ficheProduitMoisQuerySchema>;

/**
 * Un inventaire finalisé du mois portant ce produit : stock théorique mSupply
 * contre stock physique compté, et l'écart (`compté − théorique`). Les
 * grandeurs sont nulles si aucune ligne de l'inventaire n'a de quantité.
 */
export const inventaireFicheProduitSchema = z.object({
  date: dateIsoSchema,
  statut: z.string().nullable(),
  theorique: z.number().nullable(),
  comptee: z.number().nullable(),
  ecart: z.number().nullable(),
});
export type InventaireFicheProduit = z.infer<typeof inventaireFicheProduitSchema>;

/** Une photo de stock (`fact_stock_snapshot`) du mois : quantité disponible à la date d'extraction. */
export const snapshotFicheProduitSchema = z.object({
  datePhoto: dateIsoSchema,
  quantiteDisponible: z.number(),
});
export type SnapshotFicheProduit = z.infer<typeof snapshotFicheProduitSchema>;

/** Une réception finalisée non annulée du mois (date, quantité en unités). */
export const receptionFicheProduitSchema = z.object({
  date: dateIsoSchema,
  quantite: z.number(),
});
export type ReceptionFicheProduit = z.infer<typeof receptionFicheProduitSchema>;

/** Un mouvement d'ajustement du mois (même prédicat que P6). */
export const ajustementFicheProduitSchema = z.object({
  date: dateIsoSchema,
  quantite: z.number(),
  sens: z.enum(['positif', 'negatif']),
});
export type AjustementFicheProduit = z.infer<typeof ajustementFicheProduitSchema>;

/**
 * Consommation du produit sur le mois. `reconstituee = stockDébut + réceptions
 * − stockFin` entre les deux inventaires bornants ; `declaree` = Σ dispensations
 * sur le même intervalle ; `ecart = declaree − reconstituee`. Les trois sont
 * `null` quand le produit n'a pas deux inventaires bornants dans le mois.
 */
export const consommationFicheProduitSchema = z.object({
  reconstituee: z.number().nullable(),
  declaree: z.number().nullable(),
  ecart: z.number().nullable(),
});
export type ConsommationFicheProduit = z.infer<typeof consommationFicheProduitSchema>;

/**
 * Toutes les grandeurs brutes d'un produit traceur pour un site et un mois, lues
 * en direct du core (`fact_*`) sauf `consommation` / `stockDebut` / `stockFin`,
 * repris de `mv_p4_ecart_produit` (mêmes calculs que l'écart consommation P4).
 * `calculeLe` = gel des comptes du mois ; `reimporteDepuisLeGel` =
 * `coreMajLe > calculeLe` (le détail live peut diverger des comptes figés).
 * Route `/sites/:id/produits/:code` ; produits traceurs uniquement (404 sinon).
 */
export const ficheProduitMoisSchema = z.object({
  site: siteSchema,
  produit: z.object({ code: z.string(), libelle: z.string().nullable() }),
  moisPaqd: moisPaqdSchema.nullable(),
  moisDisponibles: z.array(moisPaqdSchema),
  programmeId: z.string().nullable(),
  inventaires: z.array(inventaireFicheProduitSchema),
  snapshots: z.array(snapshotFicheProduitSchema),
  receptions: z.array(receptionFicheProduitSchema),
  dispensations: z.object({
    total: z.number(),
    nbJours: z.number().int().nonnegative(),
  }),
  ajustements: z.array(ajustementFicheProduitSchema),
  consommation: consommationFicheProduitSchema,
  stockDebut: z.number().nullable(),
  stockFin: z.number().nullable(),
  calculeLe: z.string().datetime().nullable(),
  coreMajLe: z.string().datetime().nullable(),
  reimporteDepuisLeGel: z.boolean(),
});
export type FicheProduitMois = z.infer<typeof ficheProduitMoisSchema>;

// ─── Imports ────────────────────────────────────────────────────────────────

export const STATUTS_IMPORT = ['recu', 'en_cours', 'valide', 'rejete'] as const;
export const statutImportSchema = z.enum(STATUTS_IMPORT);
export type StatutImport = z.infer<typeof statutImportSchema>;

export const GRAVITES = ['info', 'avertissement', 'erreur'] as const;
export const graviteSchema = z.enum(GRAVITES);
export type Gravite = z.infer<typeof graviteSchema>;

export const anomalieImportSchema = z.object({
  onglet: z.string().nullable(),
  ligneSource: z.number().int().positive().nullable(),
  gravite: graviteSchema,
  code: z.string(),
  message: z.string(),
  valeurBrute: z.string().nullable(),
});
export type AnomalieImport = z.infer<typeof anomalieImportSchema>;

export const lotImportSchema = z.object({
  id: z.number().int().positive(),
  nomFichier: z.string(),
  cyclePaqd: z.string().nullable(),
  moisPaqd: moisPaqdSchema.nullable(),
  recuLe: z.string().datetime(),
  importeLe: z.string().datetime().nullable(),
  statut: statutImportSchema,
  motifRejet: z.string().nullable(),
  nbLignesDeclarees: z.record(z.string(), z.number().int().nonnegative()),
  nbLignesReelles: z.record(z.string(), z.number().int().nonnegative()),
});
export type LotImport = z.infer<typeof lotImportSchema>;

/**
 * Résultat d'un import. Union discriminée sur `statut` : un import rejeté n'a
 * pas de lot exploitable et porte toujours au moins une anomalie de gravité
 * `erreur`. Le typage empêche de lire `lot` sur un rejet.
 */
export const resultatImportSchema = z.discriminatedUnion('statut', [
  z.object({
    statut: z.literal('valide'),
    lot: lotImportSchema,
    anomalies: z.array(anomalieImportSchema),
  }),
  z.object({
    statut: z.literal('rejete'),
    motif: z.string(),
    anomalies: z.array(anomalieImportSchema).nonempty(),
  }),
]);
export type ResultatImport = z.infer<typeof resultatImportSchema>;

// ─── Authentification ───────────────────────────────────────────────────────

export const ROLES = ['lecteur', 'coordination', 'admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const identifiantsConnexionSchema = z.object({
  identifiant: z.string().min(1),
  motDePasse: z.string().min(1),
});
export type IdentifiantsConnexion = z.infer<typeof identifiantsConnexionSchema>;

export const utilisateurSchema = z.object({
  id: z.string(),
  identifiant: z.string(),
  nom: z.string(),
  role: roleSchema,
});
export type Utilisateur = z.infer<typeof utilisateurSchema>;

// ─── Administration : grille de paramètres (ADR 0003) ───────────────────────

/** `sup` : conforme si valeur ≥ seuil. `inf` : conforme si valeur ≤ seuil. */
export const SENS_SEUIL = ['sup', 'inf'] as const;
export const sensSeuilSchema = z.enum(SENS_SEUIL);
export type SensSeuil = z.infer<typeof sensSeuilSchema>;

/** Sous-composantes évaluées par taux de conformité : elles portent une tolérance par produit. */
export const SOUS_COMPOSANTES_AVEC_TOLERANCE: readonly SousComposante[] = ['ecart_sdu', 'ecart_consommation'];

export const STATUTS_GRILLE = ['planifiee', 'en_vigueur', 'passee'] as const;
export const statutGrilleSchema = z.enum(STATUTS_GRILLE);
export type StatutGrille = z.infer<typeof statutGrilleSchema>;

export const grilleParametreSchema = z.object({
  id: z.number().int().positive(),
  version: z.string(),
  effetAPartirDe: dateIsoSchema,
  creeLe: z.string().datetime(),
  statut: statutGrilleSchema,
  /** Vrai uniquement pour une version `planifiee` : les autres sont figées (ADR 0003). */
  modifiable: z.boolean(),
});
export type GrilleParametre = z.infer<typeof grilleParametreSchema>;

export const poidsPilierSchema = z.object({
  pilier: pilierSchema,
  poidsPct: pourcentageSchema,
});
export type PoidsPilier = z.infer<typeof poidsPilierSchema>;

export const seuilSousComposanteSchema = z.object({
  sousComposante: sousComposanteSchema,
  seuil: z.number(),
  sens: sensSeuilSchema,
  /** Non nul seulement pour `ecart_sdu` / `ecart_consommation`. */
  tolerance: z.number().nullable(),
  /** Non nul seulement pour `regularite_saisie` : seuil appliqué aux districts (ADR 0011). */
  seuilDistrict: z.number().nullable(),
});
export type SeuilSousComposante = z.infer<typeof seuilSousComposanteSchema>;

export const grilleDetailSchema = grilleParametreSchema.extend({
  poids: z.array(poidsPilierSchema).length(6),
  seuils: z.array(seuilSousComposanteSchema),
});
export type GrilleDetail = z.infer<typeof grilleDetailSchema>;

const sommeCent = (poids: { poidsPct: number }[]): boolean =>
  Math.round(poids.reduce((t, p) => t + p.poidsPct, 0) * 100) === 100_00;

const tolerancesCoherentes = (seuils: SeuilSousComposante[]): boolean =>
  seuils.every((s) =>
    SOUS_COMPOSANTES_AVEC_TOLERANCE.includes(s.sousComposante)
      ? s.tolerance !== null
      : s.tolerance === null,
  );

const seuilsDistrictCoherents = (seuils: SeuilSousComposante[]): boolean =>
  seuils.every((s) =>
    s.sousComposante === 'regularite_saisie' ? s.seuilDistrict !== null : s.seuilDistrict === null,
  );

const couvreToutesLesSousComposantes = (seuils: SeuilSousComposante[]): boolean => {
  const vues = new Set(seuils.map((s) => s.sousComposante));
  return vues.size === seuils.length && SOUS_COMPOSANTES.every((sc) => vues.has(sc));
};

export const entreeGrilleSchema = z
  .object({
    version: z.string().min(1).max(40),
    effetAPartirDe: dateIsoSchema,
    poids: z.array(poidsPilierSchema).length(6),
    seuils: z.array(seuilSousComposanteSchema),
  })
  .refine((g) => sommeCent(g.poids), { message: 'La somme des poids doit faire 100', path: ['poids'] })
  .refine((g) => couvreToutesLesSousComposantes(g.seuils), {
    message: 'Un seuil par sous-composante est requis, sans doublon',
    path: ['seuils'],
  })
  .refine((g) => tolerancesCoherentes(g.seuils), {
    message: 'Tolérance requise pour écart SDU / consommation, interdite ailleurs',
    path: ['seuils'],
  })
  .refine((g) => seuilsDistrictCoherents(g.seuils), {
    message: 'Seuil district requis pour régularité de saisie, interdit ailleurs',
    path: ['seuils'],
  });
export type EntreeGrille = z.infer<typeof entreeGrilleSchema>;

// ─── Administration : comptes ──────────────────────────────────────────────

export const compteAdminSchema = z.object({
  id: z.string(),
  identifiant: z.string(),
  nom: z.string(),
  role: roleSchema,
  actif: z.boolean(),
  creeLe: z.string().datetime(),
});
export type CompteAdmin = z.infer<typeof compteAdminSchema>;

export const entreeCompteSchema = z.object({
  identifiant: z.string().min(1).max(60),
  nom: z.string().min(1).max(120),
  role: roleSchema,
  motDePasse: z.string().min(8).max(200),
});
export type EntreeCompte = z.infer<typeof entreeCompteSchema>;

export const majCompteSchema = z.object({
  nom: z.string().min(1).max(120),
  role: roleSchema,
  actif: z.boolean(),
});
export type MajCompte = z.infer<typeof majCompteSchema>;

export const motDePasseCompteSchema = z.object({
  motDePasse: z.string().min(8).max(200),
});
export type MotDePasseCompte = z.infer<typeof motDePasseCompteSchema>;

// ─── Dates (référence) ──────────────────────────────────────────────────────

export { dateIsoSchema };
