import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { methodeCalculSchema, type MethodeCalcul } from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

@Injectable({ providedIn: 'root' })
export class MethodeCalculService {
  private readonly http = inject(HttpClient);

  /** Grille d'un mois (absent : dernier mois mesuré) décrite pour les écrans de lecture. */
  async methode(mois: string | null): Promise<MethodeCalcul> {
    const params = mois ? new HttpParams().set('mois', mois) : undefined;
    const data = await firstValueFrom(this.http.get<unknown>('/api/methode-calcul', { params }));
    return validerReponse(methodeCalculSchema, data);
  }
}
