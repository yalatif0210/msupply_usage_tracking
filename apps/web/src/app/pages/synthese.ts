import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LIBELLES_PILIER, type SyntheseNationale } from '@dqa/contracts';
import { SitesService } from '../core/sites.service';
import { SyntheseService } from '../core/synthese.service';
import { Entete } from '../ui/entete';
import { RepartitionClassificationComponent } from '../ui/repartition-classification';

@Component({
  selector: 'dqa-synthese',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe, Entete, RepartitionClassificationComponent],
  template: `
    <dqa-entete />
    <main>
      <h1>Synthèse nationale</h1>

      @if (synthese(); as s) {
        <div class="controles">
          @if (s.moisDisponibles.length > 1) {
            <label>
              Mois PAQD
              <select [(ngModel)]="mois" (ngModelChange)="recharger()">
                @for (m of s.moisDisponibles; track m) {
                  <option [value]="m">{{ m }}</option>
                }
              </select>
            </label>
          } @else {
            <span class="mois">Mois PAQD : {{ s.moisPaqd ?? '—' }}</span>
          }
          <label>
            Région
            <select [(ngModel)]="region" (ngModelChange)="recharger()">
              <option value="">Toutes</option>
              @for (r of regions(); track r) {
                <option [value]="r">{{ r }}</option>
              }
            </select>
          </label>
        </div>

        @if (s.moisPaqd === null || s.national.nbMesures === 0) {
          <p class="vide">
            Aucun site n'a encore de score composite pour ce mois. La synthèse
            s'alimentera au premier import traité.
          </p>
        } @else {
          <section class="national">
            <div class="score">
              <div class="chiffre">{{ s.national.scoreCompositeMoyen | number: '1.0-1' }}</div>
              <div class="sur">/ 100 — score composite moyen</div>
              <div class="couverture">
                calculé sur {{ s.national.nbMesures }} site{{ s.national.nbMesures > 1 ? 's' : '' }}
                sur {{ s.national.nbSites }}
              </div>
            </div>
            <div class="rep">
              <dqa-repartition-classification [repartition]="s.national.repartition" />
            </div>
          </section>

          <section class="piliers">
            <h2>Moyenne nationale par pilier</h2>
            @for (mp of s.national.moyennesPiliers; track mp.pilier) {
              <div class="pilier">
                <div class="lib">{{ mp.pilier }} — {{ libelle(mp.pilier) }}</div>
                <div class="jauge">
                  <span class="rempli" [style.width.%]="mp.moyenne ?? 0"></span>
                </div>
                <div class="val">{{ mp.moyenne === null ? '—' : (mp.moyenne | number: '1.0-1') }}</div>
              </div>
            }
          </section>

          <section class="districts">
            <h2>Par district</h2>
            <table>
              <thead>
                <tr>
                  <th>District</th>
                  <th class="num">Sites</th>
                  <th class="num">Mesurés</th>
                  <th class="num">Score moyen</th>
                  <th>Répartition</th>
                </tr>
              </thead>
              <tbody>
                @for (d of s.parDistrict; track d.district) {
                  <tr (click)="ouvrirDistrict(d.district)">
                    <td>{{ d.district }}</td>
                    <td class="num">{{ d.nbSites }}</td>
                    <td class="num">{{ d.nbMesures }}</td>
                    <td class="num">
                      {{ d.scoreCompositeMoyen === null ? '—' : (d.scoreCompositeMoyen | number: '1.0-1') }}
                    </td>
                    <td class="repcell">
                      <dqa-repartition-classification [repartition]="d.repartition" [compact]="true" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }
      } @else if (chargement()) {
        <p>Chargement…</p>
      } @else {
        <p class="vide">La synthèse est indisponible.</p>
      }
    </main>
  `,
  styles: `
    main { max-width: 72rem; margin: 0 auto; padding: 0 1rem; }
    h1 { font-size: 1.6rem; }
    h2 { font-size: 1.05rem; margin: 2rem 0 0.8rem; }
    .controles { display: flex; gap: 1.5rem; align-items: center; margin: 1rem 0 1.5rem; flex-wrap: wrap; }
    label { display: grid; gap: 0.3rem; font-size: 0.85rem; }
    select { padding: 0.4rem; }
    .mois { color: #5b5b5b; font-size: 0.9rem; }
    .national { display: flex; gap: 2rem; align-items: center; border: 1px solid #d9d9d6; background: #fff; padding: 1.4rem 1.6rem; flex-wrap: wrap; }
    .national .chiffre { font-size: 4rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
    .national .sur { color: #5b5b5b; margin-top: 0.2rem; }
    .national .couverture { color: #5b5b5b; font-size: 0.85rem; margin-top: 0.3rem; }
    .national .rep { flex: 1; min-width: 16rem; }
    .pilier { display: grid; grid-template-columns: 18rem 1fr 3rem; gap: 0.8rem; align-items: center; padding: 0.3rem 0; }
    .pilier .lib { font-size: 0.9rem; }
    .pilier .jauge { height: 0.8rem; background: #ececec; border: 1px solid #d9d9d6; }
    .pilier .rempli { display: block; height: 100%; background: #1f3d7a; }
    .pilier .val { text-align: right; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid #d9d9d6; }
    th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody tr { cursor: pointer; }
    tbody tr:hover { background: #f0f2f6; }
    .repcell { width: 12rem; }
    .vide { color: #5b5b5b; }
  `,
})
export class SynthesePage {
  private readonly service = inject(SyntheseService);
  private readonly sites = inject(SitesService);
  private readonly router = inject(Router);

  protected mois = '';
  protected region = '';
  protected readonly synthese = signal<SyntheseNationale | null>(null);
  protected readonly regions = signal<string[]>([]);
  protected readonly chargement = signal(true);

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    this.regions.set(await this.sites.regions());
    await this.recharger();
  }

  protected async recharger(): Promise<void> {
    this.chargement.set(true);
    try {
      const s = await this.service.synthese({
        mois: this.mois || undefined,
        region: this.region || undefined,
      });
      this.mois = s.moisPaqd ?? '';
      this.synthese.set(s);
    } catch {
      this.synthese.set(null);
    }
    this.chargement.set(false);
  }

  protected libelle(pilier: SyntheseNationale['national']['moyennesPiliers'][number]['pilier']): string {
    return LIBELLES_PILIER[pilier];
  }

  protected ouvrirDistrict(district: string): void {
    void this.router.navigate(['/'], { queryParams: { district } });
  }
}
