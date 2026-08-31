import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'dqa-entete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <header>
      <a routerLink="/" class="titre">Tableau de bord DQA</a>
      <nav>
        <a routerLink="/synthese">Synthèse nationale</a>
        <a routerLink="/imports">Journal des imports</a>
        @if (auth.utilisateur(); as u) {
          @if (u.role === 'coordination' || u.role === 'admin') {
            <a routerLink="/admin/traceurs">Traceurs</a>
          }
          @if (u.role === 'coordination') {
            <a routerLink="/admin/grille">Grille</a>
          }
          @if (u.role === 'admin') {
            <a routerLink="/admin/comptes">Comptes</a>
          }
          <span class="user">{{ u.nom }} · {{ u.role }}</span>
          <button type="button" (click)="deconnexion()">Déconnexion</button>
        }
      </nav>
    </header>
  `,
  styles: `
    header {
      display: flex; align-items: baseline; justify-content: space-between;
      padding: 0.8rem 1rem; border-bottom: 2px solid #1f3d7a; margin-bottom: 1.5rem;
    }
    .titre { font-weight: 700; color: #1f3d7a; text-decoration: none; font-size: 1.1rem; }
    nav { display: flex; gap: 1rem; align-items: baseline; font-size: 0.9rem; }
    .user { color: #5b5b5b; }
  `,
})
export class Entete {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async deconnexion(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigate(['/connexion']);
  }
}
