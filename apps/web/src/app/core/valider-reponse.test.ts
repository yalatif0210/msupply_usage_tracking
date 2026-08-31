import { describe, expect, it } from 'vitest';
import { detailSiteSchema, scoreSiteSchema, SOUS_COMPOSANTES_DU_PILIER, type Pilier } from '@dqa/contracts';
import { z } from 'zod';
import { validerReponse } from './valider-reponse';

const site = { siteId: 'S1', siteCode: null, siteNom: 'CSU', district: null, region: null, typeStructure: null };

const pilier = (code: Pilier, score: number | null) => ({
  pilier: code,
  libelle: code,
  poids: 10,
  score,
  sousComposantes: SOUS_COMPOSANTES_DU_PILIER[code].map((sc) => ({
    sousComposante: sc,
    libelle: sc,
    valeur: score,
    unite: 'pct' as const,
    seuil: 100,
    statut: score === null ? ('NON_CALCULABLE' as const) : ('CONFORME' as const),
    raison: score === null ? 'pas de donnée' : null,
  })),
});

const detailSixPiliers = (opts: { scoreComposite: unknown; classification: unknown }) => ({
  site,
  moisPaqd: '2026-08',
  moisDisponibles: ['2026-08'],
  programmeId: null,
  piliersCouverts: 2,
  piliersTotal: 6,
  scoreComposite: opts.scoreComposite,
  classification: opts.classification,
  piliers: (['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as Pilier[]).map((c) =>
    pilier(c, c === 'P5' || c === 'P6' ? 100 : null),
  ),
});

describe('validerReponse (couture D)', () => {
  it('renvoie la donnée quand elle est conforme au contrat', () => {
    const liste = z.array(scoreSiteSchema);
    const ok = validerReponse(liste, [
      {
        site,
        moisPaqd: '2026-08',
        piliersCouverts: 2,
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

  it('accepte un DetailSite à six piliers avec score composite et classification', () => {
    const d = validerReponse(
      detailSiteSchema,
      detailSixPiliers({ scoreComposite: 71.4, classification: 'NON_CONFORME' }),
    );
    expect(d.piliers).toHaveLength(6);
    expect(d.scoreComposite).toBe(71.4);
    expect(d.classification).toBe('NON_CONFORME');
  });

  it('rejette un score composite hors de [0, 100]', () => {
    expect(() =>
      validerReponse(detailSiteSchema, detailSixPiliers({ scoreComposite: 142, classification: 'CONFORME' })),
    ).toThrow(/non conforme/i);
  });

  it('rejette une classification inconnue', () => {
    expect(() =>
      validerReponse(detailSiteSchema, detailSixPiliers({ scoreComposite: 80, classification: 'MOYEN' })),
    ).toThrow(/non conforme/i);
  });
});
