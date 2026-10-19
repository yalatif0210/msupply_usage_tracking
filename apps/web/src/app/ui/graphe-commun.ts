import type { ApexAnnotations } from 'ng-apexcharts';

/**
 * Fond commun aux composants de graphe (`graphe-radar`, `graphe-courbe`,
 * `graphe-sparkline`). Les règles de DESIGN_SYSTEM §8 qui doivent être
 * identiques partout (police du thème, pas de barre d'outils, pas d'animation
 * d'entrée, repères de seuil) vivent ici : une seule édition pour les trois.
 */

export const POLICE_GRAPHE = 'var(--font-sans)';
export const VALEUR_ABSENTE_GRAPHE = 'n/d';

const NOMBRE_FR = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Étiquette d'axe ou d'infobulle au format français (« 27,5 », pas « 27.5 »). */
export function nombreGraphe(valeur: number | null | undefined): string {
  return valeur === null || valeur === undefined || Number.isNaN(valeur) ? VALEUR_ABSENTE_GRAPHE : NOMBRE_FR.format(valeur);
}

/** Champs `chart` communs : à étaler dans chaque `ApexChart`. */
export const CHART_BASE = {
  fontFamily: POLICE_GRAPHE,
  toolbar: { show: false },
  animations: { enabled: false },
} as const;

/**
 * Lignes de seuil horizontales (annotations Y pointillées). `trait` est une
 * couleur déjà résolue (`--muted-foreground`). `avecEtiquette` ajoute le
 * libellé « seuil N » (courbe) ; sans, un simple trait (sparkline).
 */
export function seuilsYAxis(
  seuils: readonly number[],
  trait: string,
  options: { avecEtiquette: boolean; fond?: string; tirets?: number } = { avecEtiquette: false },
): NonNullable<ApexAnnotations['yaxis']> {
  return seuils.map((valeur) => ({
    y: valeur,
    borderColor: trait,
    strokeDashArray: options.tirets ?? (options.avecEtiquette ? 4 : 3),
    ...(options.avecEtiquette
      ? {
          label: {
            text: `seuil ${valeur}`,
            position: 'left' as const,
            textAnchor: 'start' as const,
            borderWidth: 0,
            style: {
              color: trait,
              background: options.fond ?? 'transparent',
              fontSize: '11px',
              fontFamily: POLICE_GRAPHE,
            },
          },
        }
      : {}),
  }));
}
