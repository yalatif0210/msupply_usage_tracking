import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronRight } from '@ng-icons/lucide';
import type { Programme, SuiviStocks } from '@dqa/contracts';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { versChaine } from '../core/affichage';
import { dateFr, duree, enRupture, grouperParSite, nombre, raisonNonCalculable } from '../core/arbre-stocks';
import { ressource } from '../core/ressource';
import { SitesService } from '../core/sites.service';
import { StocksService } from '../core/stocks.service';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';

type FiltresStocks = {
  date: string;
  region: string;
  district: string;
  programmeId: string;
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
    FormsModule, RouterLink, NgIcon, Coquille, BarreAttente, HlmInput,
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
              @if (sites().length === 0) {
                <p class="text-sm text-muted-foreground">Aucun produit traceur inventorié au {{ dateFr(s.date) }} pour ce filtre.</p>
              } @else {
                <div hlmTableContainer>
                  <table hlmTable class="border border-border">
                    <thead hlmTHead>
                      <tr hlmTr>
                        <th hlmTh class="${TH}">Site · programme · produit</th>
                        <th hlmTh class="${TH}">Dernier inventaire</th>
                        <th hlmTh class="${TH}">Réceptions depuis</th>
                        <th hlmTh class="${TH}">CMM reconstituée</th>
                        <th hlmTh class="${TH}">CMM déclarée</th>
                        <th hlmTh class="${TH}">Stock projeté au {{ dateFr(s.date) }}</th>
                        <th hlmTh class="${TH}">Couverture</th>
                        <th hlmTh class="${TH}">Rupture prévue</th>
                      </tr>
                    </thead>
                    <tbody hlmTBody>
                      @for (site of sites(); track site.siteId) {
                        <tr hlmTr class="cursor-pointer bg-muted/40" (click)="basculer(site.siteId)">
                          <td hlmTd class="${TD} text-left whitespace-normal">
                            <span class="flex items-center gap-1">
                              <ng-icon [name]="ouverts().has(site.siteId) ? 'lucideChevronDown' : 'lucideChevronRight'" aria-hidden="true" />
                              <button type="button" class="text-left font-semibold" [attr.aria-expanded]="ouverts().has(site.siteId)"
                                      (click)="$event.stopPropagation(); basculer(site.siteId)">{{ site.siteNom }}</button>
                            </span>
                            <span class="block pl-5 text-xs text-muted-foreground">{{ site.district ?? 'District non renseigné' }} · {{ site.region ?? 'Région non renseignée' }}</span>
                          </td>
                          <td hlmTd class="${TD} text-muted-foreground" colspan="7">
                            {{ site.nbProduits }} produit{{ site.nbProduits > 1 ? 's' : '' }}
                            @if (site.nbEnRupture > 0) {
                              · <span class="font-medium text-alerte-texte">{{ site.nbEnRupture }} en rupture</span>
                            }
                            @if (site.premiereRupture; as r) {
                              · <span class="font-medium text-alerte-texte">{{ site.nbRuptures }} rupture{{ site.nbRuptures > 1 ? 's' : '' }} prévue{{ site.nbRuptures > 1 ? 's' : '' }}, la première le {{ dateFr(r) }}</span>
                            } @else if (site.nbEnRupture === 0) {
                              · aucune rupture prévue sous 90 jours
                            }
                          </td>
                        </tr>
                        @if (ouverts().has(site.siteId)) {
                          @for (prog of site.programmes; track prog.cle) {
                            <tr hlmTr>
                              <td hlmTd class="${TD} pl-8 text-left text-sm font-medium" colspan="8">{{ prog.programmeNom }}</td>
                            </tr>
                            @for (l of prog.produits; track l.produitId) {
                              <tr hlmTr>
                                <td hlmTd class="${TD} pl-12 text-left whitespace-normal">
                                  <a class="text-primary hover:underline" [routerLink]="['/sites', l.siteId, 'produits', l.produitCode]">{{ l.libelle }}</a>
                                  <div class="font-mono text-xs text-muted-foreground">{{ l.produitCode }}</div>
                                </td>
                                <td hlmTd class="${TD} tabular-nums">
                                  {{ nombre(l.stockFin) }}
                                  <div class="text-xs text-muted-foreground">compté le {{ dateFr(l.dateFin) }}</div>
                                </td>
                                <td hlmTd class="${TD} tabular-nums">{{ nombre(l.receptionsApresFin) }}</td>
                                @if (l.cmm.calculable) {
                                  <td hlmTd class="${TD} tabular-nums">
                                    {{ nombre(l.cmm.cmmReconstituee) }}
                                    <div class="text-xs text-muted-foreground">{{ duree(l.cmm.jours, l.cmm.nbMois) }} (depuis le {{ dateFr(l.cmm.dateDebut) }})</div>
                                  </td>
                                  <td hlmTd class="${TD} tabular-nums">{{ nombre(l.cmm.cmmDeclaree) }}</td>
                                  <td hlmTd class="${TD} tabular-nums font-medium">{{ nombre(l.cmm.stockProjete) }}</td>
                                  <td hlmTd class="${TD} tabular-nums">{{ nombre(l.cmm.couvertureJours) }} j</td>
                                  <td hlmTd class="${TD} tabular-nums" [class]="l.cmm.dateRupture ? 'font-medium text-alerte-texte' : 'text-muted-foreground'">
                                    @if (enRupture(l)) { en rupture }
                                    @else if (l.cmm.dateRupture) { {{ dateFr(l.cmm.dateRupture) }} }
                                    @else { au-delà de 90 jours }
                                  </td>
                                } @else {
                                  <td hlmTd class="${TD} text-muted-foreground" colspan="5">{{ raisonNonCalculable(l.cmm.raison) }}</td>
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
  protected readonly enRupture = enRupture;
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
    filtresInitiaux: { date: '', region: '', district: '', programmeId: '' },
  });

  protected readonly sites = computed(() => grouperParSite(this.res.valeur()?.lignes ?? []));
  /** Date affichée : celle choisie, sinon celle que le serveur a servie par défaut. */
  protected readonly dateAffichee = computed(() => this.res.filtres().date || this.res.valeur()?.date || '');

  constructor() {
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

  protected majDate(valeur: unknown): void {
    const date = versChaine(valeur);
    // la date par défaut n'est pas écrite dans l'URL : elle suit le dernier import
    this.res.definir({ date: date === this.res.valeur()?.dateParDefaut ? '' : date });
  }

  protected basculer(siteId: string): void {
    const s = new Set(this.ouverts());
    if (s.has(siteId)) s.delete(siteId);
    else s.add(siteId);
    this.ouverts.set(s);
  }
}
