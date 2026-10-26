import { describe, expect, it } from 'vitest';
import type { LigneStock } from '@dqa/contracts';
import { dateFr, duree, grouperParSite, PROGRAMME_NON_RENSEIGNE, raisonNonCalculable } from './arbre-stocks';

function ligne(siteId: string, programmeId: string | null, produitCode: string, rupture: string | null): LigneStock {
  return {
    siteId, siteNom: siteId, region: 'NORD', district: 'D1',
    programmeId, programmeNom: programmeId,
    produitId: produitCode, produitCode, libelle: produitCode,
    dateFin: '2026-09-29', stockFin: 50, receptionsApresFin: 0,
    cmm: {
      calculable: true, dateDebut: '2026-06-30', stockDebut: 100, jours: 91, nbMois: 3,
      receptions: 40, sortiesReconstituees: 90, declaree: 45, cmmReconstituee: 30.1, cmmDeclaree: 15,
      stockProjete: 49.1, dateRupture: rupture, couvertureJours: 50,
    },
  };
}

describe('arborescence du suivi des stocks', () => {
  it('site, puis programme, puis produit, dans l\'ordre reçu', () => {
    const sites = grouperParSite([
      ligne('S1', 'VIH', 'A', null), ligne('S1', 'VIH', 'B', '2026-11-29'),
      ligne('S1', null, 'C', '2026-11-01'), ligne('S2', 'PALU', 'A', null),
    ]);
    expect(sites.map((s) => s.siteId)).toEqual(['S1', 'S2']);
    expect(sites[0]?.programmes.map((p) => p.programmeNom)).toEqual(['VIH', PROGRAMME_NON_RENSEIGNE]);
    expect(sites[0]?.programmes[0]?.produits.map((p) => p.produitCode)).toEqual(['A', 'B']);
  });

  it('résumé d\'un site : nombre de produits, de ruptures et la plus proche', () => {
    const [s1] = grouperParSite([ligne('S1', 'VIH', 'A', '2026-12-01'), ligne('S1', 'VIH', 'B', '2026-11-29'), ligne('S1', 'VIH', 'C', null)]);
    expect(s1).toMatchObject({ nbProduits: 3, nbEnRupture: 0, nbRuptures: 2, premiereRupture: '2026-11-29' });
  });

  it('un stock déjà à 0 est « en rupture », pas une rupture à venir', () => {
    const vide = ligne('S1', 'VIH', 'A', '2026-10-22');
    if (vide.cmm.calculable) vide.cmm.stockProjete = 0;
    const [s1] = grouperParSite([vide, ligne('S1', 'VIH', 'B', '2026-11-29')]);
    expect(s1).toMatchObject({ nbEnRupture: 1, nbRuptures: 1, premiereRupture: '2026-11-29' });
  });

  it('mise en forme : date, durée de la CMM, raison', () => {
    expect(dateFr('2026-09-29')).toBe('29/09/2026');
    expect(duree(91, 3)).toBe('sur 3 mois');
    expect(duree(12, 0)).toBe('sur 12 jours');
    expect(raisonNonCalculable('un_seul_inventaire')).toBe('non calculable : un seul inventaire dans les 90 jours');
  });
});
