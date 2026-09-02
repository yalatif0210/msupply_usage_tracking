import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Un point de la mini-courbe : une étiquette d'axe et une valeur (ou `null` = trou). */
export interface PointMiniCourbe {
  etiquette: string;
  valeur: number | null;
}

/** Géométrie du tracé, en unités du `viewBox` (320 × 90). */
const X0 = 24;
const X1 = 314;
const Y0 = 84;
const Y1 = 6;

/**
 * Courbe compacte d'une série datée, en SVG inline (aucune librairie de
 * graphes). Ne relie que des points **consécutifs mesurés** : une valeur
 * `null` laisse un trou. Repères horizontaux facultatifs, étiquetés.
 */
@Component({
  selector: 'dqa-mini-courbe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 320 90" role="img" [attr.aria-label]="resume()">
      @for (s of repere(); track s.valeur) {
        <line [attr.x1]="x0" [attr.y1]="s.y" [attr.x2]="x1" [attr.y2]="s.y" class="seuil" />
        <text [attr.x]="x0 - 3" [attr.y]="s.y + 3" class="graduation" text-anchor="end">{{ s.valeur }}</text>
      }
      @for (seg of segments(); track seg.cle) {
        <line [attr.x1]="seg.x1" [attr.y1]="seg.y1" [attr.x2]="seg.x2" [attr.y2]="seg.y2" class="trace" />
      }
      @for (p of tracables(); track p.etiquette) {
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" class="point" />
      }
    </svg>
    <ul class="axe">
      @for (p of points(); track p.etiquette) {
        <li>{{ p.etiquette }}</li>
      }
    </ul>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; max-width: 40rem; height: auto; display: block; border: 1px solid var(--bordure); background: var(--surface); }
    .seuil { stroke: var(--texte-tres-doux); stroke-width: 1; stroke-dasharray: 3 3; }
    .graduation { fill: var(--texte-doux); font-size: 9px; }
    .trace { stroke: var(--marque); stroke-width: 2; }
    .point { fill: var(--marque); }
    .axe { list-style: none; display: flex; justify-content: space-between; max-width: 40rem; margin: 0.3rem 0 0; padding: 0 0 0 1.3rem; font-size: 0.75rem; color: var(--texte-doux); }
  `,
})
export class MiniCourbe {
  readonly points = input.required<PointMiniCourbe[]>();
  readonly seuils = input<number[]>([]);
  readonly min = input(0);
  readonly max = input(100);

  protected readonly x0 = X0;
  protected readonly x1 = X1;

  private y(valeur: number): number {
    const { min, max } = { min: this.min(), max: this.max() };
    return Y0 + ((valeur - min) / (max - min)) * (Y1 - Y0);
  }

  private x(index: number): number {
    const n = this.points().length;
    return n < 2 ? (X0 + X1) / 2 : X0 + (index / (n - 1)) * (X1 - X0);
  }

  protected repere() {
    return this.seuils().map((valeur) => ({ valeur, y: this.y(valeur) }));
  }

  protected readonly tracables = computed(() =>
    this.points()
      .map((p, i) => ({ ...p, i }))
      .filter((p): p is typeof p & { valeur: number } => p.valeur !== null)
      .map((p) => ({ etiquette: p.etiquette, x: this.x(p.i), y: this.y(p.valeur) })),
  );

  /** Un segment entre deux points seulement s'ils sont **adjacents** et tous deux mesurés. */
  protected readonly segments = computed(() => {
    const pts = this.points();
    const out: { cle: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (a.valeur !== null && b.valeur !== null) {
        out.push({ cle: a.etiquette, x1: this.x(i - 1), y1: this.y(a.valeur), x2: this.x(i), y2: this.y(b.valeur) });
      }
    }
    return out;
  });

  protected resume(): string {
    const pts = this.points().filter((p) => p.valeur !== null);
    return pts.length === 0
      ? 'Aucune valeur à tracer.'
      : pts.map((p) => `${p.etiquette} : ${p.valeur}`).join(', ');
  }
}
