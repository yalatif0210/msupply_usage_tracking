import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { StatutSousComposante } from '@dqa/contracts';

/**
 * Badge de statut d'une sous-composante. Forme shadcn (coins `md`, `text-xs`),
 * couleurs de statut calibrées pour la projection (DESIGN_SYSTEM §2) : la
 * couleur n'est jamais seule, le libellé la double toujours.
 */
@Component({
  selector: 'dqa-badge-statut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold"
    [class]="couleurs()"
    >{{ libelle() }}</span
  >`,
})
export class BadgeStatut {
  readonly statut = input.required<StatutSousComposante | null>();

  private readonly cle = computed<StatutSousComposante>(() => this.statut() ?? 'NON_CALCULABLE');

  protected readonly libelle = computed(
    () =>
      ({ CONFORME: 'Conforme', ALERTE: 'Alerte', NON_CALCULABLE: 'Non calculable' })[this.cle()],
  );

  protected readonly couleurs = computed(
    () =>
      ({
        CONFORME: 'bg-conforme-fond text-conforme-texte',
        ALERTE: 'bg-alerte-fond text-alerte-texte',
        NON_CALCULABLE: 'bg-nc-fond text-nc-texte',
      })[this.cle()],
  );
}
