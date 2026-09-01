import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Classification } from '@dqa/contracts';

/**
 * Range un site d'après son score composite (DESIGN_SYSTEM.md §1) : vert
 * CONFORME, ambre PARTIELLEMENT CONFORME, rouge NON CONFORME. `null` =
 * score composite non calculable → aucun rangement affiché.
 */
@Component({
  selector: 'dqa-badge-classification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge {{ classification() ?? 'AUCUNE' }}">{{ libelle() }}</span>`,
  styles: `
    .badge { display: inline-block; padding: 0.15rem 0.6rem; font-size: 0.85rem; font-weight: 700; border-radius: 4px; }
    .CONFORME { background: var(--conforme-fond); color: var(--conforme-texte); }
    .PARTIELLEMENT_CONFORME { background: var(--partiel-fond); color: var(--partiel-texte); }
    .NON_CONFORME { background: var(--alerte-fond); color: var(--alerte-texte); }
    .AUCUNE { background: var(--nc-fond); color: var(--nc-texte); }
  `,
})
export class BadgeClassification {
  readonly classification = input.required<Classification | null>();

  protected libelle(): string {
    return {
      CONFORME: 'Conforme',
      PARTIELLEMENT_CONFORME: 'Partiellement conforme',
      NON_CONFORME: 'Non conforme',
      AUCUNE: 'Score non calculable',
    }[this.classification() ?? 'AUCUNE'];
  }
}
