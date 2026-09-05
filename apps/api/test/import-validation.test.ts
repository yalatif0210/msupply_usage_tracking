import { describe, expect, it } from 'vitest';
import { lireClasseur } from '../src/import/lecture-classeur.js';
import { ValidationService } from '../src/import/validation.service.js';
import { construireClasseur, optionsValides } from './helpers/classeur.js';

const service = new ValidationService();
const ANCRE = new Date('2026-08-20T00:00:00Z');

function valider(mutation: (o: ReturnType<typeof optionsValides>) => void = () => {}) {
  const opts = optionsValides();
  mutation(opts);
  return service.valider(lireClasseur(construireClasseur(opts)), ANCRE);
}

const aCode = (r: ReturnType<typeof valider>, code: string) =>
  r.anomalies.some((a) => a.code === code);

describe('ValidationService — un cas passant et un cas échouant par règle', () => {
  it('classeur cohérent : aucun bloquant', () => {
    const r = valider();
    expect(r.bloquant).toBe(false);
    expect(r.contexte?.moisPaqd).toBe('2026-08');
  });

  // R1 — compteurs METADATA
  it('R1 passe quand le compteur correspond', () => {
    expect(aCode(valider(), 'COMPTEUR_METADATA')).toBe(false);
  });
  it('R1 échoue (bloquant) quand un compteur diffère', () => {
    const r = valider((o) => (o.metadata['nb_lignes_SITES'] = '9'));
    expect(aCode(r, 'COMPTEUR_METADATA')).toBe(true);
    expect(r.bloquant).toBe(true);
  });

  // R2 — onglet / colonne
  it('R2 passe quand tous les onglets et colonnes sont là', () => {
    const r = valider();
    expect(aCode(r, 'ONGLET_MANQUANT') || aCode(r, 'COLONNE_MANQUANTE')).toBe(false);
  });
  it('R2 échoue (bloquant) quand un onglet obligatoire manque', () => {
    const r = valider((o) => (o.omettreOnglets = ['REQUISITIONS']));
    expect(aCode(r, 'ONGLET_MANQUANT')).toBe(true);
    expect(r.bloquant).toBe(true);
  });
  it('R2 échoue (bloquant) quand une colonne est renommée', () => {
    const r = valider((o) => {
      const s = o.jeux.find((j) => j.nom === 'SITES')!;
      s.colonnes = s.colonnes.map((c) => (c === 'site_nom' ? 'nom_du_site' : c));
    });
    expect(aCode(r, 'COLONNE_MANQUANTE')).toBe(true);
    expect(r.bloquant).toBe(true);
  });

  // R3 — mois PAQD
  it('R3 passe pour un mois PAQD cohérent et récent', () => {
    expect(valider().bloquant).toBe(false);
  });
  it('R3 échoue (bloquant) quand mois_paqd est mal formé', () => {
    const r = valider((o) => (o.metadata['mois_paqd'] = 'aout'));
    expect(aCode(r, 'MOIS_PAQD_INVALIDE')).toBe(true);
    expect(r.bloquant).toBe(true);
  });
  it('R3 échoue (bloquant) quand le mois mesuré est dans le futur', () => {
    const r = valider((o) => {
      o.metadata['date_extraction'] = '2026-06-15';
      o.metadata['fenetre_debut'] = '2026-05-01';
      o.metadata['fenetre_fin'] = '2026-06-15';
    });
    expect(aCode(r, 'MOIS_PAQD_FUTUR')).toBe(true);
    expect(r.bloquant).toBe(true);
  });

  // R4 — bornes du mois
  it('R4 passe quand mois_debut/fin collent au cycle', () => {
    expect(aCode(valider(), 'BORNES_MOIS_INCOHERENTES')).toBe(false);
  });
  it('R4 échoue (bloquant) quand mois_debut ne colle pas', () => {
    const r = valider((o) => (o.metadata['mois_debut'] = '2026-07-01'));
    expect(aCode(r, 'BORNES_MOIS_INCOHERENTES')).toBe(true);
    expect(r.bloquant).toBe(true);
  });

  // R5 — références croisées
  it('R5 passe quand les références sont résolues', () => {
    expect(aCode(valider(), 'REFERENCE_CROISEE')).toBe(false);
  });
  it('R5 signale (avertissement) une référence manquante sans bloquer', () => {
    const r = valider((o) => {
      o.jeux.find((j) => j.nom === 'TRANSACTIONS')!.lignes[0]!['site_id'] = 'SITE-INCONNU';
    });
    expect(aCode(r, 'REFERENCE_CROISEE')).toBe(true);
    expect(r.bloquant).toBe(false);
  });

  // R6 — formats
  it('R6 passe pour des dates AAAA-MM-JJ', () => {
    expect(aCode(valider(), 'DATE_MAL_FORMEE')).toBe(false);
  });
  it('R6 signale (avertissement) une date mal formée sans bloquer', () => {
    const r = valider((o) => {
      o.jeux.find((j) => j.nom === 'TRANSACTIONS')!.lignes[0]!['date_saisie'] = '10/08/2026';
    });
    expect(aCode(r, 'DATE_MAL_FORMEE')).toBe(true);
    expect(r.bloquant).toBe(false);
  });
  it('R6 signale un nombre invalide et un booléen hors OUI/NON', () => {
    const r = valider((o) => {
      const l = o.jeux.find((j) => j.nom === 'LIGNES_TRANSACTIONS')!.lignes[0]!;
      l['quantite'] = 'beaucoup';
      l['issu_ajustement'] = 'peut-être';
    });
    expect(aCode(r, 'NOMBRE_INVALIDE')).toBe(true);
    expect(aCode(r, 'BOOLEEN_INVALIDE')).toBe(true);
    expect(r.bloquant).toBe(false);
  });

  // R7 — vocabulaire nature
  it('R7 passe pour une nature du vocabulaire', () => {
    expect(aCode(valider(), 'NATURE_INCONNUE')).toBe(false);
  });
  it('R7 signale (avertissement) une nature hors vocabulaire', () => {
    const r = valider((o) => {
      o.jeux.find((j) => j.nom === 'TRANSACTIONS')!.lignes[0]!['nature'] = 'bricolage';
    });
    expect(aCode(r, 'NATURE_INCONNUE')).toBe(true);
    expect(r.bloquant).toBe(false);
  });

  // R8 — mois couvert des réquisitions
  it('R8 passe quand mois_couvert_debut = mois PAQD', () => {
    expect(aCode(valider(), 'MOIS_COUVERT_INVALIDE')).toBe(false);
  });
  it('R8 passe pour un rattrapage : mois_couvert_debut jusqu\'à 2 mois avant le mois PAQD', () => {
    // mois PAQD = août 2026 ; une réquisition de juin est dans la fenêtre de 45 j
    const r = valider((o) => {
      o.jeux.find((j) => j.nom === 'REQUISITIONS')!.lignes[0]!['mois_couvert_debut'] = '2026-06-01';
    });
    expect(aCode(r, 'MOIS_COUVERT_INVALIDE')).toBe(false);
  });
  it('R8 passe pour un rattrapage à cheval sur deux cycles', () => {
    // extraction du 5 septembre, cycle C3, mois PAQD septembre ; une réquisition
    // d'août (cycle C2) reste légitime (fenêtre de 45 jours)
    const r = valider((o) => {
      o.metadata['date_extraction'] = '2026-09-05';
      o.metadata['cycle_paqd'] = '2026-C3';
      o.metadata['mois_paqd'] = 'M+1';
      o.metadata['mois_debut'] = '2026-09-01';
      o.metadata['mois_fin'] = '2026-09-30';
      o.jeux.find((j) => j.nom === 'REQUISITIONS')!.lignes[0]!['mois_couvert_debut'] = '2026-08-01';
    });
    expect(aCode(r, 'MOIS_COUVERT_INVALIDE')).toBe(false);
  });
  it('R8 signale (avertissement) un mois_couvert_debut plus de 2 mois avant le mois PAQD', () => {
    const r = valider((o) => {
      o.jeux.find((j) => j.nom === 'REQUISITIONS')!.lignes[0]!['mois_couvert_debut'] = '2026-01-01';
    });
    expect(aCode(r, 'MOIS_COUVERT_INVALIDE')).toBe(true);
    expect(r.bloquant).toBe(false);
  });
  it('R8 signale (avertissement) un mois_couvert_debut postérieur au mois PAQD', () => {
    const r = valider((o) => {
      o.jeux.find((j) => j.nom === 'REQUISITIONS')!.lignes[0]!['mois_couvert_debut'] = '2026-09-01';
    });
    expect(aCode(r, 'MOIS_COUVERT_INVALIDE')).toBe(true);
    expect(r.bloquant).toBe(false);
  });
  it('R8 signale (avertissement) un mois_couvert_debut mal formé sans bloquer', () => {
    const r = valider((o) => {
      o.jeux.find((j) => j.nom === 'REQUISITIONS')!.lignes[0]!['mois_couvert_debut'] = 'aout 2026';
    });
    expect(aCode(r, 'MOIS_COUVERT_INVALIDE')).toBe(true);
    expect(r.bloquant).toBe(false);
  });
});
