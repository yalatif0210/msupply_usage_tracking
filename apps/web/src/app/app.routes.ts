import { Routes } from '@angular/router';
import { gardeAuthentifie } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'connexion',
    loadComponent: () => import('./pages/connexion').then((m) => m.ConnexionPage),
  },
  {
    path: '',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/tableau-de-bord').then((m) => m.TableauDeBordPage),
  },
  {
    path: 'imports',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/journal-imports').then((m) => m.JournalImportsPage),
  },
  { path: '**', redirectTo: '' },
];
