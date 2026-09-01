import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  LIBELLES_PILIER,
  LIBELLES_SOUS_COMPOSANTE,
  type LigneSousComposanteSynthese,
  type Pilier,
  type Programme,
  type SousComposante,
  type SyntheseNationale,
} from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { SitesService } from '../core/sites.service';
import { SyntheseService } from '../core/synthese.service';
import { Coquille } from '../ui/coquille';
import { RepartitionClassificationComponent } from '../ui/repartition-classification';

@Component({
  selector: 'dqa-synthese',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DecimalPipe, Coquille, RepartitionClassificationComponent],
  template: `
    <dqa-coquille />
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
            <span class="mois">Mois PAQD : {{ s.moisPaqd ?? absent }}</span>
          }
          <label>
            Programme
            <select [(ngModel)]="programmeId" (ngModelChange)="recharger()">
              <option value="">Tous programmes</option>
              @for (p of programmes(); track p.programmeId) {
                <option [value]="p.programmeId">{{ p.programmeNom }}</option>
              }
            </select>
          </label>
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

        @if (s.programmeId) {
          <p class="filtre-actif">
            National, piliers et districts filtrés sur le programme sélectionné.
          </p>
        }

        @if (s.moisPaqd === null) {
          <p class="vide">
            Aucun mois n'a encore de score. La synthèse s'alimentera au premier
            import traité.
          </p>
        } @else if (s.national.nbMesures === 0) {
          <p class="vide">
            Aucun site n'a de score composite pour ce mois
            {{ s.programmeId || s.region ? 'avec ce filtre' : '' }}.
          </p>
        } @else {
          <nav class="onglets" aria-label="Vue de la synthèse">
            <button type="button" [class.actif]="onglet() === 'pilier'" (click)="onglet.set('pilier')">
              Par pilier
            </button>
            <button type="button" [class.actif]="onglet() === 'sousComposante'" (click)="onglet.set('sousComposante')">
              Sous-composantes
            </button>
          </nav>

          @if (onglet() === 'sousComposante') {
            <table class="sous-composantes">
              <thead>
                <tr>
                  <th (click)="trier('libelle')">Sous-composante</th>
                  <th (click)="trier('pilier')">Pilier</th>
                  <th class="num" (click)="trier('tauxAtteinteMoyen')">Taux d'atteinte moyen</th>
                  <th class="num" (click)="trier('nbConforme')">Conformes</th>
                  <th class="num" (click)="trier('nbAlerte')">Alertes</th>
                  <th class="num" (click)="trier('nbNonCalculable')">Non calculables</th>
                </tr>
              </thead>
              <tbody>
                @for (sc of sousComposantesTriees(s); track sc.sousComposante) {
                  <tr>
                    <td>{{ libelleSc(sc.sousComposante) }}</td>
                    <td>{{ sc.pilier }}</td>
                    <td class="num">
                      {{ sc.tauxAtteinteMoyen === null ? absent : (sc.tauxAtteinteMoyen | number: '1.0-1') }}
                    </td>
                    <td class="num">{{ sc.nbConforme }}</td>
                    <td class="num">{{ sc.nbAlerte }}</td>
                    <td class="num">{{ sc.nbNonCalculable }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
          <section class="national">
            <div class="score">
              <div class="chiffre">{{ s.national.scoreCompositeMoyen | number: '1.0-1' }}</div>
              <div class="sur">/ 100 · score composite moyen</div>
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
                <div class="lib">{{ mp.pilier }} · {{ libelle(mp.pilier) }}</div>
                <div class="jauge">
                  <span class="rempli" [style.width.%]="mp.moyenne ?? 0"></span>
                </div>
                <div class="val">{{ mp.moyenne === null ? absent : (mp.moyenne | number: '1.0-1') }}</div>
              </div>
            }
          </section>

          <section class="districts">
            <h2>Par district</h2>
            @if (s.parDistrict.length === 0) {
              <p class="vide">Aucun district ne correspond à ce filtre.</p>
            } @else {
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
                        {{ d.scoreCompositeMoyen === null ? absent : (d.scoreCompositeMoyen | number: '1.0-1') }}
                      </td>
                      <td class="repcell">
                        <dqa-repartition-classification [repartition]="d.repartition" [compact]="true" />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </section>

          <section class="programmes">
            <h2>Scores par programme</h2>
            @if (s.parProgramme.length === 0) {
              <p class="vide">Aucun programme ne correspond à ce filtre.</p>
            } @else {
              <table>
                <thead>
                  <tr>
                    <th>Programme</th>
                    <th class="num">Sites gérant</th>
                    <th class="num">Mesurés</th>
                    <th class="num">Score national</th>
                    <th>Répartition</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of s.parProgramme; track p.programmeId) {
                    <tr>
                      <td>{{ p.programmeNom }}</td>
                      <td class="num">{{ p.nbSites }}</td>
                      <td class="num">{{ p.nbMesures }}</td>
                      <td class="num">
                        {{ p.scoreCompositeMoyen === null ? absent : (p.scoreCompositeMoyen | number: '1.0-1') }}
                      </td>
                      <td class="repcell">
                        <dqa-repartition-classification [repartition]="p.repartition" [compact]="true" />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </section>
          }
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
    .mois { color: var(--texte-doux); font-size: 0.9rem; }
    .filtre-actif { color: var(--texte-doux); font-size: 0.85rem; margin: -0.5rem 0 1rem; }
    .national { display: flex; gap: 2rem; align-items: center; border: 1px solid var(--bordure); background: var(--surface); padding: 1.4rem 1.6rem; flex-wrap: wrap; }
    .national .chiffre { font-size: 4rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
    .national .sur { color: var(--texte-doux); margin-top: 0.2rem; }
    .national .couverture { color: var(--texte-doux); font-size: 0.85rem; margin-top: 0.3rem; }
    .national .rep { flex: 1; min-width: 16rem; }
    .pilier { display: grid; grid-template-columns: 18rem 1fr 3rem; gap: 0.8rem; align-items: center; padding: 0.3rem 0; }
    .pilier .lib { font-size: 0.9rem; }
    .pilier .jauge { height: 0.8rem; background: var(--neutre); border: 1px solid var(--bordure); }
    .pilier .rempli { display: block; height: 100%; background: var(--accent); }
    .pilier .val { text-align: right; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid var(--bordure); }
    th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .districts tbody tr { cursor: pointer; }
    .districts tbody tr:hover { background: var(--accent-doux); }
    .repcell { width: 16rem; }
    .vide { color: var(--texte-doux); }
    .onglets { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--bordure); margin: 0.5rem 0 1.5rem; }
    .onglets button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 0.6rem 0.9rem; font-size: 0.95rem; color: var(--texte-doux); cursor: pointer; }
    .onglets button.actif { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
    .sous-composantes thead th { cursor: pointer; white-space: nowrap; }
    .sous-composantes thead th:hover { color: var(--accent); }
  `,
})
export class SynthesePage {
  protected readonly absent = VALEUR_ABSENTE;
  private readonly service = inject(SyntheseService);
  private readonly sites = inject(SitesService);
  private readonly router = inject(Router);

  protected mois = '';
  protected region = '';
  protected programmeId = '';
  protected readonly synthese = signal<SyntheseNationale | null>(null);
  protected readonly regions = signal<string[]>([]);
  protected readonly programmes = signal<Programme[]>([]);
  protected readonly chargement = signal(true);
  protected readonly onglet = signal<'pilier' | 'sousComposante'>('pilier');
  protected readonly tri = signal<{ colonne: TriColonne; sens: 1 | -1 }>({
    colonne: 'tauxAtteinteMoyen',
    sens: 1,
  });

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    const [r, p] = await Promise.all([this.sites.regions(), this.sites.programmes()]);
    this.regions.set(r);
    this.programmes.set(p);
    await this.recharger();
  }

  protected async recharger(): Promise<void> {
    this.chargement.set(true);
    try {
      const s = await this.service.synthese({
        mois: this.mois || undefined,
        region: this.region || undefined,
        programmeId: this.programmeId || undefined,
      });
      this.mois = s.moisPaqd ?? '';
      this.synthese.set(s);
    } catch {
      this.synthese.set(null);
    }
    this.chargement.set(false);
  }

  protected libelle(pilier: Pilier): string {
    return LIBELLES_PILIER[pilier];
  }

  protected libelleSc(sc: SousComposante): string {
    return LIBELLES_SOUS_COMPOSANTE[sc];
  }

  protected trier(colonne: TriColonne): void {
    const t = this.tri();
    this.tri.set({ colonne, sens: t.colonne === colonne ? ((t.sens * -1) as 1 | -1) : 1 });
  }

  /** Les dix lignes triées selon l'en-tête cliqué ; `null` en dernier. */
  protected sousComposantesTriees(s: SyntheseNationale): LigneSousComposanteSynthese[] {
    const { colonne, sens } = this.tri();
    const cle = (l: LigneSousComposanteSynthese): string | number =>
      colonne === 'libelle' ? this.libelleSc(l.sousComposante) : (l[colonne] ?? Number.POSITIVE_INFINITY);
    return [...s.parSousComposante].sort((a, b) => {
      const [x, y] = [cle(a), cle(b)];
      return (x < y ? -1 : x > y ? 1 : 0) * sens;
    });
  }

  protected ouvrirDistrict(district: string): void {
    void this.router.navigate(['/'], { queryParams: { district } });
  }
}

type TriColonne = 'libelle' | 'pilier' | 'tauxAtteinteMoyen' | 'nbConforme' | 'nbAlerte' | 'nbNonCalculable';
