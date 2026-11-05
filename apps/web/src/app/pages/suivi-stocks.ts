import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronRight } from '@ng-icons/lucide';
import { STATUTS_STOCK, type Programme, type StatutStock, type SuiviStocks } from '@dqa/contracts';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { versChaine } from '../core/affichage';
import {
  compteStatut, couplesASignaler, dateFr, duree, ecartPhoto, grouper, LIBELLES_STATUT, nombre, raisonNonCalculable,
  type LectureStocks,
} from '../core/arbre-stocks';
import { ressource } from '../core/ressource';
import { SitesService } from '../core/sites.service';
import { StocksService } from '../core/stocks.service';
import { BadgeStock } from '../ui/badge-stock';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';

type FiltresStocks = {
  date: string;
  region: string;
  district: string;
  programmeId: string;
  /** Filtre client : la donnée chargée contient déjà tous les statuts. */
  statut: '' | StatutStock;
  /** Vide = par site (lecture par défaut). */
  lecture: '' | 'programme';
  /** '1' : colonnes de contrôle du calcul affichées. */
  controle: '' | '1';
};

/** Tableaux quadrillés, comme les tableaux produit de la fiche site. */
const TH = 'border-r border-border bg-muted text-center font-normal text-primary last:border-r-0';
const TD = 'border-r border-border text-center last:border-r-0';

/**
 * Suivi des stocks (spec `.scratch/suivi-des-stocks`) : pour chaque site,
 * programme et produit traceur, CMM reconstituée et déclarée, stock projeté à
 * la date choisie, couverture et rupture prévue. Tout est calculé en base
 * (`dqa.stocks_a_date`) ; l'écran ne fait que regrouper et mettre en forme.
 */
@Component({
  selector: 'dqa-suivi-stocks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideChevronDown, lucideChevronRight })],
  imports: [
    NgTemplateOutlet, FormsModule, RouterLink, NgIcon, Coquille, BarreAttente, BadgeStock, HlmButton, HlmInput,
    HlmSelectImports, HlmSkeletonImports, HlmTableImports,
  ],
  template: `
    <dqa-coquille />
    <main class="mx-auto w-full max-w-vue py-6">
      <h1 class="text-2xl font-bold tracking-tight">Suivi des stocks</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Stock conjecturé à une date choisie, par projection linéaire de la CMM reconstituée
        (sorties physiques entre deux inventaires, pertes comprises). Produits traceurs seulement ;
        sans effet sur le score.
      </p>

      <div class="mt-4 mb-6 flex flex-wrap items-end gap-4">
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Date
          <input hlmInput type="date" class="w-44" [ngModel]="dateAffichee()" (ngModelChange)="majDate($event)" />
        </label>
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Région
          <hlm-select [value]="res.filtres().region" (valueChange)="maj({ region: versChaine($event) })">
            <hlm-select-trigger class="w-48"><hlm-select-value placeholder="Toutes" /></hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-item value="">Toutes</hlm-select-item>
              @for (r of regions(); track r) { <hlm-select-item [value]="r">{{ r }}</hlm-select-item> }
            </hlm-select-content>
          </hlm-select>
        </label>
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          District
          <hlm-select [value]="res.filtres().district" (valueChange)="maj({ district: versChaine($event) })">
            <hlm-select-trigger class="w-48"><hlm-select-value placeholder="Tous" /></hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-item value="">Tous</hlm-select-item>
              @for (d of districts(); track d) { <hlm-select-item [value]="d">{{ d }}</hlm-select-item> }
            </hlm-select-content>
          </hlm-select>
        </label>
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Programme
          <hlm-select [value]="res.filtres().programmeId" (valueChange)="maj({ programmeId: versChaine($event) })">
            <hlm-select-trigger class="w-64"><hlm-select-value placeholder="Tous programmes" /></hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-item value="">Tous programmes</hlm-select-item>
              @for (p of programmes(); track p.programmeId) {
                <hlm-select-item [value]="p.programmeId">{{ p.programmeNom }}</hlm-select-item>
              }
            </hlm-select-content>
          </hlm-select>
        </label>
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Statut
          <hlm-select [value]="res.filtres().statut" (valueChange)="majStatut($event)">
            <hlm-select-trigger class="w-48"><hlm-select-value placeholder="Tous" /></hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-item value="">Tous</hlm-select-item>
              @for (st of statuts; track st) { <hlm-select-item [value]="st">{{ libelleStatut(st) }}</hlm-select-item> }
            </hlm-select-content>
          </hlm-select>
        </label>
      </div>

      @switch (res.phase()) {
        @case ('squelette') {
          <div class="flex flex-col gap-3">
            <div hlmSkeleton class="h-10 w-full"></div>
            <div hlmSkeleton class="h-64 w-full"></div>
          </div>
        }
        @case ('echec') {
          <p class="text-sm text-muted-foreground">Le suivi des stocks est indisponible.</p>
        }
        @default {
          <div [attr.aria-busy]="res.enCours()">
            <dqa-barre-attente [actif]="res.enCours()" />
            @if (res.valeur(); as s) {
              @if (signaler(); as sig) {
                @if (sig.urgents.length > 0 || sig.aSurveiller.length > 0) {
                  <section class="mb-6 rounded-lg border border-border bg-card p-4 shadow-xs" aria-labelledby="titre-signaler">
                    <h2 id="titre-signaler" class="text-base font-semibold">
                      Ruptures à signaler au {{ dateFr(s.date) }}
                      <span class="ml-2 text-sm font-normal text-muted-foreground">
                        {{ sig.urgents.length }} couple{{ sig.urgents.length > 1 ? 's' : '' }} site × produit en rupture ou à {{ s.seuilCouvertureJours }} jours de couverture ou moins
                      </span>
                    </h2>
                    @if (sig.urgents.length > 0) {
                      <div hlmTableContainer class="mt-3">
                        <table hlmTable class="border border-border">
                          <thead hlmTHead>
                            <tr hlmTr>
                              <th hlmTh class="${TH}">Site</th>
                              <th hlmTh class="${TH}">Produit</th>
                              <th hlmTh class="${TH}">Stock projeté</th>
                              <th hlmTh class="${TH}">Couverture</th>
                              <th hlmTh class="${TH}">Rupture prévue</th>
                              <th hlmTh class="${TH}">Statut</th>
                            </tr>
                          </thead>
                          <tbody hlmTBody id="stocks-urgents">
                            @for (l of urgentsVisibles(); track l.siteId + '|' + l.produitCode) {
                              <ng-container *ngTemplateOutlet="ligneCourte; context: { $implicit: l }" />
                            }
                          </tbody>
                        </table>
                      </div>
                      @if (sig.urgents.length > URGENTS_AFFICHES) {
                        <button hlmBtn variant="link" size="sm" type="button" class="mt-2 px-0"
                                [attr.aria-expanded]="tousUrgents()" aria-controls="stocks-urgents"
                                (click)="tousUrgents.set(!tousUrgents())">
                          @if (tousUrgents()) {
                            N'afficher que les {{ URGENTS_AFFICHES }} plus urgents
                          } @else {
                            Afficher les {{ sig.urgents.length - URGENTS_AFFICHES }} autres
                          }
                        </button>
                      }
                    }
                    @if (sig.aSurveiller.length > 0) {
                      <details class="mt-3">
                        <summary class="cursor-pointer text-sm text-primary">
                          {{ sig.aSurveiller.length }} couple{{ sig.aSurveiller.length > 1 ? 's' : '' }} à surveiller (rupture prévue au-delà de {{ s.seuilCouvertureJours }} jours, dans les 90 jours)
                        </summary>
                        <div hlmTableContainer class="mt-2">
                          <table hlmTable class="border border-border">
                            <thead hlmTHead>
                              <tr hlmTr>
                                <th hlmTh class="${TH}">Site</th>
                                <th hlmTh class="${TH}">Produit</th>
                                <th hlmTh class="${TH}">Stock projeté</th>
                                <th hlmTh class="${TH}">Couverture</th>
                                <th hlmTh class="${TH}">Rupture prévue</th>
                                <th hlmTh class="${TH}">Statut</th>
                              </tr>
                            </thead>
                            <tbody hlmTBody>
                              @for (l of sig.aSurveiller; track l.siteId + '|' + l.produitCode) {
                                <ng-container *ngTemplateOutlet="ligneCourte; context: { $implicit: l }" />
                              }
                            </tbody>
                          </table>
                        </div>
                      </details>
                    }
                  </section>
                }
              }

              <ng-template #ligneCourte let-l>
                <tr hlmTr>
                  <td hlmTd class="${TD} text-left whitespace-normal">
                    {{ l.siteNom }}
                    <div class="text-xs text-muted-foreground">{{ l.district ?? 'District non renseigné' }}</div>
                  </td>
                  <td hlmTd class="${TD} text-left whitespace-normal">
                    <a class="text-primary hover:underline" [routerLink]="['/stocks', l.siteId, l.produitCode]" [queryParams]="lienDate()">{{ l.libelle }}</a>
                  </td>
                  <td hlmTd class="${TD} tabular-nums">{{ l.cmm.calculable ? nombre(l.cmm.stockProjete) : '' }}</td>
                  <td hlmTd class="${TD} tabular-nums">{{ l.cmm.calculable ? nombre(l.cmm.couvertureJours) + ' j' : '' }}</td>
                  <td hlmTd class="${TD} tabular-nums">{{ l.cmm.calculable && l.cmm.dateRupture ? dateFr(l.cmm.dateRupture) : '' }}</td>
                  <td hlmTd class="${TD}"><dqa-badge-stock [statut]="l.statut" /></td>
                </tr>
              </ng-template>

              <div class="mb-2 flex gap-2" role="group" aria-label="Lecture du tableau">
                <button hlmBtn size="sm" type="button" [variant]="lecture() === 'site' ? 'default' : 'outline'"
                        [attr.aria-pressed]="lecture() === 'site'" (click)="majLecture('site')">Par site</button>
                <button hlmBtn size="sm" type="button" [variant]="lecture() === 'programme' ? 'default' : 'outline'"
                        [attr.aria-pressed]="lecture() === 'programme'" (click)="majLecture('programme')">Par programme</button>
                <button hlmBtn size="sm" type="button" class="ml-auto" [variant]="controle() ? 'default' : 'outline'"
                        [attr.aria-pressed]="controle()" (click)="basculerControle()"
                        title="Dernier inventaire, réceptions, CMM déclarée, photo mSupply et écart : le détail du calcul">
                  Colonnes de contrôle
                </button>
              </div>

              @if (groupes().length === 0) {
                <p class="text-sm text-muted-foreground">Aucun produit traceur inventorié au {{ dateFr(s.date) }} pour ce filtre.</p>
              } @else {
                <div hlmTableContainer>
                  <table hlmTable class="border border-border">
                    <thead hlmTHead>
                      <tr hlmTr>
                        @for (t of enTetes(); track t) {
                          <th hlmTh class="${TH}">{{ t }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody hlmTBody>
                      @for (site of groupes(); track site.cle) {
                        <tr hlmTr class="cursor-pointer bg-muted/40" (click)="basculer(site.cle)">
                          <td hlmTd class="${TD} text-left whitespace-normal">
                            <span class="flex items-center gap-1">
                              <ng-icon [name]="ouverts().has(site.cle) ? 'lucideChevronDown' : 'lucideChevronRight'" aria-hidden="true" />
                              <button type="button" class="text-left font-semibold" [attr.aria-expanded]="ouverts().has(site.cle)"
                                      (click)="$event.stopPropagation(); basculer(site.cle)">{{ site.titre }}</button>
                            </span>
                            @if (site.sousTitre) {
                              <span class="block pl-5 text-xs text-muted-foreground">{{ site.sousTitre }}</span>
                            }
                          </td>
                          <td hlmTd class="${TD} text-muted-foreground" [attr.colspan]="nbColonnes() - 1">
                            {{ site.nbProduits }} produit{{ site.nbProduits > 1 ? 's' : '' }}
                            @for (st of statutsResume; track st) {
                              @if (site.parStatut[st] > 0) {
                                · <span [class]="st === 'a_surveiller' ? 'font-medium text-partiel-texte' : 'font-medium text-alerte-texte'">{{ compteStatut(st, site.parStatut[st]) }}</span>
                              }
                            }
                            @if (site.premiereRupture; as r) {
                              · prochaine rupture le {{ dateFr(r) }}
                            }
                          </td>
                        </tr>
                        @if (ouverts().has(site.cle)) {
                          @for (prog of site.sousGroupes; track prog.cle) {
                            <tr hlmTr>
                              <td hlmTd class="${TD} pl-8 text-left text-sm font-medium" [attr.colspan]="nbColonnes()">
                                {{ prog.titre }}
                                @if (prog.sousTitre) { <span class="ml-2 text-xs font-normal text-muted-foreground">{{ prog.sousTitre }}</span> }
                              </td>
                            </tr>
                            @for (l of prog.produits; track l.produitCode) {
                              <tr hlmTr>
                                <td hlmTd class="${TD} pl-12 text-left whitespace-normal">
                                  <a class="text-primary hover:underline" [routerLink]="['/stocks', l.siteId, l.produitCode]" [queryParams]="lienDate()">{{ l.libelle }}</a>
                                  <div class="font-mono text-xs text-muted-foreground">{{ l.produitCode }}</div>
                                </td>
                                @if (l.cmm.calculable) {
                                  <td hlmTd class="${TD} tabular-nums">
                                    {{ nombre(l.cmm.cmmReconstituee) }}
                                    <div class="text-xs text-muted-foreground">{{ duree(l.cmm.jours, l.cmm.nbMois) }} depuis le {{ dateFr(l.cmm.dateDebut) }}</div>
                                  </td>
                                  <td hlmTd class="${TD} tabular-nums font-medium">{{ nombre(l.cmm.stockProjete) }}</td>
                                  <td hlmTd class="${TD} tabular-nums">{{ nombre(l.cmm.couvertureJours) }} j</td>
                                  <td hlmTd class="${TD} tabular-nums">
                                    @if (l.statut === 'en_rupture') { déjà à 0 }
                                    @else if (l.cmm.dateRupture) { {{ dateFr(l.cmm.dateRupture) }} }
                                    @else { <span class="text-muted-foreground">au-delà de 90 jours</span> }
                                  </td>
                                } @else {
                                  <td hlmTd class="${TD} text-muted-foreground" colspan="4">{{ raisonNonCalculable(l.cmm.raison) }}</td>
                                }
                                <td hlmTd class="${TD}"><dqa-badge-stock [statut]="l.statut" /></td>
                                @if (controle()) {
                                  <td hlmTd class="${TD} tabular-nums">
                                    {{ nombre(l.stockFin) }}
                                    <div class="text-xs text-muted-foreground">compté le {{ dateFr(l.dateFin) }}</div>
                                  </td>
                                  <td hlmTd class="${TD} tabular-nums">{{ nombre(l.receptionsApresFin) }}</td>
                                  <td hlmTd class="${TD} tabular-nums">
                                    @if (l.cmm.calculable) {
                                      {{ nombre(l.cmm.cmmDeclaree) }}
                                    }
                                  </td>
                                  @if (l.photo; as ph) {
                                    <td hlmTd class="${TD} tabular-nums">
                                      {{ nombre(ph.stockMsupply) }}
                                      <div class="text-xs text-muted-foreground">le {{ dateFr(ph.date) }}</div>
                                    </td>
                                    <td hlmTd class="${TD} tabular-nums">
                                      {{ ecartPhoto(ph.stockProjete, ph.stockMsupply) }}
                                      @if (ph.stockProjete !== null) {
                                        <div class="text-xs text-muted-foreground">projeté {{ nombre(ph.stockProjete) }}</div>
                                      }
                                    </td>
                                  } @else {
                                    <td hlmTd class="${TD} text-muted-foreground" colspan="2">aucune photo depuis le dernier inventaire</td>
                                  }
                                }
                              </tr>
                            }
                          }
                        }
                      }
                    </tbody>
                  </table>
                </div>
                <p class="mt-2 text-xs text-muted-foreground">
                  CMM reconstituée = (stock compté au début + réceptions - stock compté à la fin) ÷ jours × 30,4, entre deux
                  inventaires distants d'environ 90 jours ; CMM déclarée = dispensations (distributions pour un district) sur les
                  mêmes jours. Stock projeté = dernier stock compté + réceptions connues - CMM reconstituée par jour, jamais
                  sous 0. Seules comptent les données connues à la date choisie.
                </p>
              }
            }
          </div>
        }
      }
    </main>
  `,
})
export class SuiviStocksPage {
  private readonly service = inject(StocksService);
  private readonly sitesService = inject(SitesService);

  protected readonly versChaine = versChaine;
  protected readonly dateFr = dateFr;
  protected readonly nombre = nombre;
  protected readonly duree = duree;
  protected readonly ecartPhoto = ecartPhoto;
  protected readonly compteStatut = compteStatut;
  protected readonly statuts = STATUTS_STOCK;
  /** Statuts repris dans le résumé replié d'un site, du plus urgent au moins urgent. */
  protected readonly statutsResume: readonly StatutStock[] = ['en_rupture', 'rupture_signalee', 'a_surveiller'];
  protected readonly raisonNonCalculable = raisonNonCalculable;

  protected readonly regions = signal<string[]>([]);
  protected readonly districts = signal<string[]>([]);
  protected readonly programmes = signal<Programme[]>([]);
  protected readonly ouverts = signal<ReadonlySet<string>>(new Set());

  protected readonly res = ressource<SuiviStocks | null, FiltresStocks>({
    charger: (f) =>
      this.service.suivi({
        date: f.date || undefined,
        region: f.region || undefined,
        district: f.district || undefined,
        programmeId: f.programmeId || undefined,
      }),
    germe: null,
    filtresInitiaux: { date: '', region: '', district: '', programmeId: '', statut: '', lecture: '', controle: '' },
  });

  /** Lignes après le filtre de statut, appliqué ici sur la donnée déjà chargée. */
  private readonly lignes = computed(() => {
    const statut = this.res.filtres().statut;
    const toutes = this.res.valeur()?.lignes ?? [];
    return statut ? toutes.filter((l) => l.statut === statut) : toutes;
  });
  protected readonly lecture = computed<LectureStocks>(() => (this.res.filtres().lecture === 'programme' ? 'programme' : 'site'));
  protected readonly groupes = computed(() => grouper(this.lignes(), this.lecture()));
  /** L'encadré de tête suit les filtres de territoire et de programme, pas celui de statut. */
  protected readonly signaler = computed(() => couplesASignaler(this.res.valeur()?.lignes ?? []));
  /** Date affichée : celle choisie, sinon celle que le serveur a servie par défaut. */
  protected readonly dateAffichee = computed(() => this.res.filtres().date || this.res.valeur()?.date || '');
  /** Le détail d'un couple s'ouvre à la même date que la liste. */
  protected readonly lienDate = computed(() => (this.res.filtres().date ? { date: this.res.filtres().date } : {}));

  constructor() {
    // nouvelle liste (filtre, date, import) : on repart des seuls plus urgents
    effect(() => {
      this.signaler();
      untracked(() => this.tousUrgents.set(false));
    });
    void this.init();
  }

  private async init(): Promise<void> {
    const [r, d, p] = await Promise.all([
      this.sitesService.regions(),
      this.sitesService.districts(),
      this.sitesService.programmes(),
    ]);
    this.regions.set(r);
    this.districts.set(d);
    this.programmes.set(p);
    await this.res.demarrer();
  }

  protected maj(modif: Partial<FiltresStocks>): void {
    this.res.definir(modif);
  }

  protected libelleStatut(st: StatutStock): string {
    return LIBELLES_STATUT[st];
  }

  protected majStatut(valeur: unknown): void {
    const v = versChaine(valeur);
    const statut = this.statuts.find((st) => st === v) ?? '';
    this.res.definirLocal({ statut });
  }

  protected majDate(valeur: unknown): void {
    const date = versChaine(valeur);
    // la date par défaut n'est pas écrite dans l'URL : elle suit le dernier import
    this.res.definir({ date: date === this.res.valeur()?.dateParDefaut ? '' : date });
  }

  /** Colonnes de contrôle du calcul, en plus des six colonnes de décision (URL : `controle=1`). */
  protected readonly controle = computed(() => this.res.filtres().controle === '1');
  protected readonly enTetes = computed<string[]>(() => {
    const date = this.res.valeur()?.date;
    const decision = [
      this.lecture() === 'site' ? 'Site · programme · produit' : 'Programme · site · produit',
      'CMM reconstituée',
      date ? `Stock projeté au ${this.dateFr(date)}` : 'Stock projeté',
      'Couverture',
      'Rupture prévue',
      'Statut',
    ];
    const controle = ['Dernier inventaire', 'Réceptions depuis', 'CMM déclarée', 'Photo mSupply', 'Écart projeté - mSupply'];
    return this.controle() ? [...decision, ...controle] : decision;
  });
  protected readonly nbColonnes = computed(() => this.enTetes().length);

  protected basculerControle(): void {
    this.res.definirLocal({ controle: this.controle() ? '' : '1' });
  }

  /** L'encadré montre d'abord les couples les plus urgents (couverture croissante). */
  protected readonly URGENTS_AFFICHES = 10;
  protected readonly tousUrgents = signal(false);
  protected readonly urgentsVisibles = computed(() => {
    const urgents = this.signaler()?.urgents ?? [];
    return this.tousUrgents() ? urgents : urgents.slice(0, this.URGENTS_AFFICHES);
  });

  protected majLecture(lecture: LectureStocks): void {
    this.res.definirLocal({ lecture: lecture === 'site' ? '' : lecture });
    this.ouverts.set(new Set());
  }

  /** Clé d'un groupe de premier niveau : site, ou programme selon la lecture. */
  protected basculer(cle: string): void {
    const s = new Set(this.ouverts());
    if (s.has(cle)) s.delete(cle);
    else s.add(cle);
    this.ouverts.set(s);
  }
}
