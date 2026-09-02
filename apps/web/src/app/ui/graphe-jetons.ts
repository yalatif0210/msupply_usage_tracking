import { DOCUMENT, inject, Injectable } from '@angular/core';

/**
 * Résolution des jetons de couleur du thème en chaînes concrètes pour
 * ApexCharts.
 *
 * ApexCharts pose les couleurs de série en attribut SVG (`fill`, `stroke`) et
 * ne résout pas `var(--x)`. On lit donc la valeur calculée du jeton sur
 * `:root` (les `--chart-*` y sont définis, DESIGN_SYSTEM §2) et on la normalise
 * en `#rrggbb` via le canvas 2D, pour que le calcul d'opacité d'ApexCharts
 * (remplissage du radar) reçoive un hexa exploitable. Le thème est statique et
 * en mode clair unique : chaque jeton n'est résolu qu'une fois.
 */

/** Jetons de série du thème, cyclés au-delà de cinq. */
export const JETONS_SERIE = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

@Injectable({ providedIn: 'root' })
export class JetonsGraphe {
  private readonly doc = inject(DOCUMENT);
  private readonly cache = new Map<string, string>();

  /** Couleur concrète (`#rrggbb` si possible) d'une propriété custom du thème. */
  jeton(propriete: string): string {
    const enCache = this.cache.get(propriete);
    if (enCache !== undefined) return enCache;
    const brut = this.valeurCalculee(propriete);
    const resolue = this.versHexa(brut) ?? brut;
    this.cache.set(propriete, resolue);
    return resolue;
  }

  /** `n` couleurs de série, palette `--chart-*` cyclée au-delà de cinq. */
  palette(n: number): string[] {
    const total = Math.max(0, Math.trunc(n));
    return Array.from({ length: total }, (_, i) => this.jeton(JETONS_SERIE[i % JETONS_SERIE.length]!));
  }

  private valeurCalculee(propriete: string): string {
    const vue = this.doc.defaultView;
    if (!vue) return '';
    return vue.getComputedStyle(this.doc.documentElement).getPropertyValue(propriete).trim();
  }

  private versHexa(couleur: string): string | null {
    if (!couleur) return null;
    const contexte = this.doc.createElement('canvas').getContext('2d');
    if (!contexte) return null;
    contexte.fillStyle = '#000000';
    contexte.fillStyle = couleur;
    const resolue = contexte.fillStyle;
    return typeof resolue === 'string' && resolue.startsWith('#') ? resolue : null;
  }
}
