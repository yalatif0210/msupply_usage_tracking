import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AnomalieImport, LotImport } from '@dqa/contracts';

@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly http = inject(HttpClient);

  listerLots(): Promise<LotImport[]> {
    return firstValueFrom(this.http.get<LotImport[]>('/api/imports'));
  }

  anomalies(lotId: number): Promise<AnomalieImport[]> {
    return firstValueFrom(this.http.get<AnomalieImport[]>(`/api/imports/${lotId}/anomalies`));
  }
}
