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
    loadComponent: () => import('./pages/liste-sites').then((m) => m.ListeSitesPage),
  },
  {
    path: 'sites/:id',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/detail-site').then((m) => m.DetailSitePage),
  },
  {
    path: 'imports',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/journal-imports').then((m) => m.JournalImportsPage),
  },
  { path: '**', redirectTo: '' },
];
