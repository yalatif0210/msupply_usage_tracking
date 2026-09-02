import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { AuthService } from '../core/auth.service';

/**
 * Écran de connexion au registre shadcn-admin : carte centrée sur fond neutre,
 * champs spartan, bouton pleine largeur. Le message d'erreur est un bloc
 * non bloquant sous les champs (jamais une redirection ni une page en erreur).
 */
@Component({
  selector: 'dqa-connexion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgIcon, HlmButton, HlmInput, HlmLabel],
  providers: [provideIcons({ lucideTriangleAlert })],
  template: `
    <main class="flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div
        class="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs sm:p-8"
      >
        <div class="flex flex-col gap-1.5 text-center">
          <h1 class="text-xl font-bold tracking-tight">Tableau de bord DQA</h1>
          <p class="text-sm text-muted-foreground">
            Entrez vos identifiants pour accéder à la console.
          </p>
        </div>

        <form class="mt-6 flex flex-col gap-4" (ngSubmit)="soumettre()">
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="identifiant">Identifiant</label>
            <input
              hlmInput
              id="identifiant"
              name="identifiant"
              class="w-full"
              [(ngModel)]="identifiant"
              autocomplete="username"
              required
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="mot-de-passe">Mot de passe</label>
            <input
              hlmInput
              id="mot-de-passe"
              name="motDePasse"
              type="password"
              class="w-full"
              [(ngModel)]="motDePasse"
              autocomplete="current-password"
              required
            />
          </div>

          @if (erreur()) {
            <p
              class="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              <ng-icon name="lucideTriangleAlert" class="shrink-0 text-base" aria-hidden="true" />
              {{ erreur() }}
            </p>
          }

          <button hlmBtn type="submit" class="w-full" [disabled]="enCours()">
            {{ enCours() ? 'Connexion…' : 'Se connecter' }}
          </button>
        </form>
      </div>
    </main>
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
