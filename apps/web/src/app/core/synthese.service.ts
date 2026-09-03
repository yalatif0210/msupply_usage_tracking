import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  syntheseNationaleSchema,
  syntheseRapportsSchema,
  tableauDeBordSchema,
  type SyntheseNationale,
  type SyntheseRapports,
  type TableauDeBord,
} from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

export interface OptionsSynthese {
  mois?: string;
  programmeId?: string;
  region?: string;
}

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

  async tableauDeBord(): Promise<TableauDeBord> {
    const data = await firstValueFrom(this.http.get<unknown>('/api/tableau-de-bord'));
    return validerReponse(tableauDeBordSchema, data);
  }
}
