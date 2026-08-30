import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import {
  detailSiteSchema,
  programmeSchema,
  scoreSiteSchema,
  type DetailSite,
  type Programme,
  type ScoreSite,
} from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

const scoreSiteListe = z.array(scoreSiteSchema);
const programmeListe = z.array(programmeSchema);
const districtListe = z.array(z.string());

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

  async programmes(): Promise<Programme[]> {
    const data = await firstValueFrom(this.http.get<unknown>('/api/referentiel/programmes'));
    return validerReponse(programmeListe, data);
  }

  async districts(): Promise<string[]> {
    const data = await firstValueFrom(this.http.get<unknown>('/api/referentiel/districts'));
    return validerReponse(districtListe, data);
  }
}
