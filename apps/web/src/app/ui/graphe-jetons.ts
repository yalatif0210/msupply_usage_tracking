import { DOCUMENT, inject, Injectable } from '@angular/core';

/**
 * Resolution des jetons de couleur du theme en chaines concretes pour
 * ApexCharts.
 *
 * ApexCharts pose les couleurs de serie en attribut SVG (`fill`, `stroke`) et
 * ne resout pas `var(--x)`. Il faut donc lui passer des couleurs deja
 * calculees. On lit la valeur calculee d'une propriete custom via une sonde
 * detachee de l'affichage, puis on normalise en `#rrggbb` par le canvas 2D
 * (qui accepte aussi bien `oklch(...)` que `rgb(...)`), pour que le calcul
 * d'opacite d'ApexCharts (remplissage du radar) recoive un hexa exploitable.
 */

/** Jetons de serie du theme (DESIGN_SYSTEM.md 2), cycles au-dela de cinq. */
export const JETONS_SERIE = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const;

@Injectable({ providedIn: 'root' })
export class JetonsGraphe {
  private readonly doc = inject(DOCUMENT);

  /** Couleur concrete (`#rrggbb` si possible) d'une propriete custom du theme. */
  jeton(propriete: string): string {
    const brut = this.valeurCalculee(propriete);
    return this.versHexa(brut) ?? brut;
  }

  /** `n` couleurs de serie, palette `--chart-*` cyclee au-dela de cinq. */
  palette(n: number): string[] {
    const total = Math.max(0, Math.trunc(n));
    return Array.from({ length: total }, (_, i) => this.jeton(JETONS_SERIE[i % JETONS_SERIE.length]!));
  }

  private valeurCalculee(propriete: string): string {
    const vue = this.doc.defaultView;
    const racine = this.doc.documentElement;
    if (!vue) return '';
    const sonde = this.doc.createElement('span');
    sonde.style.color = `var(${propriete})`;
    sonde.style.position = 'absolute';
    sonde.style.opacity = '0';
    sonde.style.pointerEvents = 'none';
    racine.appendChild(sonde);
    const calculee = vue.getComputedStyle(sonde).color;
    sonde.remove();
    return (calculee || vue.getComputedStyle(racine).getPropertyValue(propriete)).trim();
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
