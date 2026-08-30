import type { ZodType } from 'zod';

/**
 * Valide une réponse API contre le schéma Zod du contrat. Une réponse non
 * conforme lève une erreur explicite plutôt que de propager des `undefined`
 * dans l'interface (ARCHITECTURE.md §4).
 */
export function validerReponse<T>(schema: ZodType<T>, donnees: unknown): T {
  const r = schema.safeParse(donnees);
  if (!r.success) {
    throw new Error(
      `Réponse API non conforme au contrat : ${r.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .join(' ; ')}`,
    );
  }
  return r.data;
}
