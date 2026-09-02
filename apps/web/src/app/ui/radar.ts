import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { StatutSousComposante } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';

/** Un axe du radar : étiquette, valeur 0..100 (ou `null`), statut pour la couleur. */
export interface AxeRadar {
  etiquette: string;
  valeur: number | null;
  statut: StatutSousComposante;
}

const C = 150; // centre
const R = 120; // rayon max (valeur 100)

/**
 * Diagramme en araignée en SVG inline (aucune librairie). Un rayon par axe,
 * longueur = valeur / 100. Étiquette d'axe colorée par le statut (la couleur
 * n'est jamais seule : le libellé d'axe la double). Un axe `null` est tracé au
 * centre et marqué « n/d ».
 */
@Component({
  selector: 'dqa-radar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 300 300" role="img" [attr.aria-label]="resume()">
      @for (g of grille(); track g) {
        <circle [attr.cx]="c" [attr.cy]="c" [attr.r]="g" class="grille" />
      }
      @for (a of sommets(); track $index) {
        <line [attr.x1]="c" [attr.y1]="c" [attr.x2]="a.ax" [attr.y2]="a.ay" class="axe" />
      }
      <polygon [attr.points]="trace()" class="forme" />
      @for (a of sommets(); track $index) {
        <circle [attr.cx]="a.x" [attr.cy]="a.y" r="3" class="point" />
        <text [attr.x]="a.lx" [attr.y]="a.ly" [attr.text-anchor]="a.ancre" [class]="'lib ' + a.statut">
          {{ a.etiquette }}
        </text>
      }
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; max-width: 22rem; height: auto; display: block; margin: 0 auto; }
    .grille { fill: none; stroke: var(--bordure); stroke-width: 1; }
    .axe { stroke: var(--bordure); stroke-width: 1; }
    .forme { fill: var(--marque); fill-opacity: 0.2; stroke: var(--marque); stroke-width: 2; }
    .point { fill: var(--marque); }
    .lib { font-size: 9px; fill: var(--texte-doux); }
    .lib.CONFORME { fill: var(--conforme-texte); }
    .lib.ALERTE { fill: var(--alerte-texte); }
    .lib.NON_CALCULABLE { fill: var(--texte-tres-doux); }
  `,
})
export class Radar {
  readonly axes = input.required<AxeRadar[]>();

  protected readonly c = C;
  protected readonly grille = computed(() => [0.25, 0.5, 0.75, 1].map((f) => R * f));

  private angle(i: number): number {
    return -Math.PI / 2 + (i / this.axes().length) * 2 * Math.PI;
  }

  protected readonly sommets = computed(() =>
    this.axes().map((a, i) => {
      const ang = this.angle(i);
      const r = ((a.valeur ?? 0) / 100) * R;
      const rl = R + 14;
      const cos = Math.cos(ang);
      return {
        etiquette: a.etiquette,
        statut: a.statut,
        x: C + r * cos,
        y: C + r * Math.sin(ang),
        ax: C + R * cos,
        ay: C + R * Math.sin(ang),
        lx: C + rl * cos,
        ly: C + rl * Math.sin(ang) + 3,
        ancre: cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle',
      };
    }),
  );

  protected readonly trace = computed(() =>
    this.sommets()
      .map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`)
      .join(' '),
  );

  protected readonly resume = computed(() =>
    this.axes()
      .map((a) => `${a.etiquette} ${a.valeur === null ? VALEUR_ABSENTE : Math.round(a.valeur)}`)
      .join(', '),
  );
}
