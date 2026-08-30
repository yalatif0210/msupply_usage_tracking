import type { Request, Response } from 'express';

export const NOM_COOKIE_SESSION = 'dqa_session';

/** Parse l'en-tête Cookie sans dépendance externe. */
export function lireCookie(req: Request, nom: string): string | undefined {
  const brut = req.headers.cookie;
  if (!brut) return undefined;
  for (const paire of brut.split(';')) {
    const i = paire.indexOf('=');
    if (i === -1) continue;
    if (paire.slice(0, i).trim() === nom) {
      return decodeURIComponent(paire.slice(i + 1).trim());
    }
  }
  return undefined;
}

export function poserCookieSession(res: Response, sessionId: string, expireLe: Date): void {
  res.cookie(NOM_COOKIE_SESSION, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expireLe,
    path: '/',
  });
}

export function effacerCookieSession(res: Response): void {
  res.clearCookie(NOM_COOKIE_SESSION, { path: '/' });
}
