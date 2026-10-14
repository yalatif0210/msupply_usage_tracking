import { ChangeDetectionStrategy, Component } from '@angular/core';
import { type AxeGrapheRadar, GrapheRadar } from '../ui/graphe-radar';
import { GrapheCourbe, type SerieGrapheCourbe } from '../ui/graphe-courbe';
import { GrapheSparkline, type PointGrapheSparkline } from '../ui/graphe-sparkline';

/**
 * Harnais de revue des composants de graphe ApexCharts (ticket 04). Route sans
 * garde `/_graphes`, donnees statiques, aucune API. Sert a verifier en
 * projection que legendes et graduations restent completes a 2, 6 et 10
 * series, trous et reperes de seuil compris. A retirer au ticket 12 si la
 * revue ne le conserve pas.
 */

const MOIS = ['jan', 'fev', 'mar', 'avr', 'mai', 'jun', 'jul', 'aou', 'sep', 'oct', 'nov', 'dec'];

const AXES_6: AxeGrapheRadar[] = [
  { etiquette: 'Completude des transactions', valeur: 100, statut: 'CONFORME' },
  { etiquette: 'Promptitude des transactions', valeur: 72, statut: 'ALERTE' },
  { etiquette: 'Regularite de saisie', valeur: 88, statut: 'CONFORME' },
  { etiquette: 'Taux de conformite', valeur: 54, statut: 'ALERTE' },
  { etiquette: 'Concordance physique / theorique', valeur: null, statut: 'NON_CALCULABLE' },
  { etiquette: "Ratio d'ajustements", valeur: 95, statut: 'CONFORME' },
];

const AXES_10: AxeGrapheRadar[] = [
  { etiquette: 'Completude requisition', valeur: 100, statut: 'CONFORME' },
  { etiquette: 'Completude reception', valeur: 90, statut: 'CONFORME' },
  { etiquette: 'Completude inventaire', valeur: 66, statut: 'ALERTE' },
  { etiquette: 'Promptitude requisition', valeur: 78, statut: 'ALERTE' },
  { etiquette: 'Promptitude inventaire', valeur: 82, statut: 'CONFORME' },
  { etiquette: 'Regularite de saisie', valeur: 88, statut: 'CONFORME' },
  { etiquette: 'Conformité SDU', valeur: 47, statut: 'ALERTE' },
  { etiquette: 'Ecart consommation', valeur: null, statut: 'NON_CALCULABLE' },
  { etiquette: 'Concordance physique', valeur: 100, statut: 'CONFORME' },
  { etiquette: "Ratio d'ajustements", valeur: 93, statut: 'CONFORME' },
];

function serie(nom: string, base: number, trous: number[] = []): SerieGrapheCourbe {
  return {
    nom,
    points: MOIS.map((_, i) => {
      if (trous.includes(i)) return null;
      return Math.round(Math.min(100, Math.max(0, base + 12 * Math.sin(i / 1.7 + base))));
    }),
  };
}

const SERIES_2: SerieGrapheCourbe[] = [serie('Score composite', 74), serie('Cible', 90)];

const SERIES_6: SerieGrapheCourbe[] = [
  serie('P1 completude', 82),
  serie('P2 promptitude', 61),
  serie('P3 regularite', 70),
  serie('P4 conformite', 55),
  serie('P5 concordance', 88),
  serie("P6 ratio d'ajustements", 78),
];

const SERIES_10: SerieGrapheCourbe[] = [
  serie('Completude requisition', 88),
  serie('Completude reception', 80),
  serie('Completude inventaire', 63),
  serie('Promptitude requisition', 72),
  serie('Promptitude inventaire', 77),
  serie('Regularite de saisie', 69),
  serie('Conformité SDU', 51),
  serie('Ecart consommation', 58),
  serie('Concordance physique / theorique', 84),
  serie("Ratio d'ajustements", 90),
];

const SERIES_TROUS: SerieGrapheCourbe[] = [
  serie('Site A', 70, [2, 3, 7]),
  serie('Site B', 58, [5]),
  serie('Moyenne district', 66, [10, 11]),
];

const SPARK: PointGrapheSparkline[] = MOIS.map((m, i) => ({
  etiquette: m,
  valeur: i === 4 || i === 5 ? null : Math.round(60 + 20 * Math.sin(i / 2)),
}));

@Component({
  selector: 'dqa-demo-graphes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GrapheRadar, GrapheCourbe, GrapheSparkline],
  template: `
    <main>
      <h1>Composants de graphe ApexCharts</h1>
      <p class="intro">
        Harnais de revue (ticket 04). Verifier en projection : legende complete et
        jamais tronquee, graduations d'axe ni rognees ni chevauchees, trous
        preserves, reperes de seuil lisibles.
      </p>

      <section>
        <h2>Radar · 6 axes</h2>
        <div class="cadre">
          <dqa-graphe-radar [axes]="axes6" />
        </div>
      </section>

      <section>
        <h2>Radar · 10 axes</h2>
        <div class="cadre">
          <dqa-graphe-radar [axes]="axes10" />
        </div>
      </section>

      <section>
        <h2>Courbe · 2 series</h2>
        <div class="cadre">
          <dqa-graphe-courbe [etiquettes]="mois" [series]="series2" [seuils]="seuils" />
        </div>
      </section>

      <section>
        <h2>Courbe · 6 series (legende au-dessus)</h2>
        <div class="cadre">
          <dqa-graphe-courbe [etiquettes]="mois" [series]="series6" [seuils]="seuils" />
        </div>
      </section>

      <section>
        <h2>Courbe · 10 series (legende sous le graphe, enroulee)</h2>
        <div class="cadre">
          <dqa-graphe-courbe [etiquettes]="mois" [series]="series10" [seuils]="seuils" />
        </div>
      </section>

      <section>
        <h2>Courbe · trous + reperes de seuil</h2>
        <div class="cadre">
          <dqa-graphe-courbe [etiquettes]="mois" [series]="seriesTrous" [seuils]="seuils" />
        </div>
      </section>

      <section>
        <h2>Sparkline (avec trou et seuil)</h2>
        <div class="cadre etroit">
          <dqa-graphe-sparkline [points]="spark" [seuils]="[65]" />
        </div>
      </section>
    </main>
  `,
  styles: `
    main {
      max-width: 72rem;
      margin: 0 auto;
      padding: 1.5rem;
      color: var(--foreground);
      background: var(--background);
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
    }
    h2 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    .intro {
      color: var(--muted-foreground);
      max-width: 44rem;
    }
    section {
      margin-top: 2rem;
    }
    .cadre {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem;
      background: var(--card);
    }
    .cadre.etroit {
      max-width: 18rem;
    }
  `,
})
export class DemoGraphesPage {
  protected readonly mois = MOIS;
  protected readonly seuils = [65, 75, 90];
  protected readonly axes6 = AXES_6;
  protected readonly axes10 = AXES_10;
  protected readonly series2 = SERIES_2;
  protected readonly series6 = SERIES_6;
  protected readonly series10 = SERIES_10;
  protected readonly seriesTrous = SERIES_TROUS;
  protected readonly spark = SPARK;
}
