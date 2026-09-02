import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { StatutSousComposante } from '@dqa/contracts';
import {
  type ApexChart,
  type ApexFill,
  type ApexLegend,
  type ApexMarkers,
  type ApexPlotOptions,
  type ApexStroke,
  type ApexXAxis,
  type ApexYAxis,
  ChartComponent,
} from 'ng-apexcharts';
import { JetonsGraphe } from './graphe-jetons';

/**
 * Un axe du radar : etiquette affichee en toutes lettres, valeur 0..100 (ou
 * `null` = non calculable, tracee au centre), statut pour la couleur de
 * l'etiquette.
 *
 * Meme forme que `ui/radar` (composant SVG remplace) : les ecrans qui le
 * consomment peuvent basculer sans retoucher leurs `computed`.
 */
export interface AxeGrapheRadar {
  etiquette: string;
  valeur: number | null;
  statut: StatutSousComposante;
}

const POLICE = 'var(--font-sans)';
const VALEUR_ABSENTE = 'n/d';

/**
 * Radar ApexCharts (remplace `ui/radar`). Une seule serie, remplissage
 * `--primary` en faible opacite. Chaque axe est etiquete sans troncature. La
 * couleur d'etiquette par statut est optionnelle (`colorierParStatut`) et
 * toujours doublee : le resume accessible et la legende de statut sous le
 * graphe nomment les axes en alerte.
 */
@Component({
  selector: 'dqa-graphe-radar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent],
  template: `
    <div class="graphe" role="img" [attr.aria-label]="resumeAria()">
      <apx-chart
        aria-hidden="true"
        [chart]="chartOptions()"
        [series]="serie()"
        [xaxis]="xaxis()"
        [yaxis]="yaxis"
        [colors]="couleurTrace()"
        [fill]="fill"
        [stroke]="stroke"
        [markers]="markers()"
        [plotOptions]="plotOptions()"
        [legend]="legende"
        [dataLabels]="{ enabled: false }"
      />
      @if (colorierParStatut() && axesParStatut().length > 0) {
        <ul class="legende-statut">
          @for (groupe of axesParStatut(); track groupe.statut) {
            <li>
              <span class="pastille" [class]="groupe.classe"></span>
              <span>{{ groupe.libelle }} : {{ groupe.axes.join(', ') }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .graphe {
      width: 100%;
    }
    .legende-statut {
      list-style: none;
      margin: 0.5rem 0 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1.25rem;
      font-size: 0.8125rem;
      color: var(--muted-foreground);
    }
    .legende-statut li {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .pastille {
      display: inline-block;
      width: 0.7rem;
      height: 0.7rem;
      border-radius: 2px;
      flex: none;
    }
    .pastille.conforme {
      background: var(--conforme-texte);
    }
    .pastille.alerte {
      background: var(--alerte-texte);
    }
    .pastille.non-calculable {
      background: var(--nc-texte);
    }
  `,
})
export class GrapheRadar {
  private readonly jetons = inject(JetonsGraphe);

  readonly axes = input.required<AxeGrapheRadar[]>();
  /** Titre lu par les lecteurs d'ecran si aucun resume specifique n'est fourni. */
  readonly titre = input('Radar des sous-composantes');
  /** Colorer chaque etiquette d'axe selon son statut (double par la legende). */
  readonly colorierParStatut = input(true);
  readonly hauteur = input(380);
  /** Rayon du polygone en pixels ; laisse ApexCharts calibrer si absent. */
  readonly rayon = input(140);

  protected readonly yaxis: ApexYAxis = { show: false, min: 0, max: 100 };
  protected readonly fill: ApexFill = { opacity: 0.15 };
  protected readonly stroke: ApexStroke = { width: 2 };
  protected readonly legende: ApexLegend = { show: false };

  protected readonly chartOptions = computed<ApexChart>(() => ({
    type: 'radar',
    height: this.hauteur(),
    fontFamily: POLICE,
    toolbar: { show: false },
    animations: { enabled: false },
  }));

  protected readonly serie = computed(() => [
    { name: "Taux d'atteinte", data: this.axes().map((a) => a.valeur ?? 0) },
  ]);

  protected readonly couleurTrace = computed(() => [this.jetons.jeton('--primary')]);

  protected readonly markers = computed<ApexMarkers>(() => ({
    size: 3,
    colors: this.couleurTrace(),
    strokeWidth: 0,
  }));

  protected readonly xaxis = computed<ApexXAxis>(() => ({
    categories: this.axes().map((a) => a.etiquette),
    labels: {
      show: true,
      trim: false,
      style: {
        colors: this.couleursEtiquettes(),
        fontSize: '13px',
        fontFamily: POLICE,
      },
    },
  }));

  protected readonly plotOptions = computed<ApexPlotOptions>(() => {
    const bordure = this.jetons.jeton('--border');
    return {
      radar: {
        size: this.rayon(),
        polygons: {
          strokeColors: bordure,
          connectorColors: bordure,
        },
      },
    };
  });

  private readonly couleursEtiquettes = computed<string[]>(() => {
    const neutre = this.jetons.jeton('--foreground');
    if (!this.colorierParStatut()) return this.axes().map(() => neutre);
    return this.axes().map((a) => this.jetons.jeton(JETON_STATUT[a.statut]));
  });

  protected readonly axesParStatut = computed(() =>
    (['ALERTE', 'CONFORME', 'NON_CALCULABLE'] as const)
      .map((statut) => ({
        statut,
        libelle: LIBELLE_STATUT[statut],
        classe: CLASSE_STATUT[statut],
        axes: this.axes()
          .filter((a) => a.statut === statut)
          .map((a) => a.etiquette),
      }))
      .filter((groupe) => groupe.axes.length > 0),
  );

  protected readonly resumeAria = computed(() => {
    const detail = this.axes()
      .map((a) => {
        const valeur = a.valeur === null ? VALEUR_ABSENTE : `${Math.round(a.valeur)} sur 100`;
        return `${a.etiquette} ${valeur} (${LIBELLE_STATUT[a.statut].toLowerCase()})`;
      })
      .join('. ');
    return `${this.titre()}, ${this.axes().length} axes. ${detail}.`;
  });
}

const JETON_STATUT: Record<StatutSousComposante, string> = {
  CONFORME: '--conforme-texte',
  ALERTE: '--alerte-texte',
  NON_CALCULABLE: '--nc-texte',
};

const LIBELLE_STATUT: Record<StatutSousComposante, string> = {
  CONFORME: 'Conforme',
  ALERTE: 'Alerte',
  NON_CALCULABLE: 'Non calculable',
};

const CLASSE_STATUT: Record<StatutSousComposante, string> = {
  CONFORME: 'conforme',
  ALERTE: 'alerte',
  NON_CALCULABLE: 'non-calculable',
};
