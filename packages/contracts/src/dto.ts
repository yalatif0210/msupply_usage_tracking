import { z } from 'zod';
import {
  classificationSchema,
  dateIsoSchema,
  moisPaqdSchema,
  pilierSchema,
  pourcentageSchema,
  sousComposanteSchema,
  statutSousComposanteSchema,
} from './paqd.js';

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
  scoresPiliers: z.array(
    z.object({ pilier: pilierSchema, score: pourcentageSchema.nullable() }),
  ),
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

// ─── Dates (référence) ──────────────────────────────────────────────────────

export { dateIsoSchema };
