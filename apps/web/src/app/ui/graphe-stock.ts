import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  type ApexAnnotations,
  type ApexAxisChartSeries,
  type ApexChart,
  type ApexLegend,
  type ApexMarkers,
  type ApexStroke,
  type ApexTooltip,
  type ApexXAxis,
  type ApexYAxis,
  ChartComponent,
} from 'ng-apexcharts';
import { CHART_BASE, nombreGraphe, POLICE_GRAPHE } from './graphe-commun';
import { JetonsGraphe } from './graphe-jetons';

/** Un point daté (`AAAA-MM-JJ`) d'une série de stock. */
export interface PointStock {
  jour: string;
  valeur: number;
}

const jourEnMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const jourCourt = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Courbe d'un couple site × produit (suivi des stocks) : stock projeté jour par
 * jour, trait plein jusqu'à la date choisie puis pointillé au-delà (aucune
 * réception supposée), stocks comptés et photos mSupply en points, réceptions
 * et rupture prévue en repères verticaux. Légende toujours complète
 * (DESIGN_SYSTEM §8) ; palette `--chart-*`, sauf le repère de rupture, couleur
 * de statut.
 */
@Component({
  selector: 'dqa-graphe-stock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent],
  template: `
    <div class="w-full" role="img" [attr.aria-label]="resume()">
      <apx-chart
        aria-hidden="true"
        [chart]="chart()"
        [series]="series()"
        [xaxis]="xaxis()"
        [yaxis]="yaxis()"
        [colors]="couleurs()"
        [stroke]="stroke"
        [markers]="markers"
        [legend]="legende()"
        [annotations]="annotations()"
        [dataLabels]="{ enabled: false }"
        [tooltip]="infobulle"
      />
    </div>
  `,
})
export class GrapheStock {
  private readonly jetons = inject(JetonsGraphe);

  /** Date choisie (t) : la projection est en pointillé au-delà. */
  readonly date = input.required<string>();
  readonly projection = input.required<PointStock[]>();
  readonly inventaires = input.required<PointStock[]>();
  readonly photos = input.required<PointStock[]>();
  readonly receptions = input.required<PointStock[]>();
  readonly rupture = input<string | null>(null);
  readonly hauteur = input(360);

  protected readonly chart = computed<ApexChart>(() => ({
    type: 'line',
    height: this.hauteur(),
    zoom: { enabled: false },
    ...CHART_BASE,
  }));

  protected readonly series = computed<ApexAxisChartSeries>(() => {
    const t = this.date();
    const avant = this.projection().filter((p) => p.jour <= t);
    const apres = this.projection().filter((p) => p.jour >= t);
    const pts = (l: PointStock[]) => l.map((p) => ({ x: jourEnMs(p.jour), y: p.valeur }));
    return [
      { name: `Stock projeté jusqu'au ${jourCourt(jourEnMs(t))}`, type: 'line', data: pts(avant) },
      { name: 'Projection au-delà (sans réception)', type: 'line', data: pts(apres) },
      { name: 'Stock compté (inventaire)', type: 'scatter', data: pts(this.inventaires()) },
      { name: 'Photo mSupply (stock théorique)', type: 'scatter', data: pts(this.photos()) },
    ];
  });

  protected readonly couleurs = computed(() => {
    const [c1, c2, c3] = this.jetons.palette(3);
    return [c1, c1, c2, c3];
  });

  protected readonly stroke: ApexStroke = { width: [2, 2, 0, 0], dashArray: [0, 6, 0, 0], curve: 'straight' };
  protected readonly markers: ApexMarkers = { size: [0, 0, 6, 6], strokeWidth: 0, hover: { sizeOffset: 2 } };

  protected readonly xaxis = computed<ApexXAxis>(() => ({
    type: 'datetime',
    labels: {
      formatter: (_v: string, ts?: number) => (ts === undefined ? '' : jourCourt(ts)),
      style: { fontSize: '12px', fontFamily: POLICE_GRAPHE, colors: this.jetons.jeton('--muted-foreground') },
    },
    axisBorder: { show: true, color: this.jetons.jeton('--border') },
    axisTicks: { show: true, color: this.jetons.jeton('--border') },
  }));

  protected readonly yaxis = computed<ApexYAxis>(() => ({
    min: 0,
    forceNiceScale: true,
    labels: {
      formatter: (v: number) => nombreGraphe(v),
      style: { fontSize: '12px', fontFamily: POLICE_GRAPHE, colors: this.jetons.jeton('--muted-foreground') },
    },
  }));

  protected readonly legende = computed<ApexLegend>(() => ({
    show: true,
    showForSingleSeries: true,
    position: 'top',
    horizontalAlign: 'left',
    fontSize: '13px',
    fontFamily: POLICE_GRAPHE,
    labels: { colors: this.jetons.jeton('--foreground') },
    itemMargin: { horizontal: 10, vertical: 4 },
  }));

  protected readonly infobulle: ApexTooltip = {
    shared: false,
    intersect: false,
    x: { formatter: (v: number) => jourCourt(v) },
    y: { formatter: (v: number) => nombreGraphe(v) },
  };

  protected readonly annotations = computed<ApexAnnotations>(() => {
    const trait = this.jetons.jeton('--muted-foreground');
    const fond = this.jetons.jeton('--background');
    // Trois rangées d'étiquettes (date choisie, réceptions, rupture) : deux
    // repères proches ne se masquent pas l'un l'autre.
    const repere = (jour: string, texte: string, couleur: string, tirets: number, rangee: number) => ({
      x: jourEnMs(jour),
      borderColor: couleur,
      strokeDashArray: tirets,
      label: {
        text: texte,
        orientation: 'horizontal',
        borderWidth: 0,
        offsetY: rangee * 18,
        style: { color: couleur, background: fond, fontSize: '11px', fontFamily: POLICE_GRAPHE },
      },
    });
    const reperes = [
      repere(this.date(), 'date choisie', this.jetons.jeton('--foreground'), 0, 0),
      ...this.receptions().map((r) => repere(r.jour, `réception +${nombreGraphe(r.valeur)}`, trait, 3, 1)),
    ];
    const rupture = this.rupture();
    if (rupture) reperes.push(repere(rupture, 'rupture prévue', this.jetons.jeton('--alerte-texte'), 4, 2));
    return { xaxis: reperes };
  });

  protected readonly resume = computed(() => {
    const rupture = this.rupture();
    return `Stock projeté jour par jour, ${this.inventaires().length} stock(s) compté(s), ${this.photos().length} photo(s) mSupply, `
      + `${this.receptions().length} réception(s).${rupture ? ` Rupture prévue le ${jourCourt(jourEnMs(rupture))}.` : ''}`;
  });
}
