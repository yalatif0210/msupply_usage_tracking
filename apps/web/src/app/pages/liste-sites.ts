import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Programme, ScoreSite } from '@dqa/contracts';
import { SitesService } from '../core/sites.service';
import { BadgeClassification } from '../ui/badge-classification';
import { Entete } from '../ui/entete';

@Component({
  selector: 'dqa-liste-sites',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Entete, BadgeClassification, DecimalPipe],
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
              <th class="num">Score composite</th>
              <th>Classification</th>
            </tr>
          </thead>
          <tbody>
            @for (s of sites(); track s.site.siteId) {
              <tr>
                <td><a [routerLink]="['/sites', s.site.siteId]">{{ s.site.siteNom }}</a></td>
                <td>{{ s.site.district ?? '—' }}</td>
                <td>{{ s.moisPaqd ?? '—' }}</td>
                <td class="num">
                  {{ s.scoreComposite === null ? '—' : (s.scoreComposite | number: '1.0-1') }}
                </td>
                <td>
                  @if (s.moisPaqd) {
                    <dqa-badge-classification [classification]="s.classification" />
                    @if (s.piliersCouverts < 6) {
                      <span class="couverture" title="Score composite renormalisé sur une couverture partielle">
                        {{ s.piliersCouverts }}/6 piliers
                      </span>
                    }
                  } @else {
                    <span class="vide">Aucune mesure</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <p class="note">Sites triés du score le plus faible au plus élevé ; sites sans mesure en fin de liste.</p>
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
    th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.num { font-size: 1.1rem; font-weight: 600; }
    .note { color: #5b5b5b; font-size: 0.85rem; }
    .vide { color: #5b5b5b; }
    .couverture { display: inline-block; margin-left: 0.5rem; padding: 0.1rem 0.4rem; background: #edf0f5; color: #4a4a4a; font-size: 0.75rem; }
  `,
})
export class ListeSitesPage {
  private readonly service = inject(SitesService);
  private readonly route = inject(ActivatedRoute);

  protected district = this.route.snapshot.queryParamMap.get('district') ?? '';
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
}
