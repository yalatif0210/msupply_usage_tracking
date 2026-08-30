import { Reflector } from '@nestjs/core';
import type { Role } from '@dqa/contracts';

/** Marque une route accessible sans authentification (santé, connexion). */
export const Public = Reflector.createDecorator<true>();

/** Restreint une route à un ou plusieurs rôles. Sans ce décorateur, tout
 *  utilisateur authentifié est admis. */
export const Roles = Reflector.createDecorator<Role[]>();
