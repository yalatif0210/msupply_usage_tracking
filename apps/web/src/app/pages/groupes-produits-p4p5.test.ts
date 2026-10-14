import { describe, expect, it } from 'vitest';
import type { LigneProduitP4P5 } from '@dqa/contracts';
import { grouperProduitsP4P5 } from './groupes-produits-p4p5';

function ligne(produitId: string, produitCode: string, sdu: boolean, conso: boolean | null): LigneProduitP4P5 {
  return {
    produitId,
    produitCode,
    libelle: produitCode,
    article: null,
    sdu: { theorique: 100, comptee: 100, ecartPct: 0, conforme: sdu },
    consommation:
      conso === null
        ? { evaluable: false, raisonExclusion: 'aucune_borne' }
        : {
            evaluable: true, stockDebut: 10, stockFin: 5, receptions: 0,
            declaree: 5, reconstituee: 5, ecartPct: 0, conforme: conso,
          },
    concordance: { tauxPct: 100, conforme: sdu },
  };
}

describe('grouperProduitsP4P5', () => {
  it('un code à un seul article forme un groupe d\'une ligne', () => {
    const g = grouperProduitsP4P5([ligne('I1', 'ARV', true, true)]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ produitCode: 'ARV', sduConforme: true, consoConforme: true });
  });

  it('un code est non conforme dès qu\'un de ses articles ne l\'est pas', () => {
    const g = grouperProduitsP4P5([ligne('I2A', 'ALB', true, true), ligne('I2B', 'ALB', false, false)]);
    expect(g).toHaveLength(1);
    expect(g[0]?.articles.map((a) => a.produitId)).toEqual(['I2A', 'I2B']);
    expect(g[0]).toMatchObject({ sduConforme: false, concordanceConforme: false, consoConforme: false });
  });

  it('la consommation ne juge que les articles évaluables', () => {
    const g = grouperProduitsP4P5([ligne('I2A', 'ALB', true, null), ligne('I2B', 'ALB', true, true)]);
    expect(g[0]?.consoConforme).toBe(true);
    const aucune = grouperProduitsP4P5([ligne('I3', 'TB', true, null)]);
    expect(aucune[0]?.consoConforme).toBeNull();
  });
});
