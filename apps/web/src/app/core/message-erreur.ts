import { HttpErrorResponse } from '@angular/common/http';

interface CorpsErreur {
  message?: string;
  details?: { message: string }[];
}

/**
 * Message lisible tiré d'une erreur HTTP : les détails de validation Zod
 * (`ZodValidationPipe`) puis le `message` de l'exception NestJS, sinon un
 * repli générique.
 */
export function messageErreurHttp(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const corps = err.error as CorpsErreur | null;
    if (corps?.details?.length) return corps.details.map((d) => d.message).join(' ; ');
    if (corps?.message) return corps.message;
  }
  return 'Opération impossible.';
}
