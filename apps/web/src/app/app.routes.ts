import { Routes } from '@angular/router';
import { gardeAuthentifie, gardeRole } from './core/auth.guard';

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
    path: 'synthese',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/synthese').then((m) => m.SynthesePage),
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
  {
    path: 'admin/traceurs',
    canActivate: [gardeAuthentifie, gardeRole(['coordination', 'admin'])],
    loadComponent: () => import('./pages/admin-traceurs').then((m) => m.AdminTraceursPage),
  },
  {
    path: 'admin/grille',
    canActivate: [gardeAuthentifie, gardeRole(['coordination', 'admin'])],
    loadComponent: () => import('./pages/admin-grille').then((m) => m.AdminGrillePage),
  },
  {
    path: 'admin/comptes',
    canActivate: [gardeAuthentifie, gardeRole(['admin'])],
    loadComponent: () => import('./pages/admin-comptes').then((m) => m.AdminComptesPage),
  },
  { path: '**', redirectTo: '' },
];
