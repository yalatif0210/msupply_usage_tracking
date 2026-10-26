import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { suiviStocksSchema, type SuiviStocks, type SuiviStocksQuery } from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

@Injectable({ providedIn: 'root' })
export class StocksService {
  private readonly http = inject(HttpClient);

  /** Suivi des stocks à une date t ; filtres vides ignorés. */
  async suivi(q: SuiviStocksQuery): Promise<SuiviStocks> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) {
      if (typeof v === 'string' && v) params = params.set(k, v);
    }
    const data = await firstValueFrom(this.http.get<unknown>('/api/stocks', { params }));
    return validerReponse(suiviStocksSchema, data);
  }
}
