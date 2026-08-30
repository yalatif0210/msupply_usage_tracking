import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Utilisateur } from '@dqa/contracts';
import { AuthService } from './auth.service.js';
import { Public, Roles } from './auth.metadata.js';
import { lireCookie, NOM_COOKIE_SESSION } from './cookies.js';

export interface RequeteAuthentifiee extends Request {
  utilisateur?: Utilisateur;
}

/**
 * Garde globale : toute route exige une session valide, sauf celles marquées
 * `@Public()`. `@Roles(...)` restreint en plus à certains rôles.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const cibles = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride(Public, cibles)) return true;

    const req = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const sessionId = lireCookie(req, NOM_COOKIE_SESSION);
    const utilisateur = await this.auth.utilisateurDeSession(sessionId);
    if (!utilisateur) {
      throw new UnauthorizedException('Authentification requise');
    }
    req.utilisateur = utilisateur;

    const rolesRequis = this.reflector.getAllAndOverride(Roles, cibles);
    if (rolesRequis && rolesRequis.length > 0 && !rolesRequis.includes(utilisateur.role)) {
      throw new ForbiddenException('Rôle insuffisant');
    }
    return true;
  }
}
