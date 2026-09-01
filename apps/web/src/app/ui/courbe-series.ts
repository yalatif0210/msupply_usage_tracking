import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Une série de la courbe : un nom (légende) et une valeur par étiquette d'axe (ou `null` = trou). */
export interface SerieCourbe {
  nom: string;
  points: (number | null)[];
}

const X0 = 34;
const X1 = 392;
const Y0 = 176;
const Y1 = 12;
/**
 * Palette de tracé, cyclée si plus de séries. Teintes non sémantiques (jetons
 * `--serie-*`) : une courbe « par pilier » ne porte pas de statut.
 */
const COULEURS = [
  'var(--serie-1)',
  'var(--serie-2)',
  'var(--serie-3)',
  'var(--serie-4)',
  'var(--serie-5)',
  'var(--serie-6)',
];

/**
 * Courbe multi-séries en SVG inline (aucune librairie). Toutes les séries
 * partagent l'axe X (`etiquettes`) et l'échelle Y `[min, max]`. Une valeur
 * `null` laisse un trou (ne relie que des points consécutifs mesurés).
 * Repères horizontaux étiquetés (`seuils`). Légende sous le graphe.
 */
@Component({
  selector: 'dqa-courbe-series',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 400 200" role="img" [attr.aria-label]="resume()">
      <line [attr.x1]="x0" [attr.y1]="y0" [attr.x2]="x1" [attr.y2]="y0" class="axe" />
      <line [attr.x1]="x0" [attr.y1]="y0" [attr.x2]="x0" [attr.y2]="y1" class="axe" />
      @for (s of repere(); track s.valeur) {
        <line [attr.x1]="x0" [attr.y1]="s.y" [attr.x2]="x1" [attr.y2]="s.y" class="seuil" />
        <text [attr.x]="x0 - 4" [attr.y]="s.y + 3" class="graduation" text-anchor="end">{{ s.valeur }}</text>
      }
      @for (t of ticksX(); track t.i) {
        <text [attr.x]="t.x" [attr.y]="y0 + 14" class="graduation" [attr.text-anchor]="t.ancre">{{ t.etiquette }}</text>
      }
      @for (tr of traces(); track tr.nom) {
        @for (seg of tr.segments; track seg.cle) {
          <line [attr.x1]="seg.x1" [attr.y1]="seg.y1" [attr.x2]="seg.x2" [attr.y2]="seg.y2"
                [style.stroke]="tr.couleur" class="trace" />
        }
        @for (p of tr.points; track p.i) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" [style.fill]="tr.couleur" />
        }
      }
    </svg>
    <ul class="legende">
      @for (tr of traces(); track tr.nom) {
        <li><span class="pastille" [style.background]="tr.couleur"></span>{{ tr.nom }}</li>
      }
    </ul>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; max-width: 44rem; height: auto; display: block; }
    .axe { stroke: var(--texte); stroke-width: 1; }
    .seuil { stroke: var(--texte-tres-doux); stroke-width: 1; stroke-dasharray: 3 3; }
    .graduation { fill: var(--texte-doux); font-size: 9px; }
    .trace { stroke-width: 2; }
    .legende { list-style: none; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin: 0.4rem 0 0; padding: 0; font-size: 0.8rem; color: var(--texte-doux); }
    .pastille { display: inline-block; width: 0.7rem; height: 0.7rem; margin-right: 0.35rem; vertical-align: middle; }
  `,
})
export class CourbeSeries {
  readonly etiquettes = input.required<string[]>();
  readonly series = input.required<SerieCourbe[]>();
  readonly seuils = input<number[]>([]);
  readonly min = input(0);
  readonly max = input(100);

  protected readonly x0 = X0;
  protected readonly x1 = X1;
  protected readonly y0 = Y0;
  protected readonly y1 = Y1;

  private y(v: number): number {
    return Y0 + ((v - this.min()) / (this.max() - this.min())) * (Y1 - Y0);
  }

  private x(i: number): number {
    const n = this.etiquettes().length;
    return n < 2 ? (X0 + X1) / 2 : X0 + (i / (n - 1)) * (X1 - X0);
  }

  protected readonly repere = computed(() => this.seuils().map((valeur) => ({ valeur, y: this.y(valeur) })));

  protected readonly ticksX = computed(() => {
    const n = this.etiquettes().length;
    return this.etiquettes().map((etiquette, i) => ({
      i,
      etiquette,
      x: this.x(i),
      // les libellés de bord débordent du viewBox s'ils restent centrés
      ancre: n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle',
    }));
  });

  protected readonly traces = computed(() =>
    this.series().map((s, si) => {
      const couleur = COULEURS[si % COULEURS.length]!;
      const points = s.points
        .map((v, i) => ({ i, v }))
        .filter((p): p is { i: number; v: number } => p.v !== null)
        .map((p) => ({ i: p.i, x: this.x(p.i), y: this.y(p.v) }));
      const segments: { cle: string; x1: number; y1: number; x2: number; y2: number }[] = [];
      for (let k = 1; k < points.length; k++) {
        const a = points[k - 1]!;
        const b = points[k]!;
        if (b.i - a.i === 1) {
          segments.push({ cle: `${s.nom}-${a.i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        }
      }
      return { nom: s.nom, couleur, points, segments };
    }),
  );

  protected readonly resume = computed(() =>
    this.series()
      .map((s) => `${s.nom} : ${s.points.map((v) => v ?? '·').join(' ')}`)
      .join(' ; '),
  );
}
