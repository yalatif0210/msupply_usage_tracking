import { z } from 'zod';

/**
 * Vocabulaire du dispositif PAQD.
 *
 * Ce fichier est la source de vérité partagée entre l'API et le front.
 * Les schémas Zod sont primaires ; les types s'en déduisent par z.infer.
 * Ne jamais déclarer un type à la main puis un schéma en parallèle.
 */

// ─── Piliers ────────────────────────────────────────────────────────────────

export const PILIERS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
export const pilierSchema = z.enum(PILIERS);
export type Pilier = z.infer<typeof pilierSchema>;

export const LIBELLES_PILIER: Record<Pilier, string> = {
  P1: 'Complétude des transactions',
  P2: 'Promptitude des transactions',
  P3: 'Régularité de saisie (dispensation)',
  P4: 'Précision des données',
  P5: 'Concordance physique et théorique',
  P6: 'Analyse des ajustements',
};

// ─── Statuts ────────────────────────────────────────────────────────────────

/**
 * Statut d'un indicateur pris isolément.
 *
 * NON_CALCULABLE n'est pas un échec : il signale une absence de données
 * suffisantes (par exemple un écart SDU sans deux inventaires bornant la
 * période). Ces cas sont exclus des moyennes plutôt que comptés comme zéro.
 */
export const STATUTS_INDICATEUR = [
  'CONFORME',
  'PARTIEL',
  'ALERTE',
  'NON_CALCULABLE',
] as const;
export const statutIndicateurSchema = z.enum(STATUTS_INDICATEUR);
export type StatutIndicateur = z.infer<typeof statutIndicateurSchema>;

/** Classification d'un site à partir de son score composite. */
export const CLASSIFICATIONS = [
  'CONFORME',
  'PARTIELLEMENT_CONFORME',
  'NON_CONFORME',
] as const;
export const classificationSchema = z.enum(CLASSIFICATIONS);
export type Classification = z.infer<typeof classificationSchema>;

/** Seuils de classification. Doivent rester alignés sur `param_seuil` en base. */
export const SEUIL_CONFORME = 90;
export const SEUIL_PARTIEL = 75;

export function classifier(score: number): Classification {
  if (score >= SEUIL_CONFORME) return 'CONFORME';
  if (score >= SEUIL_PARTIEL) return 'PARTIELLEMENT_CONFORME';
  return 'NON_CONFORME';
}

// ─── Composantes du score ───────────────────────────────────────────────────

export const COMPOSANTES = [
  'completude',
  'promptitude',
  'regularite_des_saisies',
  'precision',
  'concordance',
  'ajustements',
] as const;
export const composanteSchema = z.enum(COMPOSANTES);
export type Composante = z.infer<typeof composanteSchema>;

/**
 * Pondération PAQD du score composite. Somme = 1.
 *
 * Ces valeurs servent à l'affichage et aux simulations côté front. Le score
 * faisant foi est calculé par la vue `mv_score_composite` en base : le front
 * ne doit jamais recalculer un score pour l'afficher comme officiel.
 */
export const POIDS: Record<Composante, number> = {
  completude: 0.1,
  promptitude: 0.15,
  regularite_des_saisies: 0.15,
  precision: 0.25,
  concordance: 0.25,
  ajustements: 0.1,
};

export const PILIER_DE_COMPOSANTE: Record<Composante, Pilier> = {
  completude: 'P1',
  promptitude: 'P2',
  regularite_des_saisies: 'P3',
  precision: 'P4',
  concordance: 'P5',
  ajustements: 'P6',
};

export const LIBELLES_COMPOSANTE: Record<Composante, string> = {
  completude: 'Complétude des transactions',
  promptitude: 'Promptitude des transactions',
  regularite_des_saisies: 'Régularité des saisies',
  precision: 'Écart SDU produits traceurs',
  concordance: 'Concordance physique et théorique',
  ajustements: "Ratio d'ajustements",
};

// ─── Types utilitaires ──────────────────────────────────────────────────────

/** Pourcentage borné à [0, 100], arrondi au dixième. */
export const pourcentageSchema = z.number().min(0).max(100);
export type Pourcentage = z.infer<typeof pourcentageSchema>;

/** Date calendaire au format ISO `AAAA-MM-JJ`, sans composante horaire. */
export const dateIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'Date attendue au format JJ-MM-AAAA',
});
export type DateIso = z.infer<typeof dateIsoSchema>;
