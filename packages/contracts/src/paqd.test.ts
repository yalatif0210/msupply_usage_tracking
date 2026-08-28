import { describe, expect, it } from 'vitest';
import {
  classifier,
  CLASSIFICATIONS,
  dateIsoSchema,
  PILIER_DE_SOUS_COMPOSANTE,
  PILIERS,
  POIDS_PILIER,
  resultatImportSchema,
  SOUS_COMPOSANTES,
  SOUS_COMPOSANTES_DU_PILIER,
  statutSousComposanteSchema,
} from './index.js';

describe('poids des piliers', () => {
  it('somme à 1', () => {
    const somme = PILIERS.reduce((acc, p) => acc + POIDS_PILIER[p], 0);
    expect(somme).toBeCloseTo(1, 10);
  });
});

describe('classifier', () => {
  it('CONFORME au seuil de 90 et au-dessus', () => {
    expect(classifier(90)).toBe('CONFORME');
    expect(classifier(100)).toBe('CONFORME');
  });
  it('PARTIELLEMENT_CONFORME entre 75 et 89', () => {
    expect(classifier(75)).toBe('PARTIELLEMENT_CONFORME');
    expect(classifier(89.9)).toBe('PARTIELLEMENT_CONFORME');
  });
  it('NON_CONFORME en dessous de 75', () => {
    expect(classifier(74.9)).toBe('NON_CONFORME');
    expect(classifier(0)).toBe('NON_CONFORME');
  });
});

describe('classification sérialisée avec underscores', () => {
  it('ne contient pas de forme à espaces', () => {
    for (const c of CLASSIFICATIONS) {
      expect(c).not.toContain(' ');
    }
    expect(CLASSIFICATIONS).toContain('PARTIELLEMENT_CONFORME');
    expect(CLASSIFICATIONS).toContain('NON_CONFORME');
  });
});

describe('sous-composantes', () => {
  it('chaque sous-composante appartient à un pilier connu', () => {
    for (const sc of SOUS_COMPOSANTES) {
      expect(PILIERS).toContain(PILIER_DE_SOUS_COMPOSANTE[sc]);
    }
  });
  it('la liste par pilier couvre exactement les 9 sous-composantes', () => {
    const aplat = PILIERS.flatMap((p) => SOUS_COMPOSANTES_DU_PILIER[p]);
    expect([...aplat].sort()).toEqual([...SOUS_COMPOSANTES].sort());
  });
  it('P1 en a trois, P2 deux, P3..P6 une', () => {
    expect(SOUS_COMPOSANTES_DU_PILIER.P1).toHaveLength(3);
    expect(SOUS_COMPOSANTES_DU_PILIER.P2).toHaveLength(2);
    expect(SOUS_COMPOSANTES_DU_PILIER.P3).toHaveLength(1);
    expect(SOUS_COMPOSANTES_DU_PILIER.P6).toHaveLength(1);
  });
});

describe('statut de sous-composante', () => {
  it('est binaire (pas de PARTIEL)', () => {
    expect(statutSousComposanteSchema.options).toEqual([
      'CONFORME',
      'ALERTE',
      'NON_CALCULABLE',
    ]);
  });
});

describe('dateIsoSchema', () => {
  it('accepte AAAA-MM-JJ', () => {
    expect(dateIsoSchema.parse('2026-08-15')).toBe('2026-08-15');
  });
  it('rejette les autres formats avec le bon message', () => {
    const r = dateIsoSchema.safeParse('15/08/2026');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain('AAAA-MM-JJ');
  });
});

describe('resultatImportSchema', () => {
  it('accepte un rejet avec au moins une anomalie erreur', () => {
    const r = resultatImportSchema.safeParse({
      statut: 'rejete',
      motif: 'compteur METADATA incohérent',
      anomalies: [
        {
          onglet: 'SITES',
          ligneSource: null,
          gravite: 'erreur',
          code: 'COMPTEUR_METADATA',
          message: '40 déclarées, 39 reçues',
          valeurBrute: null,
        },
      ],
    });
    expect(r.success).toBe(true);
  });
  it('rejette un rejet sans anomalie', () => {
    const r = resultatImportSchema.safeParse({
      statut: 'rejete',
      motif: 'x',
      anomalies: [],
    });
    expect(r.success).toBe(false);
  });
});
