import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import { produitTraceurSchema, type ProduitTraceur } from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

const liste = z.array(produitTraceurSchema);
const API = '/api/admin/traceurs';

@Injectable({ providedIn: 'root' })
export class TraceursService {
  private readonly http = inject(HttpClient);

  async lister(): Promise<ProduitTraceur[]> {
    return validerReponse(liste, await firstValueFrom(this.http.get<unknown>(API)));
  }
}
