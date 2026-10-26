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
    loadComponent: () => import('./pages/tableau-de-bord').then((m) => m.TableauDeBordPage),
  },
  {
    path: 'sites',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/liste-sites').then((m) => m.ListeSitesPage),
  },
  {
    path: 'synthese',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/synthese').then((m) => m.SynthesePage),
  },
  {
    path: 'stocks',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/suivi-stocks').then((m) => m.SuiviStocksPage),
  },
  {
    path: 'sites/:id',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/detail-site').then((m) => m.DetailSitePage),
  },
  {
    path: 'sites/:id/produits/:code',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/fiche-produit').then((m) => m.FicheProduitPage),
  },
  {
    // Le dépôt et le suivi des extractions mensuelles relèvent de la
    // coordination (elle seule pilote le cycle PAQD ; l'API refuse le POST
    // hors ce rôle).
    path: 'imports',
    canActivate: [gardeAuthentifie, gardeRole(['coordination'])],
    loadComponent: () => import('./pages/journal-imports').then((m) => m.JournalImportsPage),
  },
  {
    // Le référentiel des traceurs est une donnée (ADR 0005) : édition réservée à
    // la coordination, comme la grille. L'admin ne touche pas aux données.
    path: 'admin/traceurs',
    canActivate: [gardeAuthentifie, gardeRole(['coordination'])],
    loadComponent: () => import('./pages/admin-traceurs').then((m) => m.AdminTraceursPage),
  },
  {
    path: 'admin/grille',
    canActivate: [gardeAuthentifie, gardeRole(['coordination'])],
    loadComponent: () => import('./pages/admin-grille').then((m) => m.AdminGrillePage),
  },
  {
    path: 'admin/comptes',
    canActivate: [gardeAuthentifie, gardeRole(['admin'])],
    loadComponent: () => import('./pages/admin-comptes').then((m) => m.AdminComptesPage),
  },
  {
    // Lecture ouverte à tout rôle (lecteur inclus, en consultation seule) ;
    // l'écriture est refusée côté API hors rôle coordination.
    path: 'admin/strates',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/admin-strates').then((m) => m.AdminStratesPage),
  },
  {
    // Programmes éligibles (ADR 0020) : lecture ouverte à tout rôle, écriture
    // refusée côté API hors rôle coordination.
    path: 'admin/programmes',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/admin-programmes').then((m) => m.AdminProgrammesPage),
  },
  {
    // Harnais de revue des composants de graphe (ticket 04), données statiques.
    // À retirer au ticket 12 si la revue ne le conserve pas.
    path: '_graphes',
    canActivate: [gardeAuthentifie],
    loadComponent: () => import('./pages/demo-graphes').then((m) => m.DemoGraphesPage),
  },
  { path: '**', redirectTo: '' },
];
