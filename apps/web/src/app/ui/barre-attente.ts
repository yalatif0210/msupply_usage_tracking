import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Fine barre de progression indeterminee, posee en haut du panneau qui se
 * rafraichit. Seule affordance d'attente autorisee sur un changement de filtre
 * (jamais de spinner plein ecran, cf. DESIGN_SYSTEM section 10). Le panneau
 * parent porte `aria-busy`, la barre est purement decorative.
 */
@Component({
  selector: 'dqa-barre-attente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (actif()) { <div class="barre" aria-hidden="true"><span></span></div> }`,
  styles: `
    .barre { position: relative; height: 2px; overflow: hidden; background: var(--marque-doux); }
    .barre span { position: absolute; inset: 0; width: 40%; background: var(--marque); animation: glisse 1.1s ease-in-out infinite; }
    @keyframes glisse {
      0% { left: -40%; }
      100% { left: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .barre span { animation: none; width: 100%; opacity: 0.5; }
    }
  `,
})
export class BarreAttente {
  readonly actif = input(false);
}
