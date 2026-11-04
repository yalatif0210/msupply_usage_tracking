import { describe, expect, it } from 'vitest';
import type { LigneStock, StatutStock } from '@dqa/contracts';
import {
  compteStatut, couplesASignaler, dateFr, duree, ecartPhoto, grouper, grouperParSite, PROGRAMME_NON_RENSEIGNE, raisonNonCalculable,
} from './arbre-stocks';

function ligne(
  siteId: string, programmeId: string | null, produitCode: string,
  statut: StatutStock = 'sans_risque', rupture: string | null = null, couverture = 50,
): LigneStock {
  return {
    siteId, siteNom: siteId, region: 'NORD', district: 'D1',
    programmeId, programmeNom: programmeId,
    produitId: produitCode, produitCode, libelle: produitCode,
    dateFin: '2026-09-29', stockFin: 50, receptionsApresFin: 0,
    cmm: {
      calculable: true, dateDebut: '2026-06-30', stockDebut: 100, jours: 91, nbMois: 3,
      receptions: 40, sortiesReconstituees: 90, declaree: 45, cmmReconstituee: 30.1, cmmDeclaree: 15,
      stockProjete: 49.1, dateRupture: rupture, couvertureJours: couverture,
    },
    statut,
    photo: null,
  };
}

describe('arborescence du suivi des stocks', () => {
  it('site, puis programme, puis produit, dans l\'ordre reçu', () => {
    const sites = grouperParSite([
      ligne('S1', 'VIH', 'A'), ligne('S1', 'VIH', 'B'), ligne('S1', null, 'C'), ligne('S2', 'PALU', 'A'),
    ]);
    expect(sites.map((s) => s.cle)).toEqual(['S1', 'S2']);
    expect(sites[0]?.sousTitre).toBe('D1 · NORD');
    expect(sites[0]?.sousGroupes.map((p) => p.titre)).toEqual(['VIH', PROGRAMME_NON_RENSEIGNE]);
    expect(sites[0]?.sousGroupes[0]?.produits.map((p) => p.produitCode)).toEqual(['A', 'B']);
  });

  it('lecture par programme : programmes par ordre alphabétique, non renseigné en dernier, puis sites', () => {
    const progs = grouper([
      ligne('S1', 'VIH', 'A', 'en_rupture', '2026-10-22', 0), ligne('S1', null, 'C'),
      ligne('S2', 'PALU', 'A'), ligne('S2', 'VIH', 'B'),
    ], 'programme');
    expect(progs.map((p) => p.titre)).toEqual(['PALU', 'VIH', PROGRAMME_NON_RENSEIGNE]);
    expect(progs[1]?.sousGroupes.map((s) => s.titre)).toEqual(['S1', 'S2']);
    expect(progs[1]?.parStatut.en_rupture).toBe(1);
  });

  it('résumé d\'un site : comptes par statut et prochaine rupture à venir', () => {
    const [s1] = grouperParSite([
      ligne('S1', 'VIH', 'A', 'en_rupture', '2026-10-22', 0),
      ligne('S1', 'VIH', 'B', 'rupture_signalee', '2026-11-01', 10),
      ligne('S1', 'VIH', 'C', 'a_surveiller', '2026-12-01', 40),
      ligne('S1', 'VIH', 'D'),
    ]);
    expect(s1?.parStatut).toMatchObject({ en_rupture: 1, rupture_signalee: 1, a_surveiller: 1, sans_risque: 1 });
    expect(s1?.premiereRupture).toBe('2026-11-01'); // le produit déjà à 0 n'est pas une rupture à venir
  });

  it('encadré : en rupture et signalés par couverture croissante, à surveiller à part', () => {
    const { urgents, aSurveiller } = couplesASignaler([
      ligne('S1', 'VIH', 'B', 'rupture_signalee', '2026-11-01', 10),
      ligne('S2', 'VIH', 'A', 'en_rupture', '2026-10-22', 0),
      ligne('S1', 'VIH', 'C', 'a_surveiller', '2026-12-01', 40),
      ligne('S1', 'VIH', 'D'),
    ]);
    expect(urgents.map((l) => l.produitCode)).toEqual(['A', 'B']);
    expect(aSurveiller.map((l) => l.produitCode)).toEqual(['C']);
  });

  it('écart à la photo mSupply : signé, vide sans projection', () => {
    expect(ecartPhoto(804, 990)).toBe('-186');
    expect(ecartPhoto(51.1, 50)).toBe('+1,1');
    expect(ecartPhoto(null, 3)).toBe('');
  });

  it('mise en forme : date, durée de la CMM, raison', () => {
    expect(dateFr('2026-09-29')).toBe('29/09/2026');
    expect(duree(91, 3)).toBe('sur 3 mois');
    expect(duree(12, 0)).toBe('sur 12 jours');
    expect(raisonNonCalculable('un_seul_inventaire')).toBe('non calculable : un seul inventaire dans les 90 jours');
  });
});

describe('compte d\'un statut', () => {
  it('accorde le libellé au nombre', () => {
    expect(compteStatut('rupture_signalee', 1)).toBe('1 rupture signalée');
    expect(compteStatut('rupture_signalee', 2)).toBe('2 ruptures signalées');
    expect(compteStatut('en_rupture', 3)).toBe('3 en rupture');
  });
});
