import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import { produitTraceurSchema, type EntreeProduitTraceur, type ProduitTraceur } from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

const liste = z.array(produitTraceurSchema);
const API = '/api/admin/traceurs';

@Injectable({ providedIn: 'root' })
export class TraceursService {
  private readonly http = inject(HttpClient);

  async lister(): Promise<ProduitTraceur[]> {
    return validerReponse(liste, await firstValueFrom(this.http.get<unknown>(API)));
  }

  async enregistrer(e: EntreeProduitTraceur): Promise<ProduitTraceur> {
    const { produitCode, ...corps } = e;
    return validerReponse(
      produitTraceurSchema,
      await firstValueFrom(this.http.put<unknown>(`${API}/${encodeURIComponent(produitCode)}`, corps)),
    );
  }

  async supprimer(produitCode: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${API}/${encodeURIComponent(produitCode)}`));
  }
}
