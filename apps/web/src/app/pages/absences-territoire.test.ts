import { describe, expect, it } from 'vitest';
import { libelleAbsences } from './absences-territoire';

const pe = { absentsOuverture: 7, oublisOuverture: 5, absentsCloture: 3, oublisCloture: 1 };

describe('libelleAbsences', () => {
  it('qualifie les oublis selon l’inventaire manqué', () => {
    expect(libelleAbsences(pe, 'ouverture')).toBe('7 · 5 oublis démontrés');
    expect(libelleAbsences(pe, 'cloture')).toBe('3 · 1 oubli probable');
  });

  it('n’écrit pas « 0 oubli » : le seul nombre d’absents', () => {
    expect(libelleAbsences({ ...pe, oublisCloture: 0 }, 'cloture')).toBe('3');
    expect(libelleAbsences({ ...pe, absentsOuverture: 0, oublisOuverture: 0 }, 'ouverture')).toBe('0');
  });

  it('rien à montrer pour un filtre programme', () => {
    expect(libelleAbsences(null, 'ouverture')).toBe('n/d');
  });
});
