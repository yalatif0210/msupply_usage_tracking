import type { LigneStock } from '@dqa/contracts';

/**
 * Arborescence du suivi des stocks : site, puis programme, puis produit. Les
 * lignes arrivent de l'API déjà triées dans cet ordre ; on ne fait que les
 * regrouper, sans recalcul.
 */
export interface ProgrammeStocks {
  cle: string;
  programmeNom: string;
  produits: LigneStock[];
}

export interface SiteStocks {
  siteId: string;
  siteNom: string;
  region: string | null;
  district: string | null;
  programmes: ProgrammeStocks[];
  nbProduits: number;
  /** Produits dont le stock projeté est déjà à 0 à la date choisie. */
  nbEnRupture: number;
  /** Produits encore en stock dont une rupture est prévue dans l'horizon de projection. */
  nbRuptures: number;
  /** Rupture à venir la plus proche du site, pour le résumé replié. */
  premiereRupture: string | null;
}

/** Stock projeté à 0 à la date choisie : la rupture n'est pas à venir, elle est probable dès maintenant. */
export const enRupture = (l: LigneStock): boolean => l.cmm.calculable && l.cmm.stockProjete === 0;

export const PROGRAMME_NON_RENSEIGNE = 'Programme non renseigné';

export function grouperParSite(lignes: readonly LigneStock[]): SiteStocks[] {
  const sites = new Map<string, SiteStocks>();
  for (const l of lignes) {
    let site = sites.get(l.siteId);
    if (!site) {
      site = {
        siteId: l.siteId, siteNom: l.siteNom, region: l.region, district: l.district,
        programmes: [], nbProduits: 0, nbEnRupture: 0, nbRuptures: 0, premiereRupture: null,
      };
      sites.set(l.siteId, site);
    }
    const cle = l.programmeId ?? '';
    let prog = site.programmes.find((p) => p.cle === cle);
    if (!prog) {
      prog = { cle, programmeNom: l.programmeNom ?? PROGRAMME_NON_RENSEIGNE, produits: [] };
      site.programmes.push(prog);
    }
    prog.produits.push(l);
    site.nbProduits += 1;
    const rupture = l.cmm.calculable ? l.cmm.dateRupture : null;
    if (enRupture(l)) site.nbEnRupture += 1;
    else if (rupture !== null) {
      site.nbRuptures += 1;
      if (site.premiereRupture === null || rupture < site.premiereRupture) site.premiereRupture = rupture;
    }
  }
  return [...sites.values()];
}

/** `AAAA-MM-JJ` vers `JJ/MM/AAAA`. */
export const dateFr = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export const nombre = (v: number): string => NOMBRE.format(v);

/** « sur 2 mois » ; moins d'un mois arrondi affiché en jours. */
export function duree(jours: number, nbMois: number): string {
  return nbMois >= 1 ? `sur ${nbMois} mois` : `sur ${jours} jours`;
}

const RAISONS: Record<'un_seul_inventaire' | 'sorties_non_positives', string> = {
  un_seul_inventaire: 'un seul inventaire dans les 90 jours',
  sorties_non_positives: 'sorties reconstituées nulles ou négatives',
};
export const raisonNonCalculable = (r: keyof typeof RAISONS): string => `non calculable : ${RAISONS[r]}`;
