import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  type ApexAnnotations,
  type ApexChart,
  type ApexGrid,
  type ApexLegend,
  type ApexMarkers,
  type ApexStroke,
  type ApexTooltip,
  type ApexXAxis,
  type ApexYAxis,
  ChartComponent,
} from 'ng-apexcharts';

/** Suffixe de la serie tracee en pointille (mois en cours, score provisoire). */
const SUFFIXE_PROVISOIRE = ' (provisoire)';
import { CHART_BASE, nombreGraphe, POLICE_GRAPHE, seuilsYAxis } from './graphe-commun';
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

const POLICE = POLICE_GRAPHE;
/**
 * A partir de ce nombre de series, la legende passe sous le graphe et s'enroule
 * (DESIGN_SYSTEM.md 8). 6 series ("par pilier") est donc deja en dessous.
 */
const SERIES_LEGENDE_SOUS_GRAPHE = 5;

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
        [stroke]="stroke()"
        [markers]="markers"
        [legend]="legende()"
        [annotations]="annotations()"
        [grid]="grid()"
        [dataLabels]="{ enabled: false }"
        [tooltip]="infobulle"
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
  /**
   * Index du premier point provisoire (mois encore ouvert). A partir du
   * segment qui y mene, la courbe passe en pointille. N'a d'effet que sur une
   * courbe a serie unique (le score composite) ; ignore sinon.
   */
  readonly pointilleDepuis = input<number | null>(null);

  /** La courbe est-elle scindee en un troncon plein + un troncon pointille ? */
  protected readonly estScinde = computed(() => {
    const i = this.pointilleDepuis();
    return i !== null && this.series().length === 1 && i >= 1 && i < this.etiquettes().length;
  });

  protected readonly stroke = computed<ApexStroke>(() => ({
    width: 2,
    curve: 'straight',
    // [plein, pointille] : le second troncon (serie « provisoire ») est tirete.
    dashArray: this.estScinde() ? [0, 5] : 0,
  }));
  protected readonly markers: ApexMarkers = { size: 3, strokeWidth: 0, hover: { sizeOffset: 2 } };

  protected readonly chartOptions = computed<ApexChart>(() => ({
    type: 'line',
    height: this.hauteur(),
    zoom: { enabled: false },
    ...CHART_BASE,
  }));

  protected readonly serieApex = computed(() => {
    if (this.estScinde()) {
      const s = this.series()[0]!;
      const i = this.pointilleDepuis()!;
      // Le point de jonction (i-1) appartient aux deux troncons : le pointille
      // demarre donc au segment qui mene au premier mois provisoire.
      const plein = s.points.map((v, k) => (k <= i - 1 ? v : null));
      const provisoire = s.points.map((v, k) => (k >= i - 1 ? v : null));
      return [
        { name: s.nom, data: plein },
        { name: `${s.nom}${SUFFIXE_PROVISOIRE}`, data: provisoire },
      ];
    }
    return this.series().map((s) => ({ name: s.nom, data: s.points }));
  });

  protected readonly palette = computed(() => {
    if (this.estScinde()) {
      const c = this.jetons.palette(1)[0]!;
      return [c, c];
    }
    return this.jetons.palette(this.series().length);
  });

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

  protected readonly infobulle: ApexTooltip = {
    shared: true,
    intersect: false,
    y: { formatter: (v: number) => nombreGraphe(v) },
  };

  protected readonly yaxis = computed<ApexYAxis>(() => ({
    min: this.min(),
    max: this.max(),
    tickAmount: 5,
    forceNiceScale: false,
    labels: {
      formatter: (v: number) => nombreGraphe(v),
      style: { fontSize: '12px', fontFamily: POLICE, colors: this.jetons.jeton('--muted-foreground') },
    },
  }));

  protected readonly grid = computed<ApexGrid>(() => ({
    borderColor: this.jetons.jeton('--border'),
    strokeDashArray: 0,
  }));

  protected readonly legende = computed<ApexLegend>(() => ({
    // une seule serie : pas de legende (le titre/aria porte deja le nom).
    show: this.series().length > 1,
    position: this.series().length > SERIES_LEGENDE_SOUS_GRAPHE ? 'bottom' : 'top',
    horizontalAlign: 'left',
    showForSingleSeries: false,
    fontSize: '13px',
    fontFamily: POLICE,
    labels: { colors: this.jetons.jeton('--foreground') },
    itemMargin: { horizontal: 10, vertical: 4 },
    markers: { size: 6 },
  }));

  protected readonly annotations = computed<ApexAnnotations>(() => ({
    yaxis: seuilsYAxis(this.seuils(), this.jetons.jeton('--muted-foreground'), {
      avecEtiquette: true,
      fond: this.jetons.jeton('--background'),
    }),
  }));

  protected readonly resumeAria = computed(() => {
    const fourni = this.resume();
    if (fourni) return fourni;
    const noms = this.series().map((s) => s.nom).join(', ');
    const seuils = this.seuils().length ? ` Reperes de seuil : ${this.seuils().join(', ')}.` : '';
    const provisoire = this.estScinde()
      ? ` Le dernier segment est trace en pointille : mois en cours, score provisoire.`
      : '';
    return `Courbe, ${this.series().length} series sur ${this.etiquettes().length} points (${noms}).${seuils}${provisoire}`;
  });
}
