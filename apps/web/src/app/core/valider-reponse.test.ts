import { describe, expect, it } from 'vitest';
import {
  compteAdminSchema,
  detailPilierSchema,
  detailSiteSchema,
  grilleDetailSchema,
  historiqueSiteSchema,
  PILIER_DE_SOUS_COMPOSANTE,
  scoreSiteSchema,
  SOUS_COMPOSANTES,
  SOUS_COMPOSANTES_DU_PILIER,
  syntheseNationaleSchema,
  syntheseRapportsSchema,
  tableauDeBordSchema,
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
  comptesBruts: [],
});

/** Les dix sous-composantes brèves dans l'ordre canonique. */
const sc10 = () =>
  SOUS_COMPOSANTES.map((sousComposante) => ({
    sousComposante,
    valeur: 100,
    seuil: 100,
    statut: 'CONFORME' as const,
    tauxAtteinte: 100,
  }));

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
  sousComposantes: sc10(),
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
    parSousComposante: SOUS_COMPOSANTES.map((sousComposante) => ({
      sousComposante,
      pilier: PILIER_DE_SOUS_COMPOSANTE[sousComposante],
      tauxAtteinteMoyen: 80,
      nbConforme: 3,
      nbAlerte: 1,
      nbNonCalculable: 1,
    })),
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

  it('rejette une ligne parSousComposante à comptes négatifs', () => {
    const s = synthese() as { parSousComposante: { nbConforme: number }[] };
    s.parSousComposante[0]!.nbConforme = -1;
    expect(() => validerReponse(syntheseNationaleSchema, s)).toThrow(/non conforme/i);
  });

  it('rejette un taux d\'atteinte parSousComposante hors de [0, 100]', () => {
    const s = synthese() as { parSousComposante: { tauxAtteinteMoyen: number }[] };
    s.parSousComposante[0]!.tauxAtteinteMoyen = 130;
    expect(() => validerReponse(syntheseNationaleSchema, s)).toThrow(/non conforme/i);
  });

  it('rejette une répartition avec une classe inconnue / manquante', () => {
    const bancale = synthese();
    bancale.national.repartition = { CONFORME: 1, PARTIELLEMENT_CONFORME: 2, NON_CONFORME: 1 } as never;
    expect(() => validerReponse(syntheseNationaleSchema, bancale)).toThrow(/non conforme/i);
  });

  const triplet = { attendu: 5, realise: 4, aLHeure: 3 };
  const syntheseRapports = (over: Record<string, unknown> = {}) => ({
    moisPaqd: '2026-08',
    moisDisponibles: ['2026-08'],
    programmeId: null,
    region: null,
    strates: [
      { strate: 'CS', requisitions: triplet, inventaires: triplet },
      { strate: 'Non classé', requisitions: { attendu: 1, realise: 0, aLHeure: 0 }, inventaires: triplet },
    ],
    total: {
      requisitions: { attendu: 6, realise: 4, aLHeure: 3 },
      inventaires: { attendu: 10, realise: 8, aLHeure: 6 },
    },
    ...over,
  });

  it('accepte une SyntheseRapports complète', () => {
    const r = validerReponse(syntheseRapportsSchema, syntheseRapports());
    expect(r.strates).toHaveLength(2);
    expect(r.total.inventaires.attendu).toBe(10);
  });

  it('rejette une SyntheseRapports à compte négatif', () => {
    const bancale = syntheseRapports() as { strates: { requisitions: { realise: number } }[] };
    bancale.strates[0]!.requisitions.realise = -1;
    expect(() => validerReponse(syntheseRapportsSchema, bancale)).toThrow(/non conforme/i);
  });

  it('rejette une SyntheseRapports à compte non entier', () => {
    expect(() =>
      validerReponse(
        syntheseRapportsSchema,
        syntheseRapports({
          total: {
            requisitions: { attendu: 6.5, realise: 4, aLHeure: 3 },
            inventaires: { attendu: 10, realise: 8, aLHeure: 6 },
          },
        }),
      ),
    ).toThrow(/non conforme/i);
  });

  const tableauDeBord = (over: Record<string, unknown> = {}) => ({
    moisPaqd: '2026-08',
    national: { nbSites: 40, nbMesures: 38, scoreCompositeMoyen: 71.4, repartition },
    progression: [
      { moisPaqd: '2026-07', scoreCompositeMoyen: 68 },
      { moisPaqd: '2026-08', scoreCompositeMoyen: 71.4 },
    ],
    sousComposantesEnDifficulte: SOUS_COMPOSANTES.slice(0, 5).map((sousComposante) => ({
      sousComposante,
      pilier: PILIER_DE_SOUS_COMPOSANTE[sousComposante],
      tauxAtteinteMoyen: 60,
      nbConforme: 20,
      nbAlerte: 18,
      nbNonCalculable: 2,
    })),
    ...over,
  });

  it('accepte un TableauDeBord complet', () => {
    const t = validerReponse(tableauDeBordSchema, tableauDeBord());
    expect(t.sousComposantesEnDifficulte).toHaveLength(5);
  });

  it('rejette un TableauDeBord à plus de cinq sous-composantes en difficulté', () => {
    expect(() =>
      validerReponse(
        tableauDeBordSchema,
        tableauDeBord({
          sousComposantesEnDifficulte: SOUS_COMPOSANTES.map((sousComposante) => ({
            sousComposante,
            pilier: PILIER_DE_SOUS_COMPOSANTE[sousComposante],
            tauxAtteinteMoyen: 60,
            nbConforme: 1,
            nbAlerte: 1,
            nbNonCalculable: 1,
          })),
        }),
      ),
    ).toThrow(/non conforme/i);
  });

  const point = (over: Record<string, unknown> = {}) => ({
    moisPaqd: '2026-08',
    rang: 4,
    scoreComposite: 82,
    classification: 'PARTIELLEMENT_CONFORME',
    piliersCouverts: 6,
    scoresPiliers: (['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as Pilier[]).map((pilier) => ({ pilier, score: 100 })),
    sousComposantes: sc10(),
    ...over,
  });
  const historique = (pointOver: Record<string, unknown> = {}) => ({
    site,
    programmeId: null,
    cyclePaqd: '2026-C2',
    cyclesDisponibles: ['2026-C2'],
    moisDisponibles: ['2026-08', '2026-05'],
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

  it('rejette un point qui ne porte pas les dix valeurs de sous-composante', () => {
    expect(() =>
      validerReponse(
        historiqueSiteSchema,
        historique({ sousComposantes: [{ sousComposante: 'regularite_saisie', valeur: 71, seuil: 65, statut: 'CONFORME' }] }),
      ),
    ).toThrow(/non conforme/i);
  });

  it('rejette dix sous-composantes dans le désordre', () => {
    const desordre = sc10().reverse();
    expect(() => validerReponse(historiqueSiteSchema, historique({ sousComposantes: desordre }))).toThrow(
      /non conforme/i,
    );
  });

  const consoEvaluable = {
    evaluable: true,
    stockDebut: 100,
    stockFin: 80,
    receptions: 10,
    declaree: 28,
    reconstituee: 30,
    ecartPct: 6.7,
    conforme: false,
  };
  const ligneP4P5 = (over: Record<string, unknown> = {}) => ({
    produitCode: 'T1',
    libelle: 'Traceur 1',
    sdu: { theorique: 100, comptee: 95, ecartPct: 5.3, conforme: false },
    consommation: consoEvaluable,
    concordance: { tauxPct: 95, conforme: true },
    ...over,
  });

  const detailPilierBase = {
    site,
    moisPaqd: '2026-08',
    moisDisponibles: ['2026-08'],
    programmeId: null,
    comptesBruts: [
      { mesure: 'p1_inventaires', libelle: 'inventaires', attendu: 2, realise: 1, aLHeure: null },
    ],
    calculeLe: '2026-09-01T00:00:00.000Z',
    coreMajLe: '2026-09-02T00:00:00.000Z',
    reimporteDepuisLeGel: true,
  };
  const detailPilierP1 = (over: Record<string, unknown> = {}) => ({
    ...detailPilierBase,
    code: 'p1',
    inventaires: [{ date: '2026-08-28', programme: 'VIH' }],
    requisitions: [{ programme: 'VIH', moisCouvert: '2026-08', dateSoumission: null }],
    receptions: [{ date: '2026-08-10', reference: 'GRN-1' }],
    factures: [{ date: '2026-08-05', reference: null }],
    programmesGeres: [{ programme: 'VIH', aInventaire: true, aRequisition: false }],
    ...over,
  });
  const detailPilierP2 = (over: Record<string, unknown> = {}) => ({
    ...detailPilierBase,
    code: 'p2',
    inventaires: [{ date: '2026-08-29', programme: 'VIH', dansLes3DerniersJours: true }],
    requisitions: [
      { programme: 'VIH', dateSoumission: '2026-08-31', dateLimite: '2026-09-05', aLHeure: true },
    ],
    ...over,
  });
  const detailPilierP3 = (over: Record<string, unknown> = {}) => ({
    ...detailPilierBase,
    code: 'p3',
    jours: [
      { jour: '2026-08-01', aSortie: false },
      { jour: '2026-08-02', aSortie: true },
    ],
    ...over,
  });
  const detailPilierP6 = (over: Record<string, unknown> = {}) => ({
    ...detailPilierBase,
    code: 'p6',
    ajustements: [{ date: '2026-08-03', produit: 'Paracétamol', quantite: -12, sens: 'negatif' }],
    nbMouvements: 4,
    ...over,
  });
  const detailPilierP4 = (over: Record<string, unknown> = {}) => ({
    ...detailPilierBase,
    code: 'p4',
    produits: [
      ligneP4P5(),
      ligneP4P5({
        produitCode: 'T2',
        consommation: { evaluable: false, raisonExclusion: 'un_seul_inventaire' },
        concordance: { tauxPct: null, conforme: false },
      }),
    ],
    ...over,
  });

  it('accepte un DetailPilier variante p1 et variante p2', () => {
    const p1 = validerReponse(detailPilierSchema, detailPilierP1());
    expect(p1.code).toBe('p1');
    if (p1.code === 'p1') expect(p1.programmesGeres[0]?.aRequisition).toBe(false);
    const p2 = validerReponse(detailPilierSchema, detailPilierP2());
    expect(p2.code).toBe('p2');
    if (p2.code === 'p2') expect(p2.requisitions[0]?.aLHeure).toBe(true);
  });

  it('accepte un DetailPilier variante p3 et variante p6', () => {
    const p3 = validerReponse(detailPilierSchema, detailPilierP3());
    expect(p3.code).toBe('p3');
    if (p3.code === 'p3') expect(p3.jours[1]?.aSortie).toBe(true);
    const p6 = validerReponse(detailPilierSchema, detailPilierP6());
    expect(p6.code).toBe('p6');
    if (p6.code === 'p6') expect(p6.nbMouvements).toBe(4);
  });

  it('accepte un DetailPilier variante p4 : tableau produit P4 · P5 (évaluable + exclu)', () => {
    const p4 = validerReponse(detailPilierSchema, detailPilierP4());
    expect(p4.code).toBe('p4');
    if (p4.code === 'p4') {
      expect(p4.produits).toHaveLength(2);
      expect(p4.produits[0]?.concordance.conforme).toBe(true);
      expect(p4.produits[1]?.consommation.evaluable).toBe(false);
    }
  });

  it('rejette une variante p3 dont un jour n\'a pas de drapeau aSortie', () => {
    expect(() =>
      validerReponse(detailPilierSchema, detailPilierP3({ jours: [{ jour: '2026-08-01' }] })),
    ).toThrow(/non conforme/i);
  });

  it('rejette une variante p4 dont une ligne produit n\'a pas de bloc concordance', () => {
    expect(() =>
      validerReponse(detailPilierSchema, detailPilierP4({ produits: [ligneP4P5({ concordance: undefined })] })),
    ).toThrow(/non conforme/i);
  });

  it('rejette une variante p6 dont le sens d\'ajustement est inconnu', () => {
    expect(() =>
      validerReponse(
        detailPilierSchema,
        detailPilierP6({ ajustements: [{ date: '2026-08-03', produit: 'X', quantite: 1, sens: 'haut' }] }),
      ),
    ).toThrow(/non conforme/i);
  });

  it('rejette un DetailPilier au code inconnu', () => {
    expect(() => validerReponse(detailPilierSchema, detailPilierP1({ code: 'p9' }))).toThrow(/non conforme/i);
  });

  it('rejette une variante p1 sans son tableau de factures', () => {
    expect(() => validerReponse(detailPilierSchema, detailPilierP1({ factures: undefined }))).toThrow(
      /non conforme/i,
    );
  });

  it('rejette une variante p2 dont un inventaire n\'a pas le drapeau des 3 derniers jours', () => {
    expect(() =>
      validerReponse(detailPilierSchema, detailPilierP2({ inventaires: [{ date: '2026-08-29', programme: 'VIH' }] })),
    ).toThrow(/non conforme/i);
  });

  const grille = (over: Record<string, unknown> = {}) => ({
    id: 1,
    version: 'v1',
    effetAPartirDe: '2026-01-01',
    creeLe: '2026-01-01T00:00:00.000Z',
    statut: 'en_vigueur',
    modifiable: false,
    poids: (['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as Pilier[]).map((pilier) => ({ pilier, poidsPct: 100 / 6 })),
    seuils: SOUS_COMPOSANTES.map((sc) => ({ sousComposante: sc, seuil: 90, sens: 'sup', tolerance: null })),
    ...over,
  });

  it('accepte une GrilleDetail complète', () => {
    const d = validerReponse(grilleDetailSchema, grille());
    expect(d.poids).toHaveLength(6);
  });

  it('rejette un statut de grille inconnu', () => {
    expect(() => validerReponse(grilleDetailSchema, grille({ statut: 'brouillon' }))).toThrow(/non conforme/i);
  });

  it('rejette un poids de pilier hors de [0, 100]', () => {
    const poids = grille().poids.map((p, i) => (i === 0 ? { ...p, poidsPct: 140 } : p));
    expect(() => validerReponse(grilleDetailSchema, grille({ poids }))).toThrow(/non conforme/i);
  });

  const comptes = (over: Record<string, unknown> = {}) => [
    { id: 'a', identifiant: 'admin', nom: 'Admin', role: 'admin', actif: true, creeLe: '2026-01-01T00:00:00.000Z', ...over },
    { id: 'b', identifiant: 'lecteur', nom: 'Lecteur', role: 'lecteur', actif: false, creeLe: '2026-01-01T00:00:00.000Z' },
  ];

  it('accepte une liste CompteAdmin[] et rejette un rôle inconnu', () => {
    const liste = z.array(compteAdminSchema);
    expect(validerReponse(liste, comptes())).toHaveLength(2);
    expect(() => validerReponse(liste, comptes({ role: 'super-admin' }))).toThrow(/non conforme/i);
  });
});
