import { z } from 'zod';
import {
  classificationSchema,
  cyclePaqdSchema,
  dateIsoSchema,
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

export const scorePilierSchema = z.object({
  pilier: pilierSchema,
  libelle: z.string(),
  poids: z.number(),
  /** Score sur 100, ou `null` si toutes les sous-composantes sont NON_CALCULABLE. */
  score: pourcentageSchema.nullable(),
  sousComposantes: z.array(mesureSousComposanteSchema),
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
  /** Mois PAQD le plus récent présent dans l'historique gelé, ou `null` si aucun. */
  moisPaqd: moisPaqdSchema.nullable(),
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

// ─── Drill-down par produit de l'écart SDU / consommation (P4) ───────────────

/** Raison pour laquelle un produit est exclu du calcul de l'écart consommation. */
export const raisonExclusionConsoSchema = z.enum([
  'un_seul_inventaire',
  'reconstituee_non_positive',
]);
export type RaisonExclusionConso = z.infer<typeof raisonExclusionConsoSchema>;

/** `ecartPct` nul = écart infini (compté 0, théorique > 0). */
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

export const ligneEcartProduitP4Schema = z.object({
  produitCode: z.string(),
  libelle: z.string().nullable(),
  sdu: ecartSduProduitSchema,
  consommation: ecartConsoProduitSchema,
});
export type LigneEcartProduitP4 = z.infer<typeof ligneEcartProduitP4Schema>;

export const detailP4ProduitsSchema = z.object({
  site: siteSchema,
  moisPaqd: moisPaqdSchema.nullable(),
  moisDisponibles: z.array(moisPaqdSchema),
  programmeId: z.string().nullable(),
  /** Un item par produit traceur inventorié ; SDU hors tolérance d'abord. */
  produits: z.array(ligneEcartProduitP4Schema),
});
export type DetailP4Produits = z.infer<typeof detailP4ProduitsSchema>;

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
