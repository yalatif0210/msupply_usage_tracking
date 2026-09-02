import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LIBELLES_SOUS_COMPOSANTE, type SousComposante, type TableauDeBord } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { SyntheseService } from '../core/synthese.service';
import { Coquille } from '../ui/coquille';
import { MiniCourbe, type PointMiniCourbe } from '../ui/mini-courbe';
import { RepartitionClassificationComponent } from '../ui/repartition-classification';

@Component({
  selector: 'dqa-tableau-de-bord',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, Coquille, MiniCourbe, RepartitionClassificationComponent],
  template: `
    <dqa-coquille />
    <main>
      <h1>Tableau de bord national</h1>

      @if (tdb(); as t) {
        @if (t.moisPaqd === null) {
          <p class="vide">Aucun mois n'a encore de score. Le tableau de bord s'alimentera au premier import traité.</p>
        } @else {
          <p class="mois">Mois PAQD : {{ t.moisPaqd }}</p>

          <section class="tuiles">
            <div class="tuile">
              <div class="chiffre">{{ t.national.nbSites }}</div>
              <div class="lib">sites du périmètre</div>
            </div>
            <div class="tuile">
              <div class="chiffre">
                {{ t.national.scoreCompositeMoyen === null ? absent : (t.national.scoreCompositeMoyen | number: '1.0-1') }}
              </div>
              <div class="lib">score composite moyen</div>
            </div>
            <div class="tuile">
              <div class="chiffre">{{ t.national.repartition.SANS_MESURE }}</div>
              <div class="lib">sites sans mesure</div>
            </div>
            <div class="tuile large">
              <dqa-repartition-classification [repartition]="t.national.repartition" />
            </div>
          </section>

          @if (pointsCourbe().length > 1) {
            <section class="courbe">
              <h2>Progression nationale (score composite moyen)</h2>
              <dqa-mini-courbe [points]="pointsCourbe()" [seuils]="seuils" />
            </section>
          }

          <section class="difficulte">
            <h2>Sous-composantes en difficulté</h2>
            @if (t.sousComposantesEnDifficulte.length === 0) {
              <p class="vide">Aucune sous-composante mesurée ce mois.</p>
            } @else {
              <table>
                <thead>
                  <tr><th>Sous-composante</th><th>Pilier</th><th class="num">Sites en alerte</th><th class="num">Taux d'atteinte moyen</th></tr>
                </thead>
                <tbody>
                  @for (sc of t.sousComposantesEnDifficulte; track sc.sousComposante) {
                    <tr>
                      <td>{{ libelleSc(sc.sousComposante) }}</td>
                      <td>{{ sc.pilier }}</td>
                      <td class="num">{{ sc.nbAlerte }}</td>
                      <td class="num">{{ sc.tauxAtteinteMoyen === null ? absent : (sc.tauxAtteinteMoyen | number: '1.0-1') }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </section>

          <p><a routerLink="/sites">Voir les 40 sites</a></p>
        }
      } @else if (chargement()) {
        <p>Chargement…</p>
      } @else {
        <p class="vide">Le tableau de bord est indisponible.</p>
      }
    </main>
  `,
  styles: `
    main { max-width: 72rem; margin: 0 auto; padding: 0 1rem; }
    h1 { font-size: 1.6rem; }
    h2 { font-size: 1.05rem; margin: 2rem 0 0.8rem; }
    .mois { color: var(--texte-doux); font-size: 0.9rem; }
    .tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 1rem; margin: 1.5rem 0; }
    .tuile { border: 1px solid var(--bordure); background: var(--surface); padding: 1.2rem; }
    .tuile.large { grid-column: span 2; display: flex; align-items: center; }
    .tuile .chiffre { font-size: 2.6rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
    .tuile .lib { color: var(--texte-doux); font-size: 0.85rem; margin-top: 0.3rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid var(--bordure); }
    th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
    a { color: var(--marque); }
    .vide { color: var(--texte-doux); }
  `,
})
export class TableauDeBordPage {
  protected readonly absent = VALEUR_ABSENTE;
  /** Repères de la courbe aux bornes de classification composite (cf. classer_composite). */
  protected readonly seuils = [75, 90];
  private readonly service = inject(SyntheseService);

  protected readonly tdb = signal<TableauDeBord | null>(null);
  protected readonly chargement = signal(true);

  protected readonly pointsCourbe = computed<PointMiniCourbe[]>(
    () => this.tdb()?.progression.map((p) => ({ etiquette: p.moisPaqd, valeur: p.scoreCompositeMoyen })) ?? [],
  );

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    try {
      this.tdb.set(await this.service.tableauDeBord());
    } catch {
      this.tdb.set(null);
    }
    this.chargement.set(false);
  }

  protected libelleSc(sc: SousComposante): string {
    return LIBELLES_SOUS_COMPOSANTE[sc];
  }
}
