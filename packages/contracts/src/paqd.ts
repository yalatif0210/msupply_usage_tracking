import { z } from 'zod';

/**
 * Vocabulaire du dispositif PAQD, partagé entre l'API et le front.
 *
 * Les schémas Zod sont primaires ; les types s'en déduisent par `z.infer`.
 * Ne jamais déclarer un type à la main puis un schéma en parallèle.
 *
 * Deux niveaux (cf. CONTEXT.md) :
 *   - pilier          : un des six axes P1..P6, doté d'un poids fixe ;
 *   - sous-composante : la grandeur mesurée qui alimente un pilier.
 */

// ─── Piliers ────────────────────────────────────────────────────────────────

export const PILIERS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
export const pilierSchema = z.enum(PILIERS);
export type Pilier = z.infer<typeof pilierSchema>;

export const LIBELLES_PILIER: Record<Pilier, string> = {
  P1: 'Complétude des transactions',
  P2: 'Promptitude des transactions',
  P3: 'Régularité de saisie (dispensation)',
  P4: 'Écart SDU produits traceurs',
  P5: 'Concordance physique / théorique',
  P6: "Ratio d'ajustements",
};

/**
 * Poids PAQD du score composite. Somme = 1 (cf. CLAUDE.md §5).
 *
 * Ces valeurs servent à l'affichage et aux simulations côté front. Le score
 * qui fait foi est calculé en base à partir de la grille de paramètres active
 * (ADR 0003) : le front ne recalcule jamais un score officiel.
 */
export const POIDS_PILIER: Record<Pilier, number> = {
  P1: 0.1,
  P2: 0.15,
  P3: 0.15,
  P4: 0.25,
  P5: 0.25,
  P6: 0.1,
};

// ─── Sous-composantes ───────────────────────────────────────────────────────

export const SOUS_COMPOSANTES = [
  'completude_inventaires',
  'completude_requisitions',
  'completude_receptions',
  'promptitude_inventaires',
  'promptitude_requisitions',
  'regularite_saisie',
  'ecart_sdu',
  'ecart_consommation',
  'concordance',
  'ratio_ajustements',
] as const;
export const sousComposanteSchema = z.enum(SOUS_COMPOSANTES);
export type SousComposante = z.infer<typeof sousComposanteSchema>;

export const PILIER_DE_SOUS_COMPOSANTE: Record<SousComposante, Pilier> = {
  completude_inventaires: 'P1',
  completude_requisitions: 'P1',
  completude_receptions: 'P1',
  promptitude_inventaires: 'P2',
  promptitude_requisitions: 'P2',
  regularite_saisie: 'P3',
  ecart_sdu: 'P4',
  ecart_consommation: 'P4',
  concordance: 'P5',
  ratio_ajustements: 'P6',
};

export const LIBELLES_SOUS_COMPOSANTE: Record<SousComposante, string> = {
  completude_inventaires: 'Complétude des inventaires',
  completude_requisitions: 'Complétude des réquisitions',
  completude_receptions: 'Complétude des réceptions',
  promptitude_inventaires: 'Promptitude des inventaires',
  promptitude_requisitions: 'Promptitude des réquisitions',
  regularite_saisie: 'Régularité de saisie',
  ecart_sdu: 'Écart SDU',
  ecart_consommation: 'Écart consommation',
  concordance: 'Concordance physique / théorique',
  ratio_ajustements: "Ratio d'ajustements",
};

export const SOUS_COMPOSANTES_DU_PILIER: Record<Pilier, readonly SousComposante[]> = {
  P1: ['completude_inventaires', 'completude_requisitions', 'completude_receptions'],
  P2: ['promptitude_inventaires', 'promptitude_requisitions'],
  P3: ['regularite_saisie'],
  P4: ['ecart_sdu', 'ecart_consommation'],
  P5: ['concordance'],
  P6: ['ratio_ajustements'],
};

// ─── Statuts ────────────────────────────────────────────────────────────────

/**
 * Statut d'une sous-composante prise isolément.
 *
 * Binaire : CONFORME si le seuil du pilier est atteint, ALERTE sinon.
 * NON_CALCULABLE signale une absence de données suffisantes (par exemple un
 * écart SDU sans deux inventaires bornant la période) : ces cas sont exclus
 * des agrégats, jamais comptés comme zéro.
 */
export const STATUTS_SOUS_COMPOSANTE = ['CONFORME', 'ALERTE', 'NON_CALCULABLE'] as const;
export const statutSousComposanteSchema = z.enum(STATUTS_SOUS_COMPOSANTE);
export type StatutSousComposante = z.infer<typeof statutSousComposanteSchema>;

/** Classification d'un site à partir de son score composite. */
export const CLASSIFICATIONS = [
  'CONFORME',
  'PARTIELLEMENT_CONFORME',
  'NON_CONFORME',
] as const;
export const classificationSchema = z.enum(CLASSIFICATIONS);
export type Classification = z.infer<typeof classificationSchema>;

/**
 * Seuils de classification du score composite (cf. CLAUDE.md §5).
 * Structurels : ils bornent les trois classes. Les seuils *par sous-composante*
 * vivent dans la grille de paramètres en base.
 */
export const SEUIL_CONFORME = 90;
export const SEUIL_PARTIELLEMENT_CONFORME = 75;

export function classifier(scoreComposite: number): Classification {
  if (scoreComposite >= SEUIL_CONFORME) return 'CONFORME';
  if (scoreComposite >= SEUIL_PARTIELLEMENT_CONFORME) return 'PARTIELLEMENT_CONFORME';
  return 'NON_CONFORME';
}

// ─── Types utilitaires ──────────────────────────────────────────────────────

/** Pourcentage borné à [0, 100]. */
export const pourcentageSchema = z.number().min(0).max(100);
export type Pourcentage = z.infer<typeof pourcentageSchema>;

/** Date calendaire ISO `AAAA-MM-JJ`, sans composante horaire. */
export const dateIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'Date attendue au format AAAA-MM-JJ',
});
export type DateIso = z.infer<typeof dateIsoSchema>;

/** Mois PAQD identifiant `AAAA-MM` (le mois calendaire mesuré). */
export const moisPaqdSchema = z.string().regex(/^\d{4}-\d{2}$/, {
  message: 'Mois PAQD attendu au format AAAA-MM',
});
export type MoisPaqd = z.infer<typeof moisPaqdSchema>;

/** Cycle PAQD identifiant `AAAA-CN` (N ∈ 1..3 : quatre mois consécutifs). */
export const cyclePaqdSchema = z.string().regex(/^\d{4}-C[1-3]$/, {
  message: 'Cycle PAQD attendu au format AAAA-CN',
});
export type CyclePaqd = z.infer<typeof cyclePaqdSchema>;
