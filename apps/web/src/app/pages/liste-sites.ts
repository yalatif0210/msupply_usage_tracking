import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Programme, ScoreSite } from '@dqa/contracts';
import { SitesService } from '../core/sites.service';
import { Entete } from '../ui/entete';

@Component({
  selector: 'dqa-liste-sites',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Entete],
  template: `
    <dqa-entete />
    <main>
      <h1>Sites du périmètre DQA</h1>

      <div class="filtres">
        <label>
          District
          <select [(ngModel)]="district" (ngModelChange)="recharger()">
            <option value="">Tous</option>
            @for (d of districts(); track d) {
              <option [value]="d">{{ d }}</option>
            }
          </select>
        </label>
        <label>
          Programme
          <select [(ngModel)]="programmeId" (ngModelChange)="recharger()">
            <option value="">Tous</option>
            @for (p of programmes(); track p.programmeId) {
              <option [value]="p.programmeId">{{ p.programmeNom }}</option>
            }
          </select>
        </label>
      </div>

      @if (chargement()) {
        <p>Chargement…</p>
      } @else if (sites().length === 0) {
        <p class="vide">Aucun site ne correspond, ou aucun import n'a encore été traité.</p>
      } @else {
        <table>
          <thead>
            <tr>
              <th>Site</th>
              <th>District</th>
              <th>Mois</th>
              <th>P5 — Concordance</th>
              <th>P6 — Ratio d'ajustements</th>
            </tr>
          </thead>
          <tbody>
            @for (s of sites(); track s.site.siteId) {
              <tr>
                <td><a [routerLink]="['/sites', s.site.siteId]">{{ s.site.siteNom }}</a></td>
                <td>{{ s.site.district ?? '—' }}</td>
                <td>{{ s.moisPaqd ?? '—' }}</td>
                <td [class]="classe(pilier(s, 'P5'))">{{ affiche(pilier(s, 'P5')) }}</td>
                <td [class]="classe(pilier(s, 'P6'))">{{ affiche(pilier(s, 'P6')) }}</td>
              </tr>
            }
          </tbody>
        </table>
        <p class="note">Couverture partielle : 2 piliers sur 6.</p>
      }
    </main>
  `,
  styles: `
    main { max-width: 72rem; margin: 0 auto; padding: 0 1rem; }
    h1 { font-size: 1.6rem; }
    .filtres { display: flex; gap: 1.5rem; margin: 1rem 0; }
    label { display: grid; gap: 0.3rem; font-size: 0.85rem; }
    select { padding: 0.4rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid #d9d9d6; }
    td.CONFORME { color: #1b5e20; font-weight: 600; }
    td.ALERTE { color: #8a1c13; font-weight: 600; }
    td.NON_CALCULABLE { color: #999; }
    .note { color: #5b5b5b; font-size: 0.85rem; }
  `,
})
export class ListeSitesPage {
  private readonly service = inject(SitesService);

  protected district = '';
  protected programmeId = '';
  protected readonly sites = signal<ScoreSite[]>([]);
  protected readonly districts = signal<string[]>([]);
  protected readonly programmes = signal<Programme[]>([]);
  protected readonly chargement = signal(true);

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    const [d, p] = await Promise.all([this.service.districts(), this.service.programmes()]);
    this.districts.set(d);
    this.programmes.set(p);
    await this.recharger();
  }

  protected async recharger(): Promise<void> {
    this.chargement.set(true);
    this.sites.set(
      await this.service.listerSites({
        district: this.district || undefined,
        programmeId: this.programmeId || undefined,
      }),
    );
    this.chargement.set(false);
  }

  protected pilier(s: ScoreSite, code: 'P5' | 'P6'): number | null {
    return s.scoresPiliers.find((x) => x.pilier === code)?.score ?? null;
  }

  protected affiche(score: number | null): string {
    if (score === null) return 'Non calculable';
    return score >= 100 ? 'Conforme' : 'Alerte';
  }

  protected classe(score: number | null): string {
    if (score === null) return 'NON_CALCULABLE';
    return score >= 100 ? 'CONFORME' : 'ALERTE';
  }
}
