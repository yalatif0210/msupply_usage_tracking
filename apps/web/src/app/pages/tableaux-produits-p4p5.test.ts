import { describe, expect, it } from 'vitest';
import type { LigneProduitP4P5 } from '@dqa/contracts';
import {
  bornesDe, calculAbsence, dateCommune, ecartConso, ecartSdu, jourMoisCourt, libelleLots, LIBELLES_QUALIFICATION,
} from './tableaux-produits-p4p5';

const bornes = {
  dateDebut: '2026-08-30', dateFin: '2026-09-29',
  stockDebut: 99, stockFin: 89, receptions: 0, declaree: 7, reconstituee: 10,
};

function ligne(consommation: LigneProduitP4P5['consommation']): LigneProduitP4P5 {
  return {
    produitId: 'P', produitCode: 'C', libelle: 'L', article: null,
    dateInventaire: '2026-09-29', lots: [],
    sdu: { theorique: 92, comptee: 89, ecartPct: 3.4, conforme: false },
    consommation,
    concordance: { tauxPct: 96.7, conforme: false },
  };
}

describe('tableaux produit P4 · P5', () => {
  it('date courte des en-têtes : « 30/8 »', () => {
    expect(jourMoisCourt('2026-08-30')).toBe('30/8');
    expect(jourMoisCourt('2026-10-01')).toBe('1/10');
  });

  it('date commune seulement si toutes les dates connues sont égales', () => {
    expect(dateCommune(['2026-08-30', null, '2026-08-30'])).toBe('2026-08-30');
    expect(dateCommune(['2026-08-30', '2026-08-29'])).toBeNull();
    expect(dateCommune([null])).toBeNull();
  });

  it('lots détaillés théorique / compté, rien pour un seul lot', () => {
    expect(libelleLots([{ lot: 'A', theorique: 9, comptee: 0 }, { lot: 'B', theorique: 20, comptee: 15 }]))
      .toBe('lots 9/0 et 20/15');
    expect(libelleLots([{ lot: 'A', theorique: 9, comptee: 0 }])).toBe('');
  });

  it('écart SDU non chiffrable quand le compté est nul', () => {
    expect(ecartSdu(37.5)).toBe('37,5 %');
    expect(ecartSdu(null)).toBe('non chiffrable (compté = 0)');
  });

  it('consommation : écart si évaluée, raison si exclue ; bornes lisibles même exclue', () => {
    const evaluee = ligne({ evaluable: true, ...bornes, ecartPct: 30, conforme: false });
    expect(ecartConso(evaluee)).toBe('30 %');
    expect(bornesDe(evaluee)?.reconstituee).toBe(10);
    const nulle = ligne({ evaluable: false, raisonExclusion: 'reconstituee_non_positive', bornes: { ...bornes, reconstituee: 0 } });
    expect(ecartConso(nulle)).toBe('non conforme (reconstituée ≤ 0)');
    expect(bornesDe(nulle)?.stockDebut).toBe(99);
    const sansBorne = ligne({ evaluable: false, raisonExclusion: 'sans_ouverture', bornes: null });
    expect(ecartConso(sansBorne)).toBe("exclu (pas d'inventaire d'ouverture)");
    expect(bornesDe(sansBorne)).toBeNull();
  });

  it("absence d'un inventaire : le calcul qui la qualifie", () => {
    const base = {
      produitCode: 'T1', libelle: 'T1', dateOuverture: '2026-08-31', dateCloture: '2026-09-30',
      stockConnu: 3927, receptions: 0, sortiesDeclarees: 5000, stockCalcule: 8927,
    };
    expect(calculAbsence({ ...base, sens: 'absent_ouverture', qualification: 'oubli_demontre' }))
      .toBe("3 927 comptés à la clôture + 5 000 sorties déclarées - 0 reçus = 8 927 au moins à l'ouverture");
    expect(calculAbsence({ ...base, sens: 'absent_cloture', qualification: 'epuise', stockConnu: 10, receptions: 0, sortiesDeclarees: 12, stockCalcule: -2 }))
      .toBe("10 comptés à l'ouverture + 0 reçus - 12 sorties déclarées = -2 attendus à la clôture");
    expect(LIBELLES_QUALIFICATION.oubli_probable).toBe('oubli probable');
  });
});
