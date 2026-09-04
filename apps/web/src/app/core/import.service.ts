import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { resultatImportSchema, type AnomalieImport, type LotImport, type ResultatImport } from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly http = inject(HttpClient);

  listerLots(): Promise<LotImport[]> {
    return firstValueFrom(this.http.get<LotImport[]>('/api/imports'));
  }

  anomalies(lotId: number): Promise<AnomalieImport[]> {
    return firstValueFrom(this.http.get<AnomalieImport[]>(`/api/imports/${lotId}/anomalies`));
  }

  /** Dépose le classeur d'extraction (rôle coordination). Le corps est un
   *  `multipart/form-data` avec le champ `fichier`. */
  async deposer(fichier: File): Promise<ResultatImport> {
    const corps = new FormData();
    corps.append('fichier', fichier);
    const data = await firstValueFrom(this.http.post<unknown>('/api/imports', corps));
    return validerReponse(resultatImportSchema, data);
  }
}
