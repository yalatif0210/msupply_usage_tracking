import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RepartitionClassification } from '@dqa/contracts';

interface SegmentRepartition {
  readonly classe: 'CONFORME' | 'PARTIELLEMENT_CONFORME' | 'NON_CONFORME' | 'SANS_MESURE';
  readonly libelle: string;
  readonly libelleCourt: string;
  readonly n: number;
  readonly fond: string;
  readonly texte: string;
}

/**
 * Barre à quatre segments (CONFORME vert / PARTIELLEMENT CONFORME ambre / NON
 * CONFORME rouge / SANS MESURE gris), DESIGN_SYSTEM §2. La couleur n'est jamais
 * seule : le mode plein porte une légende sous la barre, le mode `compact`
 * (cellule de tableau) porte les comptes non nuls en texte à droite. `<div>`
 * flex segmenté, pas un graphe.
 */
@Component({
  selector: 'dqa-repartition-classification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="compact() ? 'flex items-center gap-2.5' : ''">
      <div
        class="flex overflow-hidden rounded-sm border border-border bg-muted"
        [class]="compact() ? 'h-2.5 w-24 shrink-0' : 'h-6'"
        role="img"
        [attr.aria-label]="resume()"
      >
        @for (s of segments(); track s.classe) {
          @if (s.n > 0) {
            <span class="block" [class]="s.fond" [style.flexGrow]="s.n"></span>
          }
        }
      </div>

      @if (compact()) {
        <p class="m-0 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
          @for (s of segments(); track s.classe) {
            @if (s.n > 0) {
              <span [class]="s.texte">{{ s.n }}&nbsp;{{ s.libelleCourt }}</span>
            }
          }
        </p>
      } @else {
        <ul class="mt-1.5 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm">
          @for (s of segments(); track s.classe) {
            <li class="flex items-center gap-1.5">
              <span class="inline-block size-2.5" [class]="s.fond"></span>
              {{ s.libelle }} <b class="tabular-nums">{{ s.n }}</b>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class RepartitionClassificationComponent {
  readonly repartition = input.required<RepartitionClassification>();
  readonly compact = input(false);

  protected readonly segments = computed<readonly SegmentRepartition[]>(() => {
    const r = this.repartition();
    return [
      { classe: 'CONFORME', libelle: 'Conforme', libelleCourt: 'conformes', n: r.CONFORME, fond: 'bg-conforme-texte', texte: 'text-conforme-texte' },
      { classe: 'PARTIELLEMENT_CONFORME', libelle: 'Partiellement conforme', libelleCourt: 'partiels', n: r.PARTIELLEMENT_CONFORME, fond: 'bg-partiel-texte', texte: 'text-partiel-texte' },
      { classe: 'NON_CONFORME', libelle: 'Non conforme', libelleCourt: 'non conformes', n: r.NON_CONFORME, fond: 'bg-alerte-texte', texte: 'text-alerte-texte' },
      { classe: 'SANS_MESURE', libelle: 'Sans mesure', libelleCourt: 'sans mesure', n: r.SANS_MESURE, fond: 'bg-muted-foreground', texte: 'text-muted-foreground' },
    ];
  });

  protected resume(): string {
    return this.segments()
      .filter((s) => s.n > 0)
      .map((s) => `${s.n} ${s.libelle}`)
      .join(', ');
  }
}
