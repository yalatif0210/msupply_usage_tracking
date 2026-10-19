import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  programmeSiteSchema,
  vueProgrammesSitesSchema,
  type ProgrammeSite,
  type VueProgrammesSites,
} from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

const API = '/api/admin/programmes-sites';

@Injectable({ providedIn: 'root' })
export class AdminProgrammesService {
  private readonly http = inject(HttpClient);

  async etat(): Promise<VueProgrammesSites> {
    return validerReponse(vueProgrammesSitesSchema, await firstValueFrom(this.http.get<unknown>(API)));
  }

  async modifier(siteId: string, programmeId: string, actif: boolean): Promise<ProgrammeSite> {
    return validerReponse(
      programmeSiteSchema,
      await firstValueFrom(
        this.http.put<unknown>(
          `${API}/${encodeURIComponent(siteId)}/${encodeURIComponent(programmeId)}`,
          { actif },
        ),
      ),
    );
  }

  async recalculer(): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/recalcul`, {}));
  }
}
