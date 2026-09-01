import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { StatutSousComposante } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';

@Component({
  selector: 'dqa-badge-statut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge {{ statut() }}">{{ libelle() }}</span>`,
  styles: `
    .badge { display: inline-block; padding: 0.15rem 0.5rem; font-size: 0.8rem; font-weight: 600; border-radius: 4px; }
    .CONFORME { background: #e3f1e4; color: #1b5e20; }
    .ALERTE { background: #fde3e1; color: #8a1c13; }
    .NON_CALCULABLE { background: #ececec; color: #4a4a4a; }
  `,
})
export class BadgeStatut {
  readonly statut = input.required<StatutSousComposante | null>();

  protected libelle(): string {
    return (
      {
        CONFORME: 'Conforme',
        ALERTE: 'Alerte',
        NON_CALCULABLE: 'Non calculable',
      }[this.statut() ?? 'NON_CALCULABLE'] ?? VALEUR_ABSENTE
    );
  }
}
