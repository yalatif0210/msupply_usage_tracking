import { describe, expect, it } from 'vitest';
import { scoreSiteSchema } from '@dqa/contracts';
import { z } from 'zod';
import { validerReponse } from './valider-reponse';

describe('validerReponse (couture D)', () => {
  it('renvoie la donnée quand elle est conforme au contrat', () => {
    const liste = z.array(scoreSiteSchema);
    const ok = validerReponse(liste, [
      {
        site: { siteId: 'S1', siteCode: null, siteNom: 'CSU', district: null, region: null, typeStructure: null },
        moisPaqd: '2026-08',
        scoreComposite: null,
        classification: null,
        scoresPiliers: [{ pilier: 'P5', score: 100 }, { pilier: 'P6', score: null }],
      },
    ]);
    expect(ok[0]?.site.siteId).toBe('S1');
  });

  it('lève une erreur explicite sur une réponse non conforme', () => {
    const liste = z.array(scoreSiteSchema);
    expect(() => validerReponse(liste, [{ site: { siteId: 'S1' } }])).toThrow(/non conforme/i);
  });
});
