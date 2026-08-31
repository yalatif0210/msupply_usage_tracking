import { describe, expect, it } from 'vitest';
import {
  detailSiteSchema,
  historiqueSiteSchema,
  scoreSiteSchema,
  SOUS_COMPOSANTES_DU_PILIER,
  syntheseNationaleSchema,
  type Pilier,
} from '@dqa/contracts';
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

  const repartition = { CONFORME: 1, PARTIELLEMENT_CONFORME: 2, NON_CONFORME: 1, SANS_MESURE: 1 };
  const synthese = (over: Record<string, unknown> = {}) => ({
    moisPaqd: '2026-08',
    moisDisponibles: ['2026-08'],
    programmeId: null,
    region: null,
    national: {
      nbSites: 5,
      nbMesures: 4,
      scoreCompositeMoyen: 72.5,
      repartition,
      moyennesPiliers: (['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as Pilier[]).map((pilier) => ({
        pilier,
        moyenne: 50,
      })),
      ...over,
    },
    parDistrict: [{ district: 'D1', nbSites: 2, nbMesures: 2, scoreCompositeMoyen: 80, repartition }],
    parProgramme: [
      { programmeId: 'P', programmeNom: 'VIH', nbSites: 3, nbMesures: 2, scoreCompositeMoyen: 60, repartition },
    ],
  });

  it('accepte une SyntheseNationale complète', () => {
    const s = validerReponse(syntheseNationaleSchema, synthese());
    expect(s.national.moyennesPiliers).toHaveLength(6);
    expect(s.parProgramme[0]?.programmeNom).toBe('VIH');
  });

  it('rejette un score composite moyen hors de [0, 100]', () => {
    expect(() =>
      validerReponse(syntheseNationaleSchema, synthese({ scoreCompositeMoyen: 130 })),
    ).toThrow(/non conforme/i);
  });

  it('rejette moyennesPiliers si le compte n\'est pas 6', () => {
    expect(() =>
      validerReponse(syntheseNationaleSchema, synthese({ moyennesPiliers: [{ pilier: 'P1', moyenne: 50 }] })),
    ).toThrow(/non conforme/i);
  });

  it('rejette une répartition avec une classe inconnue / manquante', () => {
    const bancale = synthese();
    bancale.national.repartition = { CONFORME: 1, PARTIELLEMENT_CONFORME: 2, NON_CONFORME: 1 } as never;
    expect(() => validerReponse(syntheseNationaleSchema, bancale)).toThrow(/non conforme/i);
  });

  const point = (over: Record<string, unknown> = {}) => ({
    moisPaqd: '2026-08',
    rang: 4,
    scoreComposite: 82,
    classification: 'PARTIELLEMENT_CONFORME',
    piliersCouverts: 6,
    scoresPiliers: (['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as Pilier[]).map((pilier) => ({ pilier, score: 100 })),
    ...over,
  });
  const historique = (pointOver: Record<string, unknown> = {}) => ({
    site,
    programmeId: null,
    cyclePaqd: '2026-C2',
    cyclesDisponibles: ['2026-C2'],
    points: [point({ rang: 1, scoreComposite: 60 }), point(pointOver)],
  });

  it('accepte un HistoriqueSite complet', () => {
    const h = validerReponse(historiqueSiteSchema, historique());
    expect(h.points).toHaveLength(2);
    expect(h.points[1]?.scoresPiliers).toHaveLength(6);
  });

  it('rejette un rang hors de [1, 4]', () => {
    expect(() => validerReponse(historiqueSiteSchema, historique({ rang: 5 }))).toThrow(/non conforme/i);
  });

  it('rejette un score composite de point hors de [0, 100]', () => {
    expect(() => validerReponse(historiqueSiteSchema, historique({ scoreComposite: 120 }))).toThrow(/non conforme/i);
  });

  it('rejette un point à moins de six scores de pilier', () => {
    expect(() =>
      validerReponse(historiqueSiteSchema, historique({ scoresPiliers: [{ pilier: 'P1', score: 100 }] })),
    ).toThrow(/non conforme/i);
  });
});
