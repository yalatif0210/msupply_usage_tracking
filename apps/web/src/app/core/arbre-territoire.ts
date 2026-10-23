import type { NiveauTerritoire } from '@dqa/contracts';
import { SANS_OBJET } from './affichage';

/** Le minimum d'une ligne de lecture par territoire pour la placer dans l'arbre. */
export interface LigneArbre {
  niveau: NiveauTerritoire;
  region: string;
  district: string | null;
}

/** Clé d'une zone de district : unique même si deux régions ont un district homonyme. */
export const cleZone = (l: Pick<LigneArbre, 'region' | 'district'>): string => `${l.region}|${l.district ?? ''}`;

/**
 * Lignes affichées : toutes les régions, et les zones des seules régions
 * dépliées. L'ordre reçu de l'API (régions triées, chacune suivie de ses
 * zones triées) est conservé.
 */
export function lignesVisibles<T extends LigneArbre>(lignes: readonly T[], regionsOuvertes: ReadonlySet<string>): T[] {
  return lignes.filter((l) => l.niveau === 'region' || regionsOuvertes.has(l.region));
}

const POURCENT_FR = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Taux au format français ; « s/o » quand rien n'était attendu. */
export function taux(valeur: number | null): string {
  return valeur === null ? SANS_OBJET : `${POURCENT_FR.format(valeur)} %`;
}

/** `AAAA-MM-JJ` vers `JJ/MM`, pour « échéance le JJ/MM ». */
export const jourMois = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
