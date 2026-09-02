import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Classification } from '@dqa/contracts';

/**
 * Range un site d'après son score composite (DESIGN_SYSTEM §2) : vert CONFORME,
 * ambre PARTIELLEMENT CONFORME, rouge NON CONFORME. `null` = score composite
 * non calculable. Forme shadcn, couleurs de statut calibrées projection.
 */
@Component({
  selector: 'dqa-badge-classification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="inline-flex items-center rounded-md px-2.5 py-0.5 text-sm font-bold"
    [class]="couleurs()"
    >{{ libelle() }}</span
  >`,
})
export class BadgeClassification {
  readonly classification = input.required<Classification | null>();

  private readonly cle = computed<Classification | 'AUCUNE'>(() => this.classification() ?? 'AUCUNE');

  protected readonly libelle = computed(
    () =>
      ({
        CONFORME: 'Conforme',
        PARTIELLEMENT_CONFORME: 'Partiellement conforme',
        NON_CONFORME: 'Non conforme',
        AUCUNE: 'Score non calculable',
      })[this.cle()],
  );

  protected readonly couleurs = computed(
    () =>
      ({
        CONFORME: 'bg-conforme-fond text-conforme-texte',
        PARTIELLEMENT_CONFORME: 'bg-partiel-fond text-partiel-texte',
        NON_CONFORME: 'bg-alerte-fond text-alerte-texte',
        AUCUNE: 'bg-nc-fond text-nc-texte',
      })[this.cle()],
  );
}
