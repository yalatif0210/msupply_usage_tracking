import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RepartitionClassification } from '@dqa/contracts';

/**
 * Barre à quatre segments (CONFORME vert / PARTIELLEMENT CONFORME ambre /
 * NON CONFORME rouge / SANS MESURE gris) — DESIGN_SYSTEM.md §1. `compact`
 * réduit la hauteur et masque les libellés pour l'usage en cellule de tableau.
 */
@Component({
  selector: 'dqa-repartition-classification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="barre" [class.compact]="compact()" role="img" [attr.aria-label]="resume()">
      @for (s of segments(); track s.classe) {
        @if (s.n > 0) {
          <span class="seg {{ s.classe }}" [style.flexGrow]="s.n" [title]="s.libelle + ' : ' + s.n"></span>
        }
      }
    </div>
    @if (!compact()) {
      <ul class="legende">
        @for (s of segments(); track s.classe) {
          <li><span class="pastille {{ s.classe }}"></span>{{ s.libelle }} <b>{{ s.n }}</b></li>
        }
      </ul>
    }
  `,
  styles: `
    .barre { display: flex; height: 1.4rem; border: 1px solid #d9d9d6; background: #ececec; overflow: hidden; }
    .barre.compact { height: 0.6rem; border: none; }
    .seg { display: block; }
    .seg.CONFORME { background: #1b5e20; }
    .seg.PARTIELLEMENT_CONFORME { background: #7a5200; }
    .seg.NON_CONFORME { background: #8a1c13; }
    .seg.SANS_MESURE { background: #b9b9b6; }
    .legende { list-style: none; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin: 0.4rem 0 0; padding: 0; font-size: 0.85rem; }
    .legende b { font-variant-numeric: tabular-nums; }
    .pastille { display: inline-block; width: 0.7rem; height: 0.7rem; margin-right: 0.35rem; vertical-align: middle; }
    .pastille.CONFORME { background: #1b5e20; }
    .pastille.PARTIELLEMENT_CONFORME { background: #7a5200; }
    .pastille.NON_CONFORME { background: #8a1c13; }
    .pastille.SANS_MESURE { background: #b9b9b6; }
  `,
})
export class RepartitionClassificationComponent {
  readonly repartition = input.required<RepartitionClassification>();
  readonly compact = input(false);

  protected readonly segments = computed(() => {
    const r = this.repartition();
    return [
      { classe: 'CONFORME', libelle: 'Conforme', n: r.CONFORME },
      { classe: 'PARTIELLEMENT_CONFORME', libelle: 'Partiellement conforme', n: r.PARTIELLEMENT_CONFORME },
      { classe: 'NON_CONFORME', libelle: 'Non conforme', n: r.NON_CONFORME },
      { classe: 'SANS_MESURE', libelle: 'Sans mesure', n: r.SANS_MESURE },
    ] as const;
  });

  protected resume(): string {
    return this.segments()
      .map((s) => `${s.libelle} : ${s.n}`)
      .join(', ');
  }
}
