import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CLASSIFICATIONS, type Classification, type PointProgression } from '@dqa/contracts';

const COULEUR_CLASSE: Record<Classification, string> = {
  CONFORME: 'var(--conforme-texte)',
  PARTIELLEMENT_CONFORME: 'var(--partiel-texte)',
  NON_CONFORME: 'var(--alerte-texte)',
};
const LIBELLE_CLASSE: Record<Classification, string> = {
  CONFORME: 'Conforme',
  PARTIELLEMENT_CONFORME: 'Partiellement conforme',
  NON_CONFORME: 'Non conforme',
};
const COULEUR_SANS = 'var(--texte-doux)';

/** Géométrie du tracé, en unités du `viewBox` (400 × 200). */
const X0 = 44;
const X1 = 388;
const Y0 = 176; // score 0
const Y1 = 16; // score 100
const seuils = [75, 90];

const x = (rang: number): number => X0 + ((rang - 1) / 3) * (X1 - X0);
const y = (score: number): number => Y0 + (score / 100) * (Y1 - Y0);

interface PointMesure {
  rang: number;
  score: number;
  classification: Classification | null;
}
const estMesure = (p: PointProgression): p is PointProgression & { scoreComposite: number } =>
  p.scoreComposite !== null;

/**
 * Courbe du score composite sur les quatre mois d'un cycle PAQD (M+1..M+4).
 * SVG inline, sans librairie de graphes (DESIGN_SYSTEM.md §5). Repères
 * horizontaux aux seuils de classification (75, 90). Un mois non mesuré (ou
 * sans score composite) est un trou : la ligne ne relie que des mois
 * consécutifs. La couleur des points est doublée par la légende sous le
 * graphique (DESIGN_SYSTEM.md §1).
 */
@Component({
  selector: 'dqa-courbe-progression',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 400 200" role="img" [attr.aria-label]="resume()" class="courbe">
      <line [attr.x1]="x0" [attr.y1]="y0" [attr.x2]="x1" [attr.y2]="y0" class="axe" />
      <line [attr.x1]="x0" [attr.y1]="y0" [attr.x2]="x0" [attr.y2]="y1" class="axe" />

      @for (s of seuilsRepere(); track s.valeur) {
        <line [attr.x1]="x0" [attr.y1]="s.y" [attr.x2]="x1" [attr.y2]="s.y" class="seuil" />
        <text [attr.x]="x0 - 6" [attr.y]="s.y + 3" class="graduation" text-anchor="end">{{ s.valeur }}</text>
      }

      @for (t of ticksX(); track t.rang) {
        <text [attr.x]="t.x" [attr.y]="y0 + 16" class="graduation" text-anchor="middle">M+{{ t.rang }}</text>
      }

      @for (seg of segments(); track seg.cle) {
        <line [attr.x1]="seg.x1" [attr.y1]="seg.y1" [attr.x2]="seg.x2" [attr.y2]="seg.y2" class="trace" />
      }

      @for (p of pointsTraces(); track p.rang) {
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4" [style.fill]="p.couleur" />
        <text [attr.x]="p.x" [attr.y]="p.y - 9" class="valeur" text-anchor="middle">{{ p.score }}</text>
      }
    </svg>

    <ul class="legende">
      @for (l of legende(); track l.classe) {
        <li><span class="pastille" [style.background]="l.couleur"></span>{{ l.libelle }}</li>
      }
    </ul>
  `,
  styles: `
    .courbe { width: 100%; max-width: 42rem; height: auto; display: block; }
    .axe { stroke: var(--texte); stroke-width: 1; }
    .seuil { stroke: var(--texte-tres-doux); stroke-width: 1; stroke-dasharray: 3 3; }
    .trace { stroke: var(--accent); stroke-width: 2; }
    .graduation { fill: var(--texte-doux); font-size: 10px; }
    .valeur { fill: var(--texte); font-size: 10px; font-weight: 600; }
    .legende { list-style: none; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin: 0.4rem 0 0; padding: 0; font-size: 0.8rem; color: var(--texte-doux); }
    .pastille { display: inline-block; width: 0.7rem; height: 0.7rem; margin-right: 0.35rem; vertical-align: middle; }
  `,
})
export class CourbeProgressionComponent {
  readonly points = input.required<PointProgression[]>();

  protected readonly x0 = X0;
  protected readonly x1 = X1;
  protected readonly y0 = Y0;
  protected readonly y1 = Y1;

  private readonly mesures = computed<PointMesure[]>(() =>
    this.points()
      .filter(estMesure)
      .map((p) => ({ rang: p.rang, score: p.scoreComposite, classification: p.classification })),
  );

  protected seuilsRepere() {
    return seuils.map((valeur) => ({ valeur, y: y(valeur) }));
  }

  protected ticksX() {
    return [1, 2, 3, 4].map((rang) => ({ rang, x: x(rang) }));
  }

  protected readonly pointsTraces = computed(() =>
    this.mesures().map((p) => ({
      rang: p.rang,
      score: p.score,
      x: x(p.rang),
      y: y(p.score),
      couleur: p.classification ? COULEUR_CLASSE[p.classification] : COULEUR_SANS,
    })),
  );

  /** Ne relie que des mois consécutifs : un mois manquant laisse un trou. */
  protected readonly segments = computed(() => {
    const pts = this.pointsTraces();
    const out: { cle: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (b.rang - a.rang === 1) {
        out.push({ cle: `${a.rang}-${b.rang}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
    return out;
  });

  protected legende(): { classe: string; libelle: string; couleur: string }[] {
    const classes = new Set(this.mesures().map((p) => p.classification));
    const items: { classe: string; libelle: string; couleur: string }[] = CLASSIFICATIONS
      .filter((c) => classes.has(c))
      .map((classe) => ({ classe, libelle: LIBELLE_CLASSE[classe], couleur: COULEUR_CLASSE[classe] }));
    if (classes.has(null)) {
      items.push({ classe: 'SANS', libelle: 'Score non calculable', couleur: COULEUR_SANS });
    }
    return items;
  }

  protected resume(): string {
    const pts = this.mesures();
    if (pts.length === 0) return 'Aucun score composite à tracer.';
    return pts.map((p) => `M+${p.rang} : ${p.score}`).join(', ');
  }
}
