import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  strateStructureSchema,
  vueStratesSchema,
  type EntreeStrate,
  type StrateStructure,
  type VueStrates,
} from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

const API = '/api/admin/strates';

@Injectable({ providedIn: 'root' })
export class AdminStratesService {
  private readonly http = inject(HttpClient);

  async etat(): Promise<VueStrates> {
    return validerReponse(vueStratesSchema, await firstValueFrom(this.http.get<unknown>(API)));
  }

  async enregistrer(typeStructure: string, entree: EntreeStrate): Promise<StrateStructure> {
    return validerReponse(
      strateStructureSchema,
      await firstValueFrom(
        this.http.put<unknown>(`${API}/${encodeURIComponent(typeStructure)}`, entree),
      ),
    );
  }

  async supprimer(typeStructure: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${API}/${encodeURIComponent(typeStructure)}`));
  }
}
