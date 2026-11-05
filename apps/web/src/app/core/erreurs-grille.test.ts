import { describe, expect, it } from 'vitest';
import {
  PILIER_DE_SOUS_COMPOSANTE, PILIERS, SOUS_COMPOSANTES, SOUS_COMPOSANTES_AVEC_TOLERANCE,
  type EntreeGrille, type SousComposante,
} from '@dqa/contracts';
import { erreursGrille } from './erreurs-grille';

const POIDS = { P1: 10, P2: 15, P3: 15, P4: 25, P5: 25, P6: 10 } as const;
const AVEC_TOLERANCE = new Set<string>(SOUS_COMPOSANTES_AVEC_TOLERANCE);

/** Une grille valide : chaque pilier retient ses sous-composantes à parts égales (P1 et P2 : 50 / 50). */
function grille(): EntreeGrille {
  const nbDuPilier = (sc: SousComposante) =>
    SOUS_COMPOSANTES.filter((x) => PILIER_DE_SOUS_COMPOSANTE[x] === PILIER_DE_SOUS_COMPOSANTE[sc]).length;
  return {
    version: 'v3',
    effetAPartirDe: '2027-01-01',
    poids: PILIERS.map((pilier) => ({ pilier, poidsPct: POIDS[pilier] })),
    seuils: SOUS_COMPOSANTES.map((sc) => ({
      sousComposante: sc,
      seuil: 90,
      sens: 'sup' as const,
      tolerance: AVEC_TOLERANCE.has(sc) ? 2 : null,
      seuilDistrict: sc === 'regularite_saisie' ? 80 : null,
      retenue: true,
      poidsDansPilierPct: 100 / nbDuPilier(sc),
    })),
    regles: {
      joursClotureFinMois: 3, joursClotureMoisSuivant: 1, joursMargeJugement: 3,
      noteSanction: 0, borneConforme: 90, bornePartiellementConforme: 75,
    },
  };
}

describe('erreursGrille', () => {
  it('ne signale rien sur une grille valide', () => {
    expect(erreursGrille(grille())).toEqual([]);
  });

  it('nomme la règle fautive, en français : une note de sanction de 100 est refusée', () => {
    const g = grille();
    expect(erreursGrille({ ...g, regles: { ...g.regles, noteSanction: 100 } }))
      .toEqual(['Note de sanction : strictement moins de 100']);
  });

  it('borne la marge de jugement à 15 jours', () => {
    const g = grille();
    expect(erreursGrille({ ...g, regles: { ...g.regles, joursMargeJugement: 16 } }))
      .toEqual(['Marge avant de juger un mois : au plus 15']);
  });

  it('refuse plus d’une décimale sur une borne de classification', () => {
    const g = grille();
    expect(erreursGrille({ ...g, regles: { ...g.regles, borneConforme: 90.05 } }))
      .toEqual(['Borne conforme : par pas de 0,1']);
  });

  it('reprend le message du contrat quand la somme des poids ne fait pas 100', () => {
    const g = grille();
    const poids = g.poids.map((p, i) => (i === 0 ? { ...p, poidsPct: 20 } : p));
    expect(erreursGrille({ ...g, poids })).toEqual(['La somme des poids doit faire 100']);
  });

  it('rattache une erreur de seuil à sa sous-composante', () => {
    const g = grille();
    const seuils = g.seuils.map((s, i) => (i === 0 ? { ...s, seuil: 100.005 } : s));
    const [erreur] = erreursGrille({ ...g, seuils });
    expect(erreur).toMatch(/^Complétude.*, seuil : par pas de 0,01$/);
  });
});
