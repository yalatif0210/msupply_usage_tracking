import type { LigneTerritoireScores } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';

/**
 * Cellule « absents de l'ouverture / de la clôture » de la synthèse par
 * territoire : « 7 · 5 oublis démontrés ». Une absence de l'ouverture se
 * qualifie en oubli démontré, une absence de la clôture en oubli probable ;
 * aucun oubli : le seul nombre d'absents.
 */
export function libelleAbsences(
  pe: LigneTerritoireScores['produitsEcartes'],
  sens: 'ouverture' | 'cloture',
): string {
  if (pe === null) return VALEUR_ABSENTE;
  const [n, oublis] = sens === 'ouverture'
    ? [pe.absentsOuverture, pe.oublisOuverture]
    : [pe.absentsCloture, pe.oublisCloture];
  if (oublis === 0) return String(n);
  const pluriel = oublis > 1 ? 's' : '';
  const qualificatif = sens === 'ouverture' ? `démontré${pluriel}` : `probable${pluriel}`;
  return `${n} · ${oublis} oubli${pluriel} ${qualificatif}`;
}
