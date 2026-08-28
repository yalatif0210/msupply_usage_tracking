import { z } from 'zod';
import {
  classificationSchema,
  composanteSchema,
  dateIsoSchema,
  pilierSchema,
  pourcentageSchema,
  statutIndicateurSchema,
} from './paqd.js';

/**
 * DTO exposés par l'API et consommés par le front.
 *
 * Chaque DTO correspond à une vue matérialisée ou à une agrégation de vues.
 * Un DTO n'est jamais une entité base : il peut omettre des colonnes,
 * renommer, ou combiner plusieurs sources.
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

export const produitSchema = z.object({
  produitId: z.string(),
  produitCode: z.string().nullable(),
  produitNom: z.string(),
  unite: z.string().nullable(),
  estTraceur: z.boolean(),
  programme: z.string().nullable(),
});
export type Produit = z.infer<typeof produitSchema>;

// ─── Score par site ─────────────────────────────────────────────────────────

export const scoreSiteSchema = siteSchema.extend({
  composantes: z.record(composanteSchema, pourcentageSchema),
  scoreComposite: pourcentageSchema,
  classification: classificationSchema,
  calculeLe: z.string().datetime(),
});
export type ScoreSite = z.infer<typeof scoreSiteSchema>;

/** Point de la courbe de progression d'un site. */
export const pointHistoriqueSchema = z.object({
  dateMesure: dateIsoSchema,
  scoreComposite: pourcentageSchema,
  classification: classificationSchema,
});
export type PointHistorique = z.infer<typeof pointHistoriqueSchema>;

export const historiqueSiteSchema = z.object({
  siteId: z.string(),
  siteNom: z.string(),
  points: z.array(pointHistoriqueSchema),
});
export type HistoriqueSite = z.infer<typeof historiqueSiteSchema>;

// ─── Détail d'un indicateur ─────────────────────────────────────────────────

/**
 * Ligne de détail d'un indicateur pour un site.
 *
 * `valeur` et `statut` sont nullables ensemble : quand le statut vaut
 * NON_CALCULABLE, la valeur est absente. Le front doit traiter ce cas
 * explicitement plutôt que d'afficher 0.
 */
export const detailIndicateurSchema = z.object({
  pilier: pilierSchema,
  code: z.string(),
  libelle: z.string(),
  valeur: z.number().nullable(),
  unite: z.enum(['pct', 'jours', 'nombre']),
  seuilConforme: z.number().nullable(),
  statut: statutIndicateurSchema,
  commentaire: z.string().nullable(),
});
export type DetailIndicateur = z.infer<typeof detailIndicateurSchema>;

export const detailSiteSchema = z.object({
  site: siteSchema,
  score: scoreSiteSchema.omit({ siteId: true, siteNom: true }).partial({
    siteCode: true,
    district: true,
    region: true,
    typeStructure: true,
  }),
  indicateurs: z.array(detailIndicateurSchema),
});
export type DetailSite = z.infer<typeof detailSiteSchema>;

// ─── Synthèse nationale ─────────────────────────────────────────────────────

export const syntheseNationaleSchema = z.object({
  nbSites: z.number().int().nonnegative(),
  scoreMoyen: pourcentageSchema,
  nbConformes: z.number().int().nonnegative(),
  nbPartiels: z.number().int().nonnegative(),
  nbNonConformes: z.number().int().nonnegative(),
  tauxConformitePct: pourcentageSchema,
  moyennesParComposante: z.record(composanteSchema, pourcentageSchema),
  derniereMiseAJour: dateIsoSchema.nullable(),
});
export type SyntheseNationale = z.infer<typeof syntheseNationaleSchema>;

// ─── Imports ────────────────────────────────────────────────────────────────

export const STATUTS_IMPORT = ['recu', 'en_cours', 'valide', 'rejete'] as const;
export const statutImportSchema = z.enum(STATUTS_IMPORT);
export type StatutImport = z.infer<typeof statutImportSchema>;

export const GRAVITES = ['info', 'avertissement', 'erreur'] as const;
export const graviteSchema = z.enum(GRAVITES);
export type Gravite = z.infer<typeof graviteSchema>;

export const anomalieImportSchema = z.object({
  onglet: z.string(),
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
  dateExportDeclaree: dateIsoSchema,
  periodeDebut: dateIsoSchema,
  periodeFin: dateIsoSchema,
  recuLe: z.string().datetime(),
  importeLe: z.string().datetime().nullable(),
  statut: statutImportSchema,
  nbLignesDeclarees: z.record(z.string(), z.number().int().nonnegative()),
  nbLignesReelles: z.record(z.string(), z.number().int().nonnegative()),
});
export type LotImport = z.infer<typeof lotImportSchema>;

/**
 * Résultat d'un import.
 *
 * Union discriminée sur `statut` : un import rejeté n'a pas de lot exploitable
 * et porte toujours au moins une anomalie de gravité `erreur`. Le typage
 * empêche de lire `lot` sur un rejet.
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

// ─── Filtres de requête ─────────────────────────────────────────────────────

export const filtreSitesSchema = z.object({
  district: z.string().optional(),
  region: z.string().optional(),
  classification: classificationSchema.optional(),
  scoreMin: pourcentageSchema.optional(),
  scoreMax: pourcentageSchema.optional(),
});
export type FiltreSites = z.infer<typeof filtreSitesSchema>;
