import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import {
  compteAdminSchema,
  type CompteAdmin,
  type EntreeCompte,
  type MajCompte,
} from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

const liste = z.array(compteAdminSchema);
const API = '/api/admin/comptes';

@Injectable({ providedIn: 'root' })
export class AdminComptesService {
  private readonly http = inject(HttpClient);

  async lister(): Promise<CompteAdmin[]> {
    return validerReponse(liste, await firstValueFrom(this.http.get<unknown>(API)));
  }

  async creer(entree: EntreeCompte): Promise<CompteAdmin> {
    return validerReponse(compteAdminSchema, await firstValueFrom(this.http.post<unknown>(API, entree)));
  }

  async modifier(id: string, maj: MajCompte): Promise<CompteAdmin> {
    return validerReponse(
      compteAdminSchema,
      await firstValueFrom(this.http.put<unknown>(`${API}/${encodeURIComponent(id)}`, maj)),
    );
  }

  async reinitialiserMotDePasse(id: string, motDePasse: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${API}/${encodeURIComponent(id)}/mot-de-passe`, { motDePasse }),
    );
  }
}
