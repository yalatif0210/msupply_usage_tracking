import { HttpInterceptorFn } from '@angular/common/http';

/** Toutes les requêtes vers l'API portent le cookie de session. */
export const avecIdentifiants: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('api/')) {
    return next(req.clone({ withCredentials: true }));
  }
  return next(req);
};
