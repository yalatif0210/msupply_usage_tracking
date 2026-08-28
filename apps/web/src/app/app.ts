import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LIBELLES_PILIER, PILIERS } from '@dqa/contracts';

@Component({
  selector: 'dqa-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <h1>Tableau de bord DQA mSupply</h1>
      <p>Socle applicatif — coquille</p>
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
    li { line-height: 1.7; }
  `,
})
export class App {
  protected readonly piliers = PILIERS;
  protected readonly libelles = LIBELLES_PILIER;
}
