import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import {
  grilleDetailSchema,
  grilleParametreSchema,
  type EntreeGrille,
  type GrilleDetail,
  type GrilleParametre,
} from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

const listeGrilles = z.array(grilleParametreSchema);
const API = '/api/admin/grille';

@Injectable({ providedIn: 'root' })
export class AdminGrilleService {
  private readonly http = inject(HttpClient);

  async lister(): Promise<GrilleParametre[]> {
    return validerReponse(listeGrilles, await firstValueFrom(this.http.get<unknown>(API)));
  }

  async detail(id: number): Promise<GrilleDetail> {
    return validerReponse(grilleDetailSchema, await firstValueFrom(this.http.get<unknown>(`${API}/${id}`)));
  }

  async creer(entree: EntreeGrille): Promise<GrilleDetail> {
    return validerReponse(grilleDetailSchema, await firstValueFrom(this.http.post<unknown>(API, entree)));
  }

  async modifier(id: number, entree: EntreeGrille): Promise<GrilleDetail> {
    return validerReponse(grilleDetailSchema, await firstValueFrom(this.http.put<unknown>(`${API}/${id}`, entree)));
  }

  async supprimer(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${API}/${id}`));
  }
}
