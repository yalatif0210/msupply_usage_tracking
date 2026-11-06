import { describe, expect, it } from 'vitest';
import type { MesureSousComposante, ScorePilier } from '@dqa/contracts';
import { formuleComposite, formulePilier } from './formule-score';

function sc(over: Partial<MesureSousComposante>): MesureSousComposante {
  return {
    sousComposante: 'completude_requisitions', libelle: 'Complétude des réquisitions', valeur: 100, unite: 'pct',
    seuil: 100, statut: 'CONFORME', raison: null, retenue: true, poidsDansPilierPct: 50, note: 100, sanction: false,
    ...over,
  };
}

function pilier(over: Partial<ScorePilier>): ScorePilier {
  return {
    pilier: 'P1', libelle: 'Complétude des transactions', poids: 10, score: 50,
    sousComposantes: [], poidsCalculables: 100, comptesBruts: [], ...over,
  };
}

describe('formulePilier', () => {
  it('écrit la moyenne pondérée des notes comptées', () => {
    const p = pilier({
      sousComposantes: [
        sc({}),
        sc({ sousComposante: 'completude_receptions', libelle: 'Complétude des réceptions', note: 0, statut: 'ALERTE' }),
      ],
    });
    expect(formulePilier(p)).toEqual({ calcul: '(100 × 50 + 0 × 50) ÷ 100', horsCalcul: [] });
  });

  it('nomme une sous-composante retenue non calculable et la retire du diviseur', () => {
    const p = pilier({
      score: 100,
      poidsCalculables: 50,
      sousComposantes: [
        sc({}),
        sc({ sousComposante: 'completude_receptions', libelle: 'Complétude des réceptions', note: null, statut: 'NON_CALCULABLE' }),
      ],
    });
    expect(formulePilier(p)).toEqual({
      calcul: 'note « Complétude des réquisitions »',
      horsCalcul: ['Complétude des réceptions, non calculable ce mois, sort du calcul.'],
    });
  });

  it('une seule sous-composante retenue : sa note, sanction signalée ; une non retenue est ignorée', () => {
    const p = pilier({
      pilier: 'P4', libelle: 'Taux de conformité', score: 0,
      sousComposantes: [
        sc({ sousComposante: 'ecart_sdu', libelle: 'Conformité SDU', retenue: false, poidsDansPilierPct: 0, note: 0 }),
        sc({
          sousComposante: 'ecart_consommation', libelle: 'Conformité consommation',
          poidsDansPilierPct: 100, note: 0, sanction: true, statut: 'ALERTE',
        }),
      ],
    });
    expect(formulePilier(p)).toEqual({ calcul: 'note « Conformité consommation » (sanction)', horsCalcul: [] });
  });

  it('poids décimaux au format français', () => {
    const p = pilier({
      score: 33.3,
      sousComposantes: [sc({ poidsDansPilierPct: 33.33 }), sc({ sousComposante: 'completude_receptions', libelle: 'R', poidsDansPilierPct: 66.67, note: 0 })],
    });
    expect(formulePilier(p)?.calcul).toBe('(100 × 33,33 + 0 × 66,67) ÷ 100');
  });

  it('aucune sous-composante calculable : pas de formule', () => {
    expect(formulePilier(pilier({ score: null, sousComposantes: [sc({ note: null })] }))).toBeNull();
  });
});

describe('formuleComposite', () => {
  it('écrit la moyenne des scores pondérée par le poids des piliers calculables', () => {
    const piliers = [
      pilier({ pilier: 'P1', poids: 10, score: 100 }),
      pilier({ pilier: 'P2', libelle: 'Promptitude', poids: 15, score: null }),
      pilier({ pilier: 'P5', libelle: 'Concordance', poids: 25, score: 0 }),
    ];
    expect(formuleComposite(piliers, 35)).toEqual({
      calcul: '(100 × 10 + 0 × 25) ÷ 35',
      horsCalcul: ['P2 · Promptitude (poids 15 %), non calculable ce mois, sort du calcul.'],
    });
  });

  it('un seul pilier calculable : son score', () => {
    expect(formuleComposite([pilier({ pilier: 'P6', libelle: "Ratio d'ajustements", score: 100 })], 10)?.calcul)
      .toBe("score de P6 · Ratio d'ajustements");
  });

  it('aucun pilier calculable : pas de formule', () => {
    expect(formuleComposite([pilier({ score: null })], 0)).toBeNull();
  });
});
