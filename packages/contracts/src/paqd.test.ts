import { describe, expect, it } from 'vitest';
import {
  CLASSIFICATIONS,
  dateIsoSchema,
  LIBELLES_PILIER,
  libelleSousComposante,
  PILIER_DE_SOUS_COMPOSANTE,
  PILIERS,
  resultatImportSchema,
  SOUS_COMPOSANTES,
  SOUS_COMPOSANTES_DU_PILIER,
  statutSousComposanteSchema,
} from './index.js';

describe('libellés de pilier', () => {
  it('P4 est « Taux de conformité » (et non « Écart SDU »)', () => {
    expect(LIBELLES_PILIER.P4).toBe('Taux de conformité');
  });

  it('les sous-composantes P4 se lisent « Conformité », pas « Écart »', () => {
    expect(libelleSousComposante('ecart_sdu', false)).toBe('Conformité SDU');
    expect(libelleSousComposante('ecart_consommation', false)).toBe('Conformité consommation');
    expect(libelleSousComposante('ecart_consommation', true)).toBe('Conformité distribution');
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
  it('la liste par pilier couvre exactement les 9 sous-composantes (ADR 0019)', () => {
    const aplat = PILIERS.flatMap((p) => SOUS_COMPOSANTES_DU_PILIER[p]);
    expect([...aplat].sort()).toEqual([...SOUS_COMPOSANTES].sort());
    expect(SOUS_COMPOSANTES).toHaveLength(9);
  });
  it('P1, P2 et P4 en ont deux, P3, P5 et P6 une', () => {
    expect(SOUS_COMPOSANTES_DU_PILIER.P1).toHaveLength(2);
    expect(SOUS_COMPOSANTES_DU_PILIER.P2).toHaveLength(2);
    expect(SOUS_COMPOSANTES_DU_PILIER.P3).toHaveLength(1);
    expect(SOUS_COMPOSANTES_DU_PILIER.P4).toHaveLength(2);
    expect(SOUS_COMPOSANTES_DU_PILIER.P5).toHaveLength(1);
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
