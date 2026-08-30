import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEYLEN = 32;

/**
 * Hachage de mot de passe avec scrypt (bibliothèque standard, cf. CLAUDE.md §7).
 * Format stocké : `scrypt$<selHex>$<hashHex>`.
 */
export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = randomBytes(16);
  const hash = (await scryptAsync(motDePasse, sel, KEYLEN)) as Buffer;
  return `scrypt$${sel.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifierMotDePasse(motDePasse: string, stocke: string): Promise<boolean> {
  const parts = stocke.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const sel = Buffer.from(parts[1] ?? '', 'hex');
  const attendu = Buffer.from(parts[2] ?? '', 'hex');
  if (attendu.length !== KEYLEN) return false;
  const calcule = (await scryptAsync(motDePasse, sel, KEYLEN)) as Buffer;
  return timingSafeEqual(calcule, attendu);
}
