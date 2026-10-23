import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import {
  ligneTerritoireRapportsSchema,
  ligneTerritoireScoresSchema,
  syntheseNationaleSchema,
  syntheseRapportsSchema,
  syntheseTerritoireRapportsSchema,
  syntheseTerritoireScoresSchema,
  tableauDeBordSchema,
  type LigneTerritoireRapports,
  type LigneTerritoireScores,
  type SyntheseNationale,
  type SyntheseRapports,
  type SyntheseTerritoireRapports,
  type SyntheseTerritoireScores,
  type TableauDeBord,
} from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

export interface OptionsSynthese {
  mois?: string;
  programmeId?: string;
  region?: string;
}

/** Lectures par territoire : les filtres de la synthèse, plus la strate. */
export interface OptionsTerritoire extends OptionsSynthese {
  strate?: string;
}

/** Sites d'une zone de district, chargés au dépli. */
export interface OptionsSitesTerritoire extends OptionsTerritoire {
  mois: string;
  region: string;
  district: string;
}

const parametres = (opts: object): HttpParams => {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(opts)) {
    if (typeof v === 'string' && v) params = params.set(k, v);
  }
  return params;
};

@Injectable({ providedIn: 'root' })
export class SyntheseService {
  private readonly http = inject(HttpClient);

  async synthese(opts: OptionsSynthese = {}): Promise<SyntheseNationale> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(opts)) {
      if (v) params = params.set(k, v);
    }
    const data = await firstValueFrom(this.http.get<unknown>('/api/synthese', { params }));
    return validerReponse(syntheseNationaleSchema, data);
  }

  async syntheseRapports(opts: OptionsSynthese = {}): Promise<SyntheseRapports> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(opts)) {
      if (v) params = params.set(k, v);
    }
    const data = await firstValueFrom(
      this.http.get<unknown>('/api/synthese/rapports', { params }),
    );
    return validerReponse(syntheseRapportsSchema, data);
  }

  async tableauDeBord(mois?: string): Promise<TableauDeBord> {
    const params = mois ? new HttpParams().set('mois', mois) : undefined;
    const data = await firstValueFrom(this.http.get<unknown>('/api/tableau-de-bord', { params }));
    return validerReponse(tableauDeBordSchema, data);
  }

  async territoireRapports(opts: OptionsTerritoire): Promise<SyntheseTerritoireRapports> {
    const data = await firstValueFrom(
      this.http.get<unknown>('/api/synthese/territoire/rapports', { params: parametres(opts) }),
    );
    return validerReponse(syntheseTerritoireRapportsSchema, data);
  }

  async sitesRapports(opts: OptionsSitesTerritoire): Promise<LigneTerritoireRapports[]> {
    const data = await firstValueFrom(
      this.http.get<unknown>('/api/synthese/territoire/rapports/sites', { params: parametres(opts) }),
    );
    return validerReponse(z.array(ligneTerritoireRapportsSchema), data);
  }

  async territoireScores(opts: OptionsTerritoire): Promise<SyntheseTerritoireScores> {
    const data = await firstValueFrom(
      this.http.get<unknown>('/api/synthese/territoire/scores', { params: parametres(opts) }),
    );
    return validerReponse(syntheseTerritoireScoresSchema, data);
  }

  async sitesScores(opts: OptionsSitesTerritoire): Promise<LigneTerritoireScores[]> {
    const data = await firstValueFrom(
      this.http.get<unknown>('/api/synthese/territoire/scores/sites', { params: parametres(opts) }),
    );
    return validerReponse(z.array(ligneTerritoireScoresSchema), data);
  }

  /** Strates présentes dans le périmètre (filtre des lectures par territoire). */
  async strates(): Promise<string[]> {
    const data = await firstValueFrom(this.http.get<unknown>('/api/synthese/territoire/strates'));
    return validerReponse(z.array(z.string()), data);
  }
}
