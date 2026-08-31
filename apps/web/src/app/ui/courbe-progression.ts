import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PointProgression } from '@dqa/contracts';

const COULEUR_CLASSE: Record<string, string> = {
  CONFORME: '#1b5e20',
  PARTIELLEMENT_CONFORME: '#7a5200',
  NON_CONFORME: '#8a1c13',
};

/** Géométrie du tracé, en unités du `viewBox` (400 × 200). */
const X0 = 44;
const X1 = 388;
const Y0 = 176; // score 0
const Y1 = 16; // score 100
const seuils = [75, 90];

const x = (rang: number): number => X0 + ((rang - 1) / 3) * (X1 - X0);
const y = (score: number): number => Y0 + (score / 100) * (Y1 - Y0);

/**
 * Courbe du score composite sur les quatre mois d'un cycle PAQD (M+1..M+4).
 * SVG inline — pas de librairie de graphes (DESIGN_SYSTEM.md §5). Repères
 * horizontaux aux seuils de classification (75, 90). Un mois non mesuré ou
 * sans score composite est un trou : la ligne saute.
 */
@Component({
  selector: 'dqa-courbe-progression',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 400 200" role="img" [attr.aria-label]="resume()" class="courbe">
      <!-- cadre -->
      <line [attr.x1]="x0" [attr.y1]="y0" [attr.x2]="x1" [attr.y2]="y0" class="axe" />
      <line [attr.x1]="x0" [attr.y1]="y0" [attr.x2]="x0" [attr.y2]="y1" class="axe" />

      <!-- repères de seuil -->
      @for (s of seuilsRepere(); track s.valeur) {
        <line [attr.x1]="x0" [attr.y1]="s.y" [attr.x2]="x1" [attr.y2]="s.y" class="seuil" />
        <text [attr.x]="x0 - 6" [attr.y]="s.y + 3" class="graduation" text-anchor="end">{{ s.valeur }}</text>
      }

      <!-- axe des mois -->
      @for (t of ticksX(); track t.rang) {
        <text [attr.x]="t.x" [attr.y]="y0 + 16" class="graduation" text-anchor="middle">M+{{ t.rang }}</text>
      }

      <!-- segments entre points mesurés consécutifs -->
      @for (seg of segments(); track seg.cle) {
        <line [attr.x1]="seg.x1" [attr.y1]="seg.y1" [attr.x2]="seg.x2" [attr.y2]="seg.y2" class="trace" />
      }

      <!-- points -->
      @for (p of pointsTraces(); track p.rang) {
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4" [attr.fill]="p.couleur" />
        <text [attr.x]="p.x" [attr.y]="p.y - 9" class="valeur" text-anchor="middle">{{ p.score }}</text>
      }
    </svg>
  `,
  styles: `
    .courbe { width: 100%; max-width: 42rem; height: auto; display: block; }
    .axe { stroke: #1a1a1a; stroke-width: 1; }
    .seuil { stroke: #b9b9b6; stroke-width: 1; stroke-dasharray: 3 3; }
    .trace { stroke: #1f3d7a; stroke-width: 2; }
    .graduation { fill: #5b5b5b; font-size: 10px; }
    .valeur { fill: #1a1a1a; font-size: 10px; font-weight: 600; }
  `,
})
export class CourbeProgressionComponent {
  readonly points = input.required<PointProgression[]>();

  protected readonly x0 = X0;
  protected readonly x1 = X1;
  protected readonly y0 = Y0;
  protected readonly y1 = Y1;

  protected seuilsRepere() {
    return seuils.map((valeur) => ({ valeur, y: y(valeur) }));
  }

  protected ticksX() {
    return [1, 2, 3, 4].map((rang) => ({ rang, x: x(rang) }));
  }

  protected readonly pointsTraces = computed(() =>
    this.points()
      .filter((p) => p.scoreComposite !== null)
      .map((p) => ({
        rang: p.rang,
        score: p.scoreComposite as number,
        x: x(p.rang),
        y: y(p.scoreComposite as number),
        couleur: (p.classification && COULEUR_CLASSE[p.classification]) || '#5b5b5b',
      })),
  );

  protected readonly segments = computed(() => {
    const pts = this.pointsTraces();
    const out: { cle: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      out.push({ cle: `${a.rang}-${b.rang}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    return out;
  });

  protected resume(): string {
    const pts = this.pointsTraces();
    if (pts.length === 0) return 'Aucun score composite à tracer.';
    return pts.map((p) => `M+${p.rang} : ${p.score}`).join(', ');
  }
}
