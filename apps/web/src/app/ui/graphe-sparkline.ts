import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  type ApexAnnotations,
  type ApexChart,
  type ApexStroke,
  type ApexYAxis,
  ChartComponent,
} from 'ng-apexcharts';
import { JetonsGraphe } from './graphe-jetons';

/**
 * Un point de la sparkline : une etiquette (info-bulle) et une valeur (ou
 * `null` = trou). Meme forme que `ui/mini-courbe` (composant SVG remplace).
 */
export interface PointGrapheSparkline {
  etiquette: string;
  valeur: number | null;
}

const POLICE = 'var(--font-sans)';
const VALEUR_ABSENTE = 'n/d';

/**
 * Courbe compacte d'une serie datee (remplace `ui/mini-courbe`). Aucun axe,
 * aucune legende : `sparkline.enabled`. Un `null` reste un trou. Reperes de
 * seuil facultatifs en annotations pointillees. Pensee pour une carte ou une
 * cellule de tableau.
 */
@Component({
  selector: 'dqa-graphe-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent],
  template: `
    <div class="graphe" role="img" [attr.aria-label]="resumeAria()">
      <apx-chart
        aria-hidden="true"
        [chart]="chartOptions()"
        [series]="serieApex()"
        [colors]="couleur()"
        [stroke]="stroke"
        [yaxis]="yaxis()"
        [annotations]="annotations()"
        [labels]="etiquettesPoints()"
        [tooltip]="{ enabled: true }"
      />
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .graphe {
      width: 100%;
    }
  `,
})
export class GrapheSparkline {
  private readonly jetons = inject(JetonsGraphe);

  readonly points = input.required<PointGrapheSparkline[]>();
  readonly seuils = input<number[]>([]);
  readonly min = input(0);
  readonly max = input(100);
  readonly hauteur = input(56);
  /** Jeton de couleur du trace (par defaut la premiere couleur de serie). */
  readonly jetonCouleur = input('--chart-1');
  readonly resume = input<string | null>(null);

  protected readonly stroke: ApexStroke = { width: 2, curve: 'straight' };

  protected readonly chartOptions = computed<ApexChart>(() => ({
    type: 'line',
    height: this.hauteur(),
    fontFamily: POLICE,
    sparkline: { enabled: true },
    animations: { enabled: false },
  }));

  protected readonly serieApex = computed(() => [
    { name: 'Valeur', data: this.points().map((p) => p.valeur) },
  ]);

  protected readonly etiquettesPoints = computed(() => this.points().map((p) => p.etiquette));

  protected readonly couleur = computed(() => [this.jetons.jeton(this.jetonCouleur())]);

  protected readonly yaxis = computed<ApexYAxis>(() => ({ min: this.min(), max: this.max() }));

  protected readonly annotations = computed<ApexAnnotations>(() => {
    const trait = this.jetons.jeton('--muted-foreground');
    return {
      yaxis: this.seuils().map((valeur) => ({
        y: valeur,
        borderColor: trait,
        strokeDashArray: 3,
      })),
    };
  });

  protected readonly resumeAria = computed(() => {
    const fourni = this.resume();
    if (fourni) return fourni;
    const mesures = this.points().filter((p) => p.valeur !== null);
    if (mesures.length === 0) return 'Sparkline sans valeur a tracer.';
    const premier = mesures[0]!;
    const dernier = mesures[mesures.length - 1]!;
    const trous = this.points().length - mesures.length;
    const mention = trous > 0 ? ` ${trous} point(s) sans donnee (${VALEUR_ABSENTE}).` : '';
    return `Sparkline sur ${this.points().length} points, de ${premier.valeur} (${premier.etiquette}) a ${dernier.valeur} (${dernier.etiquette}).${mention}`;
  });
}
