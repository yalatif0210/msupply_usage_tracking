import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Route protégée : redirige vers /connexion si aucune session valide. */
export const gardeAuthentifie: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.assurerCharge();
  return auth.estConnecte() ? true : router.createUrlTree(['/connexion']);
};
