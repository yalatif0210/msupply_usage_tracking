/** Code SQLSTATE d'une erreur `pg`, ou `undefined` si ce n'en est pas une. */
export const codePg = (err: unknown): string | undefined =>
  err !== null && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
    ? err.code
    : undefined;

/** Violation de contrainte d'unicité (SQLSTATE 23505). */
export const estDoublon = (err: unknown): boolean => codePg(err) === '23505';

/** Violation de clé étrangère (SQLSTATE 23503). */
export const estReferenceViolee = (err: unknown): boolean => codePg(err) === '23503';
