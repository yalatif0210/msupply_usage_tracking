import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LIBELLES_PILIER, PILIERS } from '@dqa/contracts';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'dqa-tableau-de-bord',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <h1>Tableau de bord DQA mSupply</h1>
      @if (auth.utilisateur(); as u) {
        <p>
          {{ u.nom }} — <em>{{ u.role }}</em>
          <button type="button" (click)="deconnexion()">Se déconnecter</button>
        </p>
      }
    </header>
    <main>
      <p>Piliers PAQD suivis :</p>
      <ul>
        @for (pilier of piliers; track pilier) {
          <li><strong>{{ pilier }}</strong> — {{ libelles[pilier] }}</li>
        }
      </ul>
    </main>
  `,
  styles: `
    :host { display: block; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.6rem; }
    header button { margin-left: 1rem; }
    li { line-height: 1.7; }
  `,
})
export class TableauDeBordPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly piliers = PILIERS;
  protected readonly libelles = LIBELLES_PILIER;

  protected async deconnexion(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigate(['/connexion']);
  }
}
