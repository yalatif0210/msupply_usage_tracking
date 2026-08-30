import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { Role } from '@dqa/contracts';
import { AuthService } from './auth.service';

/** Route protégée : redirige vers /connexion si aucune session valide. */
export const gardeAuthentifie: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.assurerCharge();
  return auth.estConnecte() ? true : router.createUrlTree(['/connexion']);
};

/** Route réservée à certains rôles ; renvoie à l'accueil sinon. */
export function gardeRole(roles: Role[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.assurerCharge();
    const u = auth.utilisateur();
    if (!u) return router.createUrlTree(['/connexion']);
    return roles.includes(u.role) ? true : router.createUrlTree(['/']);
  };
}
