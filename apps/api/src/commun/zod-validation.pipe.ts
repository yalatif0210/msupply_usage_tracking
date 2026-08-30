import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valide une entrée avec un schéma Zod du contrat. Les schémas Zod sont la
 * source de vérité (cf. CLAUDE.md) — cette pipe les branche à l'entrée HTTP.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(valeur: unknown): T {
    const r = this.schema.safeParse(valeur);
    if (!r.success) {
      throw new BadRequestException({
        message: 'Entrée invalide',
        details: r.error.issues.map((i) => ({ chemin: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
