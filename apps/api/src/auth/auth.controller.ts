import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  identifiantsConnexionSchema,
  type Utilisateur,
} from '@dqa/contracts';
import { AuthService } from './auth.service.js';
import { Public } from './auth.metadata.js';
import type { RequeteAuthentifiee } from './auth.guard.js';
import {
  effacerCookieSession,
  lireCookie,
  NOM_COOKIE_SESSION,
  poserCookieSession,
} from './cookies.js';
import { ZodValidationPipe } from '../commun/zod-validation.pipe.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('connexion')
  @HttpCode(200)
  async connexion(
    @Body(new ZodValidationPipe(identifiantsConnexionSchema))
    corps: { identifiant: string; motDePasse: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<Utilisateur> {
    const { sessionId, utilisateur, expireLe } = await this.auth.connexion(
      corps.identifiant,
      corps.motDePasse,
    );
    poserCookieSession(res, sessionId, expireLe);
    return utilisateur;
  }

  @Public()
  @Post('deconnexion')
  @HttpCode(204)
  async deconnexion(
    @Req() req: RequeteAuthentifiee,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.deconnexion(lireCookie(req, NOM_COOKIE_SESSION));
    effacerCookieSession(res);
  }

  @Get('moi')
  moi(@Req() req: RequeteAuthentifiee): Utilisateur {
    // La garde a déjà rempli req.utilisateur (route non publique).
    return req.utilisateur!;
  }
}
