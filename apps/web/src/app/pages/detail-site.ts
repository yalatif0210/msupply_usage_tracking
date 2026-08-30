import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { DetailSite, Programme } from '@dqa/contracts';
import { SitesService } from '../core/sites.service';
import { BadgeStatut } from '../ui/badge-statut';
import { Entete } from '../ui/entete';

@Component({
  selector: 'dqa-detail-site',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Entete, BadgeStatut, DecimalPipe],
  template: `
    <dqa-entete />
    <main>
      <a routerLink="/" class="retour">← Tous les sites</a>

      @if (chargement()) {
        <p>Chargement…</p>
      } @else if (detail(); as d) {
        <h1>{{ d.site.siteNom }}</h1>
        <p class="meta">
          {{ d.site.district ?? '—' }} · {{ d.site.region ?? '—' }} ·
          {{ d.site.typeStructure ?? '—' }}
        </p>

        <div class="controles">
          <label>
            Programme
            <select [(ngModel)]="programmeId" (ngModelChange)="recharger()">
              <option value="">Tous programmes</option>
              @for (p of programmes(); track p.programmeId) {
                <option [value]="p.programmeId">{{ p.programmeNom }}</option>
              }
            </select>
          </label>
          @if (d.moisDisponibles.length > 1) {
            <label>
              Mois PAQD
              <select [(ngModel)]="mois" (ngModelChange)="recharger()">
                @for (m of d.moisDisponibles; track m) {
                  <option [value]="m">{{ m }}</option>
                }
              </select>
            </label>
          } @else {
            <span class="mois">Mois PAQD : {{ d.moisPaqd ?? '—' }}</span>
          }
          <span class="couverture">{{ d.piliersCouverts }} piliers sur {{ d.piliersTotal }}</span>
        </div>

        @if (d.piliers.length === 0) {
          <p class="vide">
            Aucune mesure pour ce site. Le premier import contenant ce site alimentera l'écran.
          </p>
        } @else {
          <div class="cartes">
            @for (pil of d.piliers; track pil.pilier) {
              <article class="carte">
                <h2>{{ pil.pilier }} — {{ pil.libelle }}</h2>
                @for (sc of pil.sousComposantes; track sc.sousComposante) {
                  <div class="mesure">
                    <dqa-badge-statut [statut]="sc.statut" />
                    <div>
                      <div class="valeur">
                        {{ sc.valeur === null ? '—' : (sc.valeur | number: '1.0-1') }}
                        <span class="unite">%</span>
                      </div>
                      <div class="seuil">
                        seuil {{ sc.seuil === null ? '—' : (sc.seuil | number: '1.0-1') }} %
                      </div>
                      @if (sc.raison) {
                        <div class="raison">{{ sc.raison }}</div>
                      }
                    </div>
                  </div>
                }
              </article>
            }
          </div>
        }
      } @else {
        <p class="vide">Site inconnu ou hors périmètre.</p>
      }
    </main>
  `,
  styles: `
    main { max-width: 60rem; margin: 0 auto; padding: 0 1rem; }
    .retour { color: #1f3d7a; font-size: 0.9rem; }
    h1 { font-size: 1.8rem; margin: 0.5rem 0 0; }
    .meta { color: #5b5b5b; margin-top: 0.25rem; }
    .controles { display: flex; gap: 1.5rem; align-items: center; margin: 1.5rem 0; flex-wrap: wrap; }
    label { display: grid; gap: 0.3rem; font-size: 0.85rem; }
    select { padding: 0.4rem; }
    .couverture { background: #edf0f5; padding: 0.2rem 0.6rem; font-size: 0.8rem; }
    .mois { color: #5b5b5b; font-size: 0.9rem; }
    .cartes { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); }
    .carte { border: 1px solid #d9d9d6; background: #fff; padding: 1.2rem; }
    .carte h2 { font-size: 1rem; margin: 0 0 1rem; }
    .mesure { display: flex; gap: 1rem; align-items: flex-start; }
    .valeur { font-size: 2.4rem; font-variant-numeric: tabular-nums; line-height: 1; }
    .unite { font-size: 1rem; color: #5b5b5b; }
    .seuil { color: #5b5b5b; font-size: 0.85rem; margin-top: 0.3rem; }
    .raison { color: #8a1c13; font-size: 0.85rem; margin-top: 0.3rem; }
    .vide { color: #5b5b5b; }
  `,
})
export class DetailSitePage {
  readonly id = input.required<string>();

  private readonly service = inject(SitesService);

  protected programmeId = '';
  protected mois = '';
  protected readonly detail = signal<DetailSite | null>(null);
  protected readonly programmes = signal<Programme[]>([]);
  protected readonly chargement = signal(true);

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    this.programmes.set(await this.service.programmes());
    await this.recharger();
  }

  protected async recharger(): Promise<void> {
    this.chargement.set(true);
    try {
      const d = await this.service.detailSite(this.id(), {
        programmeId: this.programmeId || undefined,
        mois: this.mois || undefined,
      });
      this.mois = d.moisPaqd ?? '';
      this.detail.set(d);
    } catch {
      this.detail.set(null);
    }
    this.chargement.set(false);
  }
}
