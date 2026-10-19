import { ChangeDetectionStrategy, Component, computed, inject, signal, type OnDestroy } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronRight } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSkeleton } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import {
  filtreProgrammesSitesSchema,
  type FiltreProgrammesSites,
  type ProgrammesDuSite,
  type ProgrammeSite,
  type ResumeProgrammesSite,
  type VueProgrammesSites,
} from '@dqa/contracts';
import { versChaine } from '../core/affichage';
import { AdminProgrammesService } from '../core/admin-programmes.service';
import { AuthService } from '../core/auth.service';
import { messageErreurHttp } from '../core/message-erreur';
import { sansActivite } from '../core/programmes-eligibles';
import { ressource } from '../core/ressource';
import { SitesService } from '../core/sites.service';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';

/** Filtres de l'écran, tous appliqués côté serveur et reflétés dans l'URL. */
type FiltresProgrammes = {
  q: string;
  district: string;
  filtre: string;
  page: string;
}

/** Délai avant d'interroger le serveur pendant la frappe d'une recherche. */
const DELAI_RECHERCHE_MS = 350;

const LIBELLES_FILTRE: Record<FiltreProgrammesSites, string> = {
  tous: 'Tous les sites',
  a_revoir: 'À revoir',
  modifies: 'Modifiés par la coordination',
};

/**
 * Programmes éligibles à l'évaluation de chaque site (ADR 0020).
 *
 * Conçu pour un grand nombre de sites : la liste est une ligne par site, avec
 * le résumé de ses programmes, filtrée et paginée côté serveur ; les
 * programmes d'un site ne se chargent qu'au dépli. Le filtre « À revoir »
 * isole les sites qui gardent un programme éligible sans activité, et un
 * bouton les désactive d'un coup. Un choix fait ici n'est jamais écrasé par
 * un import ; les scores se recalculent au bouton ou au prochain import.
 */
@Component({
  selector: 'dqa-admin-programmes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideChevronDown, lucideChevronRight })],
  imports: [
    FormsModule, DatePipe, DecimalPipe, NgIcon, Coquille, BarreAttente,
    HlmTableImports, HlmBadge, HlmButton, HlmInput, HlmSelectImports, HlmSkeleton,
  ],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-6xl px-4 py-6">
      <h1 class="text-2xl font-semibold tracking-tight">Programmes éligibles</h1>
      <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
        Programmes évalués pour chaque site (réquisitions et inventaires attendus en P1 et P2).
        Un programme rattaché au site dans mSupply mais qu'il ne gère pas fait chuter ces piliers :
        désactivez-le. Un choix fait ici n'est jamais écrasé par un import.
      </p>

      @if (!modifiable()) {
        <p class="mt-3 text-sm text-muted-foreground" role="status">
          Consultation seule : seule la coordination modifie les programmes éligibles.
        </p>
      }

      <div class="mt-4 flex flex-wrap items-end gap-4">
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Rechercher un site, un district ou un programme
          <input hlmInput class="w-72" [ngModel]="recherche()" (ngModelChange)="rechercher($event)" />
        </label>
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          District
          <hlm-select [value]="res.filtres().district" (valueChange)="res.definir({ district: versChaine($event), page: '' })">
            <hlm-select-trigger class="w-52"><hlm-select-value placeholder="Tous" /></hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-item value="">Tous</hlm-select-item>
              @for (d of districts(); track d) {
                <hlm-select-item [value]="d">{{ d }}</hlm-select-item>
              }
            </hlm-select-content>
          </hlm-select>
        </label>
        <div class="flex gap-1" role="group" aria-label="Filtre des sites">
          @for (f of filtres; track f) {
            <button hlmBtn size="sm" type="button"
                    [variant]="filtreCourant() === f ? 'default' : 'outline'"
                    [attr.aria-pressed]="filtreCourant() === f"
                    (click)="res.definir({ filtre: f === 'tous' ? '' : f, page: '' })">
              {{ libelleFiltre(f) }}
            </button>
          }
        </div>
        @if (modifiable()) {
          <button hlmBtn type="button" class="ml-auto" [disabled]="recalculEnCours()" (click)="recalculer()">
            {{ recalculEnCours() ? 'Recalcul en cours…' : 'Recalculer les scores' }}
          </button>
        }
      </div>
      @if (nbModifiesDepuisRecalcul() > 0) {
        <p class="mt-2 text-sm" role="status">
          {{ nbModifiesDepuisRecalcul() }} modification(s) pas encore prise(s) en compte dans les scores.
        </p>
      }

      @switch (res.phase()) {
        @case ('squelette') {
          <div class="mt-6 space-y-2" aria-hidden="true">
            @for (i of [0, 1, 2, 3, 4, 5]; track i) { <div hlmSkeleton class="h-11 w-full"></div> }
          </div>
        }
        @case ('echec') {
          <p class="mt-6 text-muted-foreground">La liste des programmes est indisponible.</p>
        }
        @default {
          @if (res.valeur(); as v) {
            <div class="mt-4" [attr.aria-busy]="res.enCours()">
              <dqa-barre-attente [actif]="res.enCours()" />
              <p class="mb-2 text-sm text-muted-foreground">
                <span class="font-medium text-foreground tabular-nums">{{ v.totalSites | number }}</span> site(s) ·
                <span class="font-medium text-foreground tabular-nums">{{ v.totalEligiblesSansActivite | number }}</span>
                programme(s) encore éligible(s) sans aucune activité depuis le {{ v.activiteDepuis | date: 'dd/MM/yyyy' }}.
              </p>
              @if (v.sites.length === 0) {
                <p class="text-muted-foreground">Aucun site ne correspond.</p>
              } @else {
                <div hlmTableContainer class="rounded-lg border border-border">
                  <table hlmTable>
                    <thead hlmTHead>
                      <tr hlmTr>
                        <th hlmTh><span class="sr-only">Déplier</span></th>
                        <th hlmTh>Site</th>
                        <th hlmTh class="text-right">Programmes</th>
                        <th hlmTh class="text-right">Éligibles</th>
                        <th hlmTh class="text-right">Éligibles sans activité</th>
                        <th hlmTh class="text-right">Modifiés</th>
                      </tr>
                    </thead>
                    <tbody hlmTBody>
                      @for (s of v.sites; track s.siteId) {
                        <tr hlmTr class="cursor-pointer" (click)="basculer(s.siteId)">
                          <td hlmTd class="w-8">
                            <button type="button" class="flex items-center text-muted-foreground"
                                    [attr.aria-expanded]="ouverts().has(s.siteId)"
                                    [attr.aria-label]="(ouverts().has(s.siteId) ? 'Replier ' : 'Déplier ') + s.siteNom"
                                    (click)="$event.stopPropagation(); basculer(s.siteId)">
                              <ng-icon [name]="ouverts().has(s.siteId) ? 'lucideChevronDown' : 'lucideChevronRight'" />
                            </button>
                          </td>
                          <td hlmTd class="font-medium">
                            {{ s.siteNom }}
                            <span class="block text-xs font-normal text-muted-foreground">{{ s.district }}</span>
                          </td>
                          <td hlmTd class="text-right tabular-nums">{{ s.nbProgrammes }}</td>
                          <td hlmTd class="text-right tabular-nums">{{ s.nbEligibles }}</td>
                          <td hlmTd class="text-right tabular-nums">
                            @if (s.nbEligiblesSansActivite > 0) {
                              <span hlmBadge variant="destructive">{{ s.nbEligiblesSansActivite }}</span>
                            } @else {
                              <span class="text-muted-foreground">0</span>
                            }
                          </td>
                          <td hlmTd class="text-right tabular-nums">{{ s.nbModifies }}</td>
                        </tr>
                        @if (ouverts().has(s.siteId)) {
                          <tr hlmTr>
                            <td hlmTd colspan="6" class="bg-muted/50 whitespace-normal">
                              @if (details().get(s.siteId); as det) {
                                <div class="py-2">
                                  @if (modifiable() && s.nbEligiblesSansActivite > 0) {
                                    <button hlmBtn size="sm" variant="outline" type="button" class="mb-2"
                                            [disabled]="enCours().has(s.siteId)"
                                            (click)="desactiverSansActivite(s)">
                                      Désactiver les {{ s.nbEligiblesSansActivite }} programme(s) éligible(s) sans activité
                                    </button>
                                  }
                                  <table class="w-full text-sm">
                                    <thead>
                                      <tr class="text-left text-xs text-muted-foreground">
                                        <th class="py-1 font-medium">Programme</th>
                                        <th class="py-1 text-right font-medium">Inventaires</th>
                                        <th class="py-1 text-right font-medium">Réquisitions</th>
                                        <th class="py-1 pl-4 font-medium">Statut fixé par</th>
                                        <th class="py-1 font-medium">Éligible</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      @for (p of det.programmes; track p.programmeId) {
                                        <tr class="border-t border-border" [class.text-muted-foreground]="!p.actif">
                                          <td class="py-1">
                                            {{ p.programmeNom }}
                                            @if (p.programmeCode) {
                                              <span class="ml-1 font-mono text-xs text-muted-foreground">{{ p.programmeCode }}</span>
                                            }
                                            @if (estSansActivite(p)) {
                                              <span class="ml-2 text-xs text-alerte-texte">sans activité</span>
                                            }
                                          </td>
                                          <td class="py-1 text-right tabular-nums">{{ p.nbInventaires }}</td>
                                          <td class="py-1 text-right tabular-nums">{{ p.nbRequisitions }}</td>
                                          <td class="py-1 pl-4 text-xs">
                                            @if (p.origine === 'application') {
                                              Coordination ({{ p.modifiePar }}, {{ p.modifieLe | date: 'dd/MM/yyyy' }})
                                            } @else {
                                              <span class="text-muted-foreground">Fichier mSupply</span>
                                            }
                                          </td>
                                          <td class="py-1">
                                            <label class="flex items-center gap-2">
                                              <input type="checkbox" [checked]="p.actif"
                                                     [disabled]="!modifiable() || enCours().has(s.siteId)"
                                                     (change)="modifier(s, p, !p.actif)"
                                                     [attr.aria-label]="'Évaluer ' + p.programmeNom + ' pour ' + s.siteNom" />
                                              {{ p.actif ? 'Oui' : 'Non' }}
                                            </label>
                                          </td>
                                        </tr>
                                      }
                                    </tbody>
                                  </table>
                                </div>
                              } @else {
                                <div hlmSkeleton class="my-2 h-16 w-full"></div>
                              }
                            </td>
                          </tr>
                        }
                      }
                    </tbody>
                  </table>
                </div>
                @if (nbPages() > 1) {
                  <div class="mt-3 flex items-center justify-end gap-2 text-xs">
                    <button hlmBtn size="sm" variant="outline" type="button" [disabled]="v.page <= 1" (click)="allerPage(v.page - 1)">
                      Précédent
                    </button>
                    <span class="tabular-nums text-muted-foreground">Page {{ v.page }} sur {{ nbPages() }}</span>
                    <button hlmBtn size="sm" variant="outline" type="button" [disabled]="v.page >= nbPages()" (click)="allerPage(v.page + 1)">
                      Suivant
                    </button>
                  </div>
                }
              }
            </div>
          }
        }
      }
    </main>
  `,
})
export class AdminProgrammesPage implements OnDestroy {
  private readonly service = inject(AdminProgrammesService);
  private readonly sites = inject(SitesService);
  private readonly auth = inject(AuthService);

  protected readonly versChaine = versChaine;
  protected readonly filtres = filtreProgrammesSitesSchema.options;
  protected readonly modifiable = computed(() => this.auth.utilisateur()?.role === 'coordination');
  protected readonly districts = signal<string[]>([]);

  protected readonly res = ressource<VueProgrammesSites | null, FiltresProgrammes>({
    charger: (f) => {
      const filtre = filtreProgrammesSitesSchema.safeParse(f.filtre);
      return this.service.etat({
        q: f.q || undefined,
        district: f.district || undefined,
        filtre: filtre.success ? filtre.data : undefined,
        page: Number(f.page) || undefined,
      });
    },
    germe: null,
    filtresInitiaux: { q: '', district: '', filtre: '', page: '' },
  });

  /** Champ de recherche : affiché tout de suite, envoyé au serveur après une pause de frappe. */
  protected readonly recherche = signal('');
  private minuterie: ReturnType<typeof setTimeout> | undefined;

  protected readonly ouverts = signal<ReadonlySet<string>>(new Set());
  protected readonly details = signal<ReadonlyMap<string, ProgrammesDuSite>>(new Map());
  protected readonly enCours = signal<ReadonlySet<string>>(new Set());
  protected readonly recalculEnCours = signal(false);
  protected readonly nbModifiesDepuisRecalcul = signal(0);

  protected readonly filtreCourant = computed<FiltreProgrammesSites>(() => {
    const f = filtreProgrammesSitesSchema.safeParse(this.res.filtres().filtre);
    return f.success ? f.data : 'tous';
  });
  protected readonly nbPages = computed(() => {
    const v = this.res.valeur();
    return v ? Math.max(1, Math.ceil(v.totalSites / v.taillePage)) : 1;
  });

  constructor() {
    void this.init();
  }

  ngOnDestroy(): void {
    clearTimeout(this.minuterie);
  }

  private async init(): Promise<void> {
    await this.res.demarrer();
    this.recherche.set(this.res.filtres().q);
    this.districts.set(await this.sites.districts());
  }

  protected libelleFiltre = (f: FiltreProgrammesSites): string => LIBELLES_FILTRE[f];
  protected estSansActivite = (p: ProgrammeSite): boolean => sansActivite(p);

  protected rechercher(texte: string): void {
    this.recherche.set(texte);
    clearTimeout(this.minuterie);
    this.minuterie = setTimeout(() => this.res.definir({ q: texte.trim(), page: '' }), DELAI_RECHERCHE_MS);
  }

  protected allerPage(n: number): void {
    this.res.definir({ page: n <= 1 ? '' : String(n) });
  }

  protected basculer(siteId: string): void {
    const ouverts = new Set(this.ouverts());
    if (ouverts.has(siteId)) {
      ouverts.delete(siteId);
    } else {
      ouverts.add(siteId);
      if (!this.details().has(siteId)) void this.chargerDetail(siteId);
    }
    this.ouverts.set(ouverts);
  }

  private async chargerDetail(siteId: string): Promise<void> {
    try {
      const det = await this.service.programmesDuSite(siteId);
      this.details.update((m) => new Map(m).set(siteId, det));
    } catch (err) {
      toast.error(messageErreurHttp(err));
    }
  }

  /** Après une modification : détail du site rechargé, compteurs de la liste rafraîchis en fond. */
  private async apresModification(siteId: string, nb: number): Promise<void> {
    this.nbModifiesDepuisRecalcul.update((n) => n + nb);
    await this.chargerDetail(siteId);
    void this.res.rafraichir();
  }

  private async avecVerrou(siteId: string, action: () => Promise<void>): Promise<void> {
    this.enCours.update((e) => new Set(e).add(siteId));
    try {
      await action();
    } catch (err) {
      toast.error(messageErreurHttp(err));
    } finally {
      this.enCours.update((e) => {
        const n = new Set(e);
        n.delete(siteId);
        return n;
      });
    }
  }

  protected modifier(s: ResumeProgrammesSite, p: ProgrammeSite, actif: boolean): Promise<void> {
    return this.avecVerrou(s.siteId, async () => {
      await this.service.modifier(s.siteId, p.programmeId, actif);
      await this.apresModification(s.siteId, 1);
    });
  }

  protected desactiverSansActivite(s: ResumeProgrammesSite): Promise<void> {
    return this.avecVerrou(s.siteId, async () => {
      const { nbDesactives } = await this.service.desactiverSansActivite(s.siteId);
      toast.success(`${nbDesactives} programme(s) désactivé(s) pour ${s.siteNom}.`);
      await this.apresModification(s.siteId, nbDesactives);
    });
  }

  protected async recalculer(): Promise<void> {
    this.recalculEnCours.set(true);
    try {
      await this.service.recalculer();
      this.nbModifiesDepuisRecalcul.set(0);
      toast.success('Scores recalculés avec les programmes éligibles.');
    } catch (err) {
      toast.error(messageErreurHttp(err));
    } finally {
      this.recalculEnCours.set(false);
    }
  }
}
