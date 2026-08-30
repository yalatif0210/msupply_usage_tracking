import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'dqa-connexion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <main class="carte">
      <h1>Tableau de bord DQA</h1>
      <p class="sous-titre">Connexion requise</p>
      <form (ngSubmit)="soumettre()">
        <label>
          Identifiant
          <input name="identifiant" [(ngModel)]="identifiant" autocomplete="username" required />
        </label>
        <label>
          Mot de passe
          <input
            name="motDePasse"
            type="password"
            [(ngModel)]="motDePasse"
            autocomplete="current-password"
            required
          />
        </label>
        @if (erreur()) {
          <p class="erreur" role="alert">{{ erreur() }}</p>
        }
        <button type="submit" [disabled]="enCours()">
          {{ enCours() ? 'Connexion…' : 'Se connecter' }}
        </button>
      </form>
    </main>
  `,
  styles: `
    .carte {
      max-width: 22rem;
      margin: 6rem auto;
      padding: 2rem;
      background: #fff;
      border: 1px solid #d9d9d6;
    }
    h1 { font-size: 1.4rem; margin: 0; }
    .sous-titre { color: #5b5b5b; margin-top: 0.25rem; }
    form { display: grid; gap: 1rem; margin-top: 1.5rem; }
    label { display: grid; gap: 0.3rem; font-size: 0.9rem; }
    input { padding: 0.5rem; border: 1px solid #d9d9d6; font-size: 1rem; }
    button { padding: 0.6rem; background: #1f3d7a; color: #fff; border: 0; font-size: 1rem; cursor: pointer; }
    button[disabled] { opacity: 0.6; cursor: default; }
    .erreur { color: #8a1c13; margin: 0; font-size: 0.9rem; }
  `,
})
export class ConnexionPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected identifiant = '';
  protected motDePasse = '';
  protected readonly erreur = signal<string | null>(null);
  protected readonly enCours = signal(false);

  protected async soumettre(): Promise<void> {
    this.erreur.set(null);
    this.enCours.set(true);
    try {
      await this.auth.connexion({ identifiant: this.identifiant, motDePasse: this.motDePasse });
      await this.router.navigate(['/']);
    } catch {
      this.erreur.set('Identifiant ou mot de passe incorrect.');
    } finally {
      this.enCours.set(false);
    }
  }
}
