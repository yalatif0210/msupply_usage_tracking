import { entreeGrilleSchema, LIBELLES_SOUS_COMPOSANTE, PILIERS, type EntreeGrille, type ReglesCalcul } from '@dqa/contracts';

/**
 * Erreurs de saisie d'une version de grille, en français et rattachées au
 * champ fautif. La validation est celle du contrat, la même que l'API
 * applique : l'écran ne laisse rien partir qu'elle refuserait.
 */

type EchecGrille = Extract<ReturnType<typeof entreeGrilleSchema.safeParse>, { success: false }>;
export type ProblemeGrille = EchecGrille['error']['issues'][number];

const LIBELLES_REGLE: Record<keyof ReglesCalcul, string> = {
  joursClotureFinMois: 'Clôture, derniers jours du mois',
  joursClotureMoisSuivant: 'Clôture, premiers jours du mois suivant',
  joursMargeJugement: 'Marge avant de juger un mois',
  noteSanction: 'Note de sanction',
  borneConforme: 'Borne conforme',
  bornePartiellementConforme: 'Borne partiellement conforme',
};

const CHAMPS_SEUIL: Record<string, string> = {
  seuil: 'seuil',
  tolerance: 'tolérance',
  seuilDistrict: 'seuil district',
  poidsDansPilierPct: 'poids dans le pilier',
};

const estCleRegle = (k: unknown): k is keyof ReglesCalcul => typeof k === 'string' && k in LIBELLES_REGLE;
const nombre = (v: number | bigint): string => String(v).replace('.', ',');

/** Le problème dit en français ; les messages propres au contrat (déjà en français) passent tels quels. */
export function messageProbleme(p: ProblemeGrille): string {
  switch (p.code) {
    case 'too_small':
      return p.inclusive ? `au moins ${nombre(p.minimum)}` : `strictement plus de ${nombre(p.minimum)}`;
    case 'too_big':
      return p.inclusive ? `au plus ${nombre(p.maximum)}` : `strictement moins de ${nombre(p.maximum)}`;
    case 'not_multiple_of':
      return `par pas de ${nombre(p.multipleOf)}`;
    case 'invalid_type':
      return 'valeur requise';
    case 'invalid_string':
      return 'format invalide';
    default:
      return p.message;
  }
}

/** Le champ fautif nommé pour l'écran : « Note de sanction : strictement moins de 100 ». */
export function erreursGrille(b: EntreeGrille): string[] {
  const r = entreeGrilleSchema.safeParse(b);
  if (r.success) return [];
  const messages = r.error.issues.map((p) => {
    const [tete, rang, cle] = p.path;
    const msg = messageProbleme(p);
    if (tete === 'version') return `Libellé : ${msg}`;
    if (tete === 'effetAPartirDe') return `Date d'effet : ${msg}`;
    if (tete === 'regles' && estCleRegle(rang)) return `${LIBELLES_REGLE[rang]} : ${msg}`;
    if (tete === 'poids' && typeof rang === 'number') return `Poids du pilier ${PILIERS[rang] ?? ''} : ${msg}`;
    if (tete === 'seuils' && typeof rang === 'number') {
      const sc = b.seuils[rang]?.sousComposante;
      const champ = typeof cle === 'string' ? (CHAMPS_SEUIL[cle] ?? cle) : '';
      return `${sc ? LIBELLES_SOUS_COMPOSANTE[sc] : `Ligne ${rang + 1}`}${champ ? `, ${champ}` : ''} : ${msg}`;
    }
    return msg;
  });
  return [...new Set(messages)];
}
