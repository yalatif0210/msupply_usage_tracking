import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';

/**
 * Coquille de la console : deux barres horizontales, aucune barre latérale.
 * Barre 1 : titre et compte. Barre 2 : navigation de sections, filtrée par
 * rôle. Aucun sélecteur global (mois, programme) : chaque écran porte ses
 * propres filtres.
 */
@Component({
  selector: 'dqa-coquille',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="barre1">
      <a routerLink="/" class="titre">Tableau de bord DQA</a>
      @if (auth.utilisateur(); as u) {
        <div class="compte">
          <span class="qui">{{ u.nom }} · {{ u.role }}</span>
          <button type="button" (click)="deconnexion()">Déconnexion</button>
        </div>
      }
    </header>

    @if (auth.utilisateur(); as u) {
      <nav class="barre2" aria-label="Sections">
        <a routerLink="/" routerLinkActive="actif" [routerLinkActiveOptions]="{ exact: true }">Tableau de bord</a>
        <a routerLink="/sites" routerLinkActive="actif">Sites</a>
        <a routerLink="/synthese" routerLinkActive="actif">Synthèse</a>
        <a routerLink="/imports" routerLinkActive="actif">Imports</a>
        @if (u.role === 'coordination' || u.role === 'admin') {
          <a routerLink="/admin/traceurs" routerLinkActive="actif">Traceurs</a>
        }
        @if (u.role === 'coordination') {
          <a routerLink="/admin/grille" routerLinkActive="actif">Grille</a>
        }
        @if (u.role === 'admin') {
          <a routerLink="/admin/comptes" routerLinkActive="actif">Comptes</a>
        }
      </nav>
    }
  `,
  styles: `
    .barre1 {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; flex-wrap: wrap;
      padding: 0.7rem 1.25rem;
      background: var(--barre1-fond); color: var(--barre1-texte);
    }
    .titre { font-weight: 700; font-size: 1.05rem; color: inherit; text-decoration: none; }
    .compte { display: flex; align-items: center; gap: 1rem; font-size: 0.85rem; }
    .qui { opacity: 0.9; }
    .compte button {
      background: var(--sur-marque-faible); color: inherit;
      border: 1px solid var(--sur-marque-bordure); border-radius: 4px;
      padding: 0.3rem 0.7rem; cursor: pointer; font-size: 0.85rem;
    }
    .compte button:hover { background: var(--sur-marque-fort); }

    .barre2 {
      display: flex; gap: 0.25rem; flex-wrap: wrap;
      padding: 0 1.25rem;
      background: var(--barre2-fond); color: var(--barre2-texte);
      border-bottom: 1px solid var(--bordure);
    }
    .barre2 a {
      padding: 0.7rem 0.9rem; font-size: 0.9rem;
      color: var(--texte-doux); text-decoration: none;
      border-bottom: 2px solid transparent;
    }
    .barre2 a:hover { color: var(--texte); }
    .barre2 a.actif { color: var(--marque); border-bottom-color: var(--marque); font-weight: 600; }
  `,
})
export class Coquille {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async deconnexion(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigate(['/connexion']);
  }
}
