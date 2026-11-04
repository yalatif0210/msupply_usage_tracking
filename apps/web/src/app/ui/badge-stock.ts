import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { StatutStock } from '@dqa/contracts';
import { COULEURS_STATUT, LIBELLES_STATUT } from '../core/arbre-stocks';

/** Statut de stock d'un couple site × produit : libellé toujours écrit, la couleur n'est jamais seule. */
@Component({
  selector: 'dqa-badge-stock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold" [class]="couleurs()">{{ libelle() }}</span>`,
})
export class BadgeStock {
  readonly statut = input.required<StatutStock>();
  protected readonly libelle = computed(() => LIBELLES_STATUT[this.statut()]);
  protected readonly couleurs = computed(() => COULEURS_STATUT[this.statut()]);
}
