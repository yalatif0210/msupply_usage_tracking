import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  programmeSiteSchema,
  programmesDuSiteSchema,
  resultatDesactivationSchema,
  vueProgrammesSitesSchema,
  type ProgrammeSite,
  type ProgrammesDuSite,
  type RequeteProgrammesSites,
  type ResultatDesactivation,
  type VueProgrammesSites,
} from '@dqa/contracts';
import { validerReponse } from './valider-reponse';

const API = '/api/admin/programmes-sites';

@Injectable({ providedIn: 'root' })
export class AdminProgrammesService {
  private readonly http = inject(HttpClient);

  /** Une page de sites résumés, filtrée côté serveur. */
  async etat(requete: RequeteProgrammesSites): Promise<VueProgrammesSites> {
    let params = new HttpParams();
    for (const [cle, valeur] of Object.entries(requete)) {
      if (valeur !== undefined && valeur !== '') params = params.set(cle, String(valeur));
    }
    return validerReponse(vueProgrammesSitesSchema, await firstValueFrom(this.http.get<unknown>(API, { params })));
  }

  async programmesDuSite(siteId: string): Promise<ProgrammesDuSite> {
    return validerReponse(
      programmesDuSiteSchema,
      await firstValueFrom(this.http.get<unknown>(`${API}/${encodeURIComponent(siteId)}`)),
    );
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

  async desactiverSansActivite(siteId: string): Promise<ResultatDesactivation> {
    return validerReponse(
      resultatDesactivationSchema,
      await firstValueFrom(
        this.http.post<unknown>(`${API}/${encodeURIComponent(siteId)}/desactiver-sans-activite`, {}),
      ),
    );
  }

  async recalculer(): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/recalcul`, {}));
  }
}
