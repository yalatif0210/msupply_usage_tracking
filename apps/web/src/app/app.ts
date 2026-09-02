import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmToaster } from '@spartan-ng/helm/sonner';

/**
 * Coquille applicative. Le toaster `sonner` est monté ici, une seule fois :
 * `toast(...)` est un état global de la lib, un unique `<hlm-toaster>` au
 * niveau du shell suffit pour toutes les pages et évite les doublons (choix
 * documenté dans le ticket 10).
 */
@Component({
  selector: 'dqa-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, HlmToaster],
  template: `
    <router-outlet />
    <hlm-toaster />
  `,
})
export class App {}
