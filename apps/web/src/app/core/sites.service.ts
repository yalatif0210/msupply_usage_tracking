import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import {
  detailP4ProduitsSchema,
  detailPilierSchema,
  detailSiteSchema,
  historiqueSiteSchema,
  programmeSchema,
  scoreSiteSchema,
  type DetailP4Produits,
  type DetailPilier,
  type DetailSite,
  type HistoriqueSite,
  type Programme,
  type ScoreSite,
} from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

const scoreSiteListe = z.array(scoreSiteSchema);
const programmeListe = z.array(programmeSchema);
/** Référentiels servis en simple liste de chaînes (districts, régions). */
const listeChaines = z.array(z.string());

export interface FiltresSites {
  district?: string;
  region?: string;
  programmeId?: string;
}

@Injectable({ providedIn: 'root' })
export class SitesService {
  private readonly http = inject(HttpClient);

  async listerSites(filtres: FiltresSites = {}): Promise<ScoreSite[]> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtres)) {
      if (v) params = params.set(k, v);
    }
    const data = await firstValueFrom(this.http.get<unknown>('/api/sites', { params }));
    return validerReponse(scoreSiteListe, data);
  }

  async detailSite(
    siteId: string,
    opts: { mois?: string; programmeId?: string } = {},
  ): Promise<DetailSite> {
    let params = new HttpParams();
    if (opts.mois) params = params.set('mois', opts.mois);
    if (opts.programmeId) params = params.set('programmeId', opts.programmeId);
    const data = await firstValueFrom(
      this.http.get<unknown>(`/api/sites/${encodeURIComponent(siteId)}`, { params }),
    );
    return validerReponse(detailSiteSchema, data);
  }

  async historique(
    siteId: string,
    opts: { cycle?: string; de?: string; a?: string; programmeId?: string } = {},
  ): Promise<HistoriqueSite> {
    let params = new HttpParams();
    if (opts.cycle) params = params.set('cycle', opts.cycle);
    if (opts.de) params = params.set('de', opts.de);
    if (opts.a) params = params.set('a', opts.a);
    if (opts.programmeId) params = params.set('programmeId', opts.programmeId);
    const data = await firstValueFrom(
      this.http.get<unknown>(`/api/sites/${encodeURIComponent(siteId)}/historique`, { params }),
    );
    return validerReponse(historiqueSiteSchema, data);
  }

  async p4Produits(
    siteId: string,
    opts: { mois?: string; programmeId?: string } = {},
  ): Promise<DetailP4Produits> {
    let params = new HttpParams();
    if (opts.mois) params = params.set('mois', opts.mois);
    if (opts.programmeId) params = params.set('programmeId', opts.programmeId);
    const data = await firstValueFrom(
      this.http.get<unknown>(`/api/sites/${encodeURIComponent(siteId)}/piliers/p4`, { params }),
    );
    return validerReponse(detailP4ProduitsSchema, data);
  }

  /**
   * Détail ligne à ligne d'un pilier, chargé à la demande au dépli de la carte.
   * `code` en minuscules (`p1`..`p6`) ; seuls `p1` / `p2` sont servis à ce jour.
   */
  async detailPilier(
    siteId: string,
    code: DetailPilier['code'],
    opts: { mois?: string; programmeId?: string } = {},
  ): Promise<DetailPilier> {
    let params = new HttpParams();
    if (opts.mois) params = params.set('mois', opts.mois);
    if (opts.programmeId) params = params.set('programmeId', opts.programmeId);
    const data = await firstValueFrom(
      this.http.get<unknown>(
        `/api/sites/${encodeURIComponent(siteId)}/piliers/${code}`,
        { params },
      ),
    );
    return validerReponse(detailPilierSchema, data);
  }

  async programmes(): Promise<Programme[]> {
    const data = await firstValueFrom(this.http.get<unknown>('/api/referentiel/programmes'));
    return validerReponse(programmeListe, data);
  }

  async districts(): Promise<string[]> {
    const data = await firstValueFrom(this.http.get<unknown>('/api/referentiel/districts'));
    return validerReponse(listeChaines, data);
  }

  async regions(): Promise<string[]> {
    const data = await firstValueFrom(this.http.get<unknown>('/api/referentiel/regions'));
    return validerReponse(listeChaines, data);
  }
}
