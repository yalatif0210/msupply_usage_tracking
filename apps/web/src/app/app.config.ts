import { ApplicationConfig, LOCALE_ID, provideZonelessChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { avecIdentifiants } from './core/http.interceptor';
import { routes } from './app.routes';

// Nombres et dates au format français partout (virgule décimale, espace des
// milliers) : le tableau de bord est projeté en réunion, un « 1,234.5 » à
// l'anglaise s'y lit de travers.
registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([avecIdentifiants])),
    { provide: LOCALE_ID, useValue: 'fr' },
  ],
};
