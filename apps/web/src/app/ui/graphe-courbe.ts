import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  type ApexAnnotations,
  type ApexChart,
  type ApexGrid,
  type ApexLegend,
  type ApexMarkers,
  type ApexStroke,
  type ApexXAxis,
  type ApexYAxis,
  ChartComponent,
} from 'ng-apexcharts';
import { JetonsGraphe } from './graphe-jetons';

/**
 * Une serie de la courbe : un nom (legende) et une valeur par etiquette d'axe.
 * Une valeur `null` laisse un trou : ApexCharts ne relie pas deux points
 * separes par un `null` (comportement par defaut, `connectNulls` non force).
 *
 * Meme forme que `ui/courbe-series` (composant SVG remplace).
 */
export interface SerieGrapheCourbe {
  nom: string;
  points: (number | null)[];
}

const POLICE = 'var(--font-sans)';
/** Au-dela de ce nombre de series, la legende passe sous le graphe (DESIGN_SYSTEM.md 8). */
const SERIES_LEGENDE_SOUS_GRAPHE = 6;

/**
 * Courbe multi-series ApexCharts (remplace `ui/courbe-series`).
 *
 * - palette `--chart-*` cyclee, jamais les couleurs de statut ;
 * - reperes de seuil en annotations pointillees `--muted-foreground` ;
 * - un `null` reste un trou ;
 * - legende toujours complete ; au-dela de six series elle passe sous le
 *   graphe et s'enroule, sinon elle reste au-dessus ; jamais tronquee ;
 * - graduations d'axe X en rotation, eclaircies plutot que rognees.
 */
@Component({
  selector: 'dqa-graphe-courbe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent],
  template: `
    <div class="graphe" role="img" [attr.aria-label]="resumeAria()">
      <apx-chart
        aria-hidden="true"
        [chart]="chartOptions()"
        [series]="serieApex()"
        [xaxis]="xaxis()"
        [yaxis]="yaxis()"
        [colors]="palette()"
        [stroke]="stroke"
        [markers]="markers"
        [legend]="legende()"
        [annotations]="annotations()"
        [grid]="grid()"
        [dataLabels]="{ enabled: false }"
        [tooltip]="{ shared: true, intersect: false }"
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
export class GrapheCourbe {
  private readonly jetons = inject(JetonsGraphe);

  readonly etiquettes = input.required<string[]>();
  readonly series = input.required<SerieGrapheCourbe[]>();
  readonly seuils = input<number[]>([]);
  readonly min = input(0);
  readonly max = input(100);
  readonly hauteur = input(340);
  /** Resume accessible ; sinon un resume est deduit des series. */
  readonly resume = input<string | null>(null);

  protected readonly stroke: ApexStroke = { width: 2, curve: 'straight' };
  protected readonly markers: ApexMarkers = { size: 3, strokeWidth: 0, hover: { sizeOffset: 2 } };

  protected readonly chartOptions = computed<ApexChart>(() => ({
    type: 'line',
    height: this.hauteur(),
    fontFamily: POLICE,
    toolbar: { show: false },
    zoom: { enabled: false },
    animations: { enabled: false },
  }));

  protected readonly serieApex = computed(() =>
    this.series().map((s) => ({ name: s.nom, data: s.points })),
  );

  protected readonly palette = computed(() => this.jetons.palette(this.series().length));

  protected readonly xaxis = computed<ApexXAxis>(() => ({
    categories: this.etiquettes(),
    tickPlacement: 'on',
    labels: {
      rotate: -45,
      rotateAlways: false,
      hideOverlappingLabels: true,
      trim: false,
      style: { fontSize: '12px', fontFamily: POLICE, colors: this.jetons.jeton('--muted-foreground') },
    },
    axisBorder: { show: true, color: this.jetons.jeton('--border') },
    axisTicks: { show: true, color: this.jetons.jeton('--border') },
  }));

  protected readonly yaxis = computed<ApexYAxis>(() => ({
    min: this.min(),
    max: this.max(),
    tickAmount: 5,
    forceNiceScale: false,
    labels: {
      style: { fontSize: '12px', fontFamily: POLICE, colors: this.jetons.jeton('--muted-foreground') },
    },
  }));

  protected readonly grid = computed<ApexGrid>(() => ({
    borderColor: this.jetons.jeton('--border'),
    strokeDashArray: 0,
  }));

  protected readonly legende = computed<ApexLegend>(() => ({
    show: true,
    position: this.series().length > SERIES_LEGENDE_SOUS_GRAPHE ? 'bottom' : 'top',
    horizontalAlign: 'left',
    showForSingleSeries: true,
    fontSize: '13px',
    fontFamily: POLICE,
    labels: { colors: this.jetons.jeton('--foreground') },
    itemMargin: { horizontal: 10, vertical: 4 },
    markers: { size: 6 },
  }));

  protected readonly annotations = computed<ApexAnnotations>(() => {
    const trait = this.jetons.jeton('--muted-foreground');
    return {
      yaxis: this.seuils().map((valeur) => ({
        y: valeur,
        borderColor: trait,
        strokeDashArray: 4,
        label: {
          text: `seuil ${valeur}`,
          position: 'left',
          textAnchor: 'start',
          borderWidth: 0,
          style: {
            color: trait,
            background: this.jetons.jeton('--background'),
            fontSize: '11px',
            fontFamily: POLICE,
          },
        },
      })),
    };
  });

  protected readonly resumeAria = computed(() => {
    const fourni = this.resume();
    if (fourni) return fourni;
    const noms = this.series().map((s) => s.nom).join(', ');
    const seuils = this.seuils().length ? ` Reperes de seuil : ${this.seuils().join(', ')}.` : '';
    return `Courbe, ${this.series().length} series sur ${this.etiquettes().length} points (${noms}).${seuils}`;
  });
}
