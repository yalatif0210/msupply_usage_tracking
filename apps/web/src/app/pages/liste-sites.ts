import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Programme, ScoreSite } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { ressource } from '../core/ressource';
import { SitesService } from '../core/sites.service';
import { BadgeClassification } from '../ui/badge-classification';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';

/** Filtres de l'ecran. `district` est purement client : il ne recharge pas. */
type FiltresListe = {
  programmeId: string;
  district: string;
}

@Component({
  selector: 'dqa-liste-sites',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Coquille, BadgeClassification, BarreAttente, DecimalPipe],
  template: `
    <dqa-coquille />
    <main>
      <h1>Sites du périmètre DQA</h1>

      <div class="filtres">
        <label>
          District
          <select [ngModel]="res.filtres().district" (ngModelChange)="res.definirLocal({ district: $event })">
            <option value="">Tous</option>
            @for (d of districts(); track d) {
              <option [value]="d">{{ d }}</option>
            }
          </select>
        </label>
        <label>
          Programme
          <select [ngModel]="res.filtres().programmeId" (ngModelChange)="res.definir({ programmeId: $event })">
            <option value="">Tous</option>
            @for (p of programmes(); track p.programmeId) {
              <option [value]="p.programmeId">{{ p.programmeNom }}</option>
            }
          </select>
        </label>
      </div>

      @switch (res.phase()) {
      @case ('squelette') {
        <p>Chargement…</p>
      }
      @case ('echec') {
        <p class="vide">La liste des sites est indisponible.</p>
      }
      @default {
        <div class="resultats" [attr.aria-busy]="res.enCours()">
          <dqa-barre-attente [actif]="res.enCours()" />
          @if (sitesAffiches().length === 0) {
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
                @for (s of sitesAffiches(); track s.site.siteId) {
                  <tr>
                    <td><a [routerLink]="['/sites', s.site.siteId]">{{ s.site.siteNom }}</a></td>
                    <td>{{ s.site.district ?? absent }}</td>
                    <td>{{ s.moisPaqd ?? absent }}</td>
                    <td class="num">
                      {{ s.scoreComposite === null ? absent : (s.scoreComposite | number: '1.0-1') }}
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
        </div>
      }
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
    th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid var(--bordure); }
    th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.num { font-size: 1.1rem; font-weight: 600; }
    .note { color: var(--texte-doux); font-size: 0.85rem; }
    .vide { color: var(--texte-doux); }
    .couverture { display: inline-block; margin-left: 0.5rem; padding: 0.1rem 0.4rem; background: var(--neutre); color: var(--nc-texte); font-size: 0.75rem; }
  `,
})
export class ListeSitesPage {
  protected readonly absent = VALEUR_ABSENTE;
  private readonly service = inject(SitesService);

  protected readonly districts = signal<string[]>([]);
  protected readonly programmes = signal<Programme[]>([]);

  protected readonly res = ressource<ScoreSite[], FiltresListe>({
    charger: (f) => this.service.listerSites({ programmeId: f.programmeId || undefined }),
    germe: [],
    filtresInitiaux: { programmeId: '', district: '' },
    clesUrl: ['programmeId', 'district'],
  });

  /** Filtrage `district` fait ici, sur la liste deja chargee : instantane, sans requete. */
  protected readonly sitesAffiches = computed<ScoreSite[]>(() => {
    const district = this.res.filtres().district;
    const liste = this.res.valeur();
    return district ? liste.filter((s) => s.site.district === district) : liste;
  });

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    const [d, p] = await Promise.all([this.service.districts(), this.service.programmes()]);
    this.districts.set(d);
    this.programmes.set(p);
    await this.res.demarrer();
  }
}
