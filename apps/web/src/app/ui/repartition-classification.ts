import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RepartitionClassification } from '@dqa/contracts';

/**
 * Barre à quatre segments (CONFORME vert / PARTIELLEMENT CONFORME ambre /
 * NON CONFORME rouge / SANS MESURE gris), cf. DESIGN_SYSTEM.md §1. La couleur
 * n'est jamais seule : le mode plein porte une légende sous la barre, le mode
 * `compact` (cellule de tableau) porte les comptes non nuls en texte à droite.
 */
@Component({
  selector: 'dqa-repartition-classification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bloc" [class.compact]="compact()">
      <div class="barre" role="img" [attr.aria-label]="resume()">
        @for (s of segments(); track s.classe) {
          @if (s.n > 0) {
            <span class="seg {{ s.classe }}" [style.flexGrow]="s.n"></span>
          }
        }
      </div>

      @if (compact()) {
        <p class="comptes">
          @for (s of segments(); track s.classe) {
            @if (s.n > 0) {
              <span class="compte {{ s.classe }}">{{ s.n }}&nbsp;{{ s.libelleCourt }}</span>
            }
          }
        </p>
      } @else {
        <ul class="legende">
          @for (s of segments(); track s.classe) {
            <li><span class="pastille {{ s.classe }}"></span>{{ s.libelle }} <b>{{ s.n }}</b></li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .bloc.compact { display: flex; align-items: center; gap: 0.6rem; }
    .barre { display: flex; height: 1.4rem; border: 1px solid #d9d9d6; background: #ececec; overflow: hidden; }
    .compact .barre { height: 0.7rem; flex: 0 0 6rem; }
    .seg { display: block; }
    .seg.CONFORME { background: #1b5e20; }
    .seg.PARTIELLEMENT_CONFORME { background: #7a5200; }
    .seg.NON_CONFORME { background: #8a1c13; }
    .seg.SANS_MESURE { background: #b9b9b6; }
    .comptes { margin: 0; display: flex; flex-wrap: wrap; gap: 0.15rem 0.7rem; font-size: 0.8rem; }
    .compte { font-variant-numeric: tabular-nums; }
    .compte.CONFORME { color: #1b5e20; }
    .compte.PARTIELLEMENT_CONFORME { color: #7a5200; }
    .compte.NON_CONFORME { color: #8a1c13; }
    .compte.SANS_MESURE { color: #5b5b5b; }
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
      { classe: 'CONFORME', libelle: 'Conforme', libelleCourt: 'conformes', n: r.CONFORME },
      { classe: 'PARTIELLEMENT_CONFORME', libelle: 'Partiellement conforme', libelleCourt: 'partiels', n: r.PARTIELLEMENT_CONFORME },
      { classe: 'NON_CONFORME', libelle: 'Non conforme', libelleCourt: 'non conformes', n: r.NON_CONFORME },
      { classe: 'SANS_MESURE', libelle: 'Sans mesure', libelleCourt: 'sans mesure', n: r.SANS_MESURE },
    ] as const;
  });

  protected resume(): string {
    return this.segments()
      .filter((s) => s.n > 0)
      .map((s) => `${s.n} ${s.libelle}`)
      .join(', ');
  }
}
