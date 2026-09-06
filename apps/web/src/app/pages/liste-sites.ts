import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmSkeleton } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { Programme, ScoreSite } from '@dqa/contracts';
import { VALEUR_ABSENTE, versChaine } from '../core/affichage';
import { ressource } from '../core/ressource';
import { SitesService } from '../core/sites.service';
import { BadgeClassification } from '../ui/badge-classification';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';

/** Filtres de l'ecran. `district` et `page` sont purement client : ils ne rechargent pas. */
type FiltresListe = {
  programmeId: string;
  district: string;
  page: string;
}

/** Nombre de sites par page du tableau. */
const TAILLE_PAGE = 15;

@Component({
  selector: 'dqa-liste-sites',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    Coquille,
    BadgeClassification,
    BarreAttente,
    DecimalPipe,
    HlmBadge,
    HlmButton,
    HlmSelectImports,
    HlmSkeleton,
    HlmTableImports,
  ],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-6xl px-4 py-6">
      <h1 class="text-2xl font-semibold tracking-tight text-foreground">Sites du périmètre DQA</h1>

      <div class="mt-4 mb-4 flex flex-wrap gap-4">
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          District
          <hlm-select
            [value]="res.filtres().district"
            (valueChange)="majDistrict($event)"
          >
            <hlm-select-trigger class="w-56">
              <hlm-select-value placeholder="Tous" />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-item value="">Tous</hlm-select-item>
              @for (d of districts(); track d) {
                <hlm-select-item [value]="d">{{ d }}</hlm-select-item>
              }
            </hlm-select-content>
          </hlm-select>
        </label>
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Programme
          <hlm-select
            [value]="res.filtres().programmeId"
            [itemToString]="libelleProgramme"
            (valueChange)="majProgramme($event)"
          >
            <hlm-select-trigger class="w-56">
              <hlm-select-value placeholder="Tous" />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-item value="">Tous</hlm-select-item>
              @for (p of programmes(); track p.programmeId) {
                <hlm-select-item [value]="p.programmeId">{{ p.programmeNom }}</hlm-select-item>
              }
            </hlm-select-content>
          </hlm-select>
        </label>
      </div>

      @switch (res.phase()) {
      @case ('squelette') {
        <div class="space-y-2" aria-hidden="true">
          @for (i of lignesSquelette; track i) {
            <div hlmSkeleton class="h-11 w-full"></div>
          }
        </div>
      }
      @case ('echec') {
        <p class="text-muted-foreground">La liste des sites est indisponible.</p>
      }
      @default {
        <div [attr.aria-busy]="res.enCours()">
          <dqa-barre-attente [actif]="res.enCours()" />
          @if (sitesAffiches().length === 0) {
            <p class="text-muted-foreground">Aucun site ne correspond, ou aucun import n'a encore été traité.</p>
          } @else {
            <div hlmTableContainer class="rounded-lg border border-border">
              <table hlmTable>
                <thead hlmTHead>
                  <tr hlmTr>
                    <th hlmTh class="text-xs font-medium text-muted-foreground">Site</th>
                    <th hlmTh class="text-xs font-medium text-muted-foreground">District</th>
                    <th hlmTh class="text-xs font-medium text-muted-foreground">Mois</th>
                    <th hlmTh class="text-xs font-medium text-muted-foreground text-end">Score composite</th>
                    <th hlmTh class="text-xs font-medium text-muted-foreground">Classification</th>
                  </tr>
                </thead>
                <tbody hlmTBody>
                  @for (s of sitesPage(); track s.site.siteId) {
                    <tr hlmTr>
                      <td hlmTd class="h-12 font-medium">
                        <a [routerLink]="['/sites', s.site.siteId]" class="text-primary hover:underline">{{ s.site.siteNom }}</a>
                      </td>
                      <td hlmTd class="h-12 text-muted-foreground">{{ s.site.district ?? absent }}</td>
                      <td hlmTd class="h-12 text-muted-foreground tabular-nums">{{ s.moisPaqd ?? absent }}</td>
                      <td hlmTd class="h-12 text-end text-base font-semibold tabular-nums">
                        {{ s.scoreComposite === null ? absent : (s.scoreComposite | number: '1.0-1') }}
                      </td>
                      <td hlmTd class="h-12">
                        @if (s.moisPaqd) {
                          <span class="flex items-center gap-2">
                            <dqa-badge-classification [classification]="s.classification" />
                            @if (s.piliersCouverts < 6) {
                              <span hlmBadge variant="secondary" title="Score composite renormalisé sur une couverture partielle">
                                {{ s.piliersCouverts }}/6 piliers
                              </span>
                            }
                          </span>
                        } @else {
                          <span class="text-muted-foreground">Aucune mesure</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p class="text-xs text-muted-foreground">
                Sites triés du score le plus faible au plus élevé ; sites sans mesure en fin de liste.
              </p>
              @if (nbPages() > 1) {
                <div class="flex items-center gap-2 text-xs">
                  <button hlmBtn size="sm" variant="outline" type="button" [disabled]="pageCourante() <= 1" (click)="allerPage(pageCourante() - 1)">
                    Précédent
                  </button>
                  <span class="tabular-nums text-muted-foreground">
                    Page {{ pageCourante() }} sur {{ nbPages() }} · {{ sitesAffiches().length }} sites
                  </span>
                  <button hlmBtn size="sm" variant="outline" type="button" [disabled]="pageCourante() >= nbPages()" (click)="allerPage(pageCourante() + 1)">
                    Suivant
                  </button>
                </div>
              }
            </div>
          }
        </div>
      }
      }
    </main>
  `,
})
export class ListeSitesPage {
  protected readonly absent = VALEUR_ABSENTE;
  protected readonly lignesSquelette = [0, 1, 2, 3, 4, 5];
  private readonly service = inject(SitesService);

  protected readonly districts = signal<string[]>([]);
  protected readonly programmes = signal<Programme[]>([]);

  protected readonly res = ressource<ScoreSite[], FiltresListe>({
    charger: (f) => this.service.listerSites({ programmeId: f.programmeId || undefined }),
    germe: [],
    filtresInitiaux: { programmeId: '', district: '', page: '' },
    clesUrl: ['programmeId', 'district', 'page'],
  });

  /** Filtrage `district` fait ici, sur la liste deja chargee : instantane, sans requete. */
  protected readonly sitesAffiches = computed<ScoreSite[]>(() => {
    const district = this.res.filtres().district;
    const liste = this.res.valeur();
    return district ? liste.filter((s) => s.site.district === district) : liste;
  });

  protected readonly nbPages = computed(() =>
    Math.max(1, Math.ceil(this.sitesAffiches().length / TAILLE_PAGE)),
  );

  /** Page courante (1-based), bornée à `[1, nbPages]` même si l'URL contient n'importe quoi. */
  protected readonly pageCourante = computed(() => {
    const demandee = Math.trunc(Number(this.res.filtres().page)) || 1;
    return Math.min(Math.max(1, demandee), this.nbPages());
  });

  /** La tranche de sites visible dans le tableau. */
  protected readonly sitesPage = computed<ScoreSite[]>(() => {
    const debut = (this.pageCourante() - 1) * TAILLE_PAGE;
    return this.sitesAffiches().slice(debut, debut + TAILLE_PAGE);
  });

  constructor() {
    void this.init();
  }

  /**
   * Le `select` spartan n'expose pas `[ngModel]` : la valeur passe par l'entree
   * `[value]` et la sortie `(valueChange)`. On garde le meme cablage qu'avant :
   * `district` -> filtre client instantane, `programmeId` -> refetch en fond.
   */
  protected majDistrict(valeur: unknown): void {
    // un changement de filtre repart de la première page.
    this.res.definirLocal({ district: versChaine(valeur), page: '' });
  }

  protected majProgramme(valeur: unknown): void {
    this.res.definir({ programmeId: versChaine(valeur), page: '' });
  }

  protected allerPage(n: number): void {
    this.res.definirLocal({ page: n <= 1 ? '' : String(n) });
    window.scrollTo({ top: 0 });
  }

  /**
   * Le contenu du `select` spartan est portalise : ses items ne sont pas montes
   * quand le panneau est ferme, donc l'affichage de la valeur ne peut pas lire
   * leur libelle. On resout l'id de programme en nom ici (arrow = `this` lie).
   */
  protected readonly libelleProgramme = (id: unknown): string => {
    const p = this.programmes().find((x) => x.programmeId === id);
    return p ? p.programmeNom : '';
  };

  private async init(): Promise<void> {
    const [d, p] = await Promise.all([this.service.districts(), this.service.programmes()]);
    this.districts.set(d);
    this.programmes.set(p);
    await this.res.demarrer();
  }
}
