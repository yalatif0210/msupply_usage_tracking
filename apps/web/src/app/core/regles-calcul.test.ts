import { describe, expect, it } from 'vitest';
import { bornesClassification, fenetreCloture, margeJugement, seuilLisible } from './regles-calcul';

describe('fenetreCloture', () => {
  it('accorde le pluriel de la fin de mois et du mois suivant', () => {
    expect(fenetreCloture({ joursClotureFinMois: 3, joursClotureMoisSuivant: 1 }))
      .toBe('les 3 derniers jours du mois ou le 1er jour du mois suivant');
    expect(fenetreCloture({ joursClotureFinMois: 1, joursClotureMoisSuivant: 2 }))
      .toBe('le dernier jour du mois ou les 2 premiers jours du mois suivant');
  });

  it('omet le mois suivant quand la grille ne lui laisse aucun jour', () => {
    expect(fenetreCloture({ joursClotureFinMois: 3, joursClotureMoisSuivant: 0 })).toBe('les 3 derniers jours du mois');
  });
});

describe('margeJugement', () => {
  it('formule la marge, au singulier comme au pluriel', () => {
    expect(margeJugement({ joursMargeJugement: 3 })).toBe('plus 3 jours de marge');
    expect(margeJugement({ joursMargeJugement: 1 })).toBe('plus 1 jour de marge');
  });

  it('dit « sans marge » à 0', () => {
    expect(margeJugement({ joursMargeJugement: 0 })).toBe('sans marge');
  });
});

describe('seuilLisible', () => {
  it('écrit le comparateur selon le sens du seuil', () => {
    expect(seuilLisible({ sens: 'sup', seuil: 65 })).toBe('≥ 65 %');
    expect(seuilLisible({ sens: 'inf', seuil: 5.5 })).toBe('≤ 5,5 %');
  });
});

describe('bornesClassification', () => {
  it('rend les bornes de la grille dans l’ordre croissant', () => {
    expect(bornesClassification({ borneConforme: 85, bornePartiellementConforme: 70 })).toEqual([70, 85]);
  });
});
