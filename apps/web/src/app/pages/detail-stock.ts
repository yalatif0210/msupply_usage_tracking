import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { DetailStock } from '@dqa/contracts';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { versChaine } from '../core/affichage';
import { dateFr, duree, ecartPhoto, nombre, raisonNonCalculable } from '../core/arbre-stocks';
import { ressource } from '../core/ressource';
import { StocksService } from '../core/stocks.service';
import { BadgeStock } from '../ui/badge-stock';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';
import { GrapheStock, type PointStock } from '../ui/graphe-stock';

type FiltresDetailStock = { date: string };

/** Tableaux quadrillés, comme les tableaux produit de la fiche site. */
const TH = 'border-r border-border bg-muted text-center font-normal text-primary last:border-r-0';
const TD = 'border-r border-border text-center last:border-r-0';

/**
 * Détail d'un couple site × produit du suivi des stocks (ticket 03) : courbe
 * du stock projeté jour par jour, faits connus à la date choisie (stocks
 * comptés, réceptions, photos mSupply) et rappel du calcul de la CMM.
 */
@Component({
  selector: 'dqa-detail-stock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Coquille, BarreAttente, BadgeStock, GrapheStock, HlmInput, HlmSkeletonImports, HlmTableImports],
  template: `
    <dqa-coquille />
    <main class="mx-auto w-full max-w-vue py-6">
      <a class="text-sm text-primary hover:underline" routerLink="/stocks" [queryParams]="retour()">Retour au suivi des stocks</a>

      @switch (res.phase()) {
        @case ('squelette') {
          <div class="mt-4 flex flex-col gap-3">
            <div hlmSkeleton class="h-9 w-96"></div>
            <div hlmSkeleton class="h-80 w-full"></div>
          </div>
        }
        @case ('echec') {
          <p class="mt-4 text-sm text-muted-foreground">Aucun stock compté connu à cette date pour ce site et ce produit.</p>
        }
        @default {
          @if (res.valeur(); as d) {
            <div class="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 class="text-2xl font-bold tracking-tight">{{ d.ligne.libelle }}</h1>
                <p class="mt-1 text-sm text-muted-foreground">
                  <a class="text-primary hover:underline" [routerLink]="['/sites', d.ligne.siteId]">{{ d.ligne.siteNom }}</a>
                  · {{ d.ligne.district ?? 'District non renseigné' }} · {{ d.ligne.programmeNom ?? 'Programme non renseigné' }}
                  · <span class="font-mono">{{ d.ligne.produitCode }}</span>
                </p>
              </div>
              <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Date
                <input hlmInput type="date" class="w-44" [ngModel]="d.date" (ngModelChange)="majDate($event)" />
              </label>
            </div>

            <div [attr.aria-busy]="res.enCours()" class="mt-4">
              <dqa-barre-attente [actif]="res.enCours()" />

              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div class="rounded-lg border border-border bg-card p-3 shadow-xs">
                  <div class="text-xs text-muted-foreground">Statut au {{ dateFr(d.date) }}</div>
                  <div class="mt-1"><dqa-badge-stock [statut]="d.ligne.statut" /></div>
                </div>
                @if (d.ligne.cmm; as c) {
                  @if (c.calculable) {
                    <div class="rounded-lg border border-border bg-card p-3 shadow-xs">
                      <div class="text-xs text-muted-foreground">Stock projeté</div>
                      <div class="text-2xl font-bold tabular-nums">{{ nombre(c.stockProjete) }}</div>
                    </div>
                    <div class="rounded-lg border border-border bg-card p-3 shadow-xs">
                      <div class="text-xs text-muted-foreground">Couverture</div>
                      <div class="text-2xl font-bold tabular-nums">{{ nombre(c.couvertureJours) }} j</div>
                      <div class="text-xs text-muted-foreground">signalée à {{ d.seuilCouvertureJours }} j ou moins</div>
                    </div>
                    <div class="rounded-lg border border-border bg-card p-3 shadow-xs">
                      <div class="text-xs text-muted-foreground">Rupture prévue</div>
                      <div class="text-2xl font-bold tabular-nums">
                        @if (d.ligne.statut === 'en_rupture') { déjà à 0 }
                        @else if (c.dateRupture) { {{ dateFr(c.dateRupture) }} }
                        @else { <span class="text-base font-normal text-muted-foreground">au-delà de 90 jours</span> }
                      </div>
                    </div>
                    <div class="rounded-lg border border-border bg-card p-3 shadow-xs">
                      <div class="text-xs text-muted-foreground">CMM reconstituée / déclarée</div>
                      <div class="text-2xl font-bold tabular-nums">{{ nombre(c.cmmReconstituee) }} <span class="text-base font-normal text-muted-foreground">/ {{ nombre(c.cmmDeclaree) }}</span></div>
                      <div class="text-xs text-muted-foreground">{{ duree(c.jours, c.nbMois) }}</div>
                    </div>
                  } @else {
                    <div class="rounded-lg border border-border bg-card p-3 shadow-xs sm:col-span-4">
                      <div class="text-sm text-muted-foreground">CMM {{ raisonNonCalculable(c.raison) }} : pas de projection possible.</div>
                    </div>
                  }
                }
              </div>

              <section class="mt-6 rounded-lg border border-border bg-card p-4 shadow-xs">
                <h2 class="text-base font-semibold">Stock jour par jour</h2>
                <p class="text-xs text-muted-foreground">
                  Projection depuis le stock compté le {{ dateFr(d.ligne.dateFin) }} : réceptions connues ajoutées, CMM reconstituée
                  retirée chaque jour, jamais sous 0. Au-delà du {{ dateFr(d.date) }}, aucune réception n'est supposée.
                </p>
                <dqa-graphe-stock class="mt-2 block" [date]="d.date" [projection]="projection()" [inventaires]="inventaires()"
                                  [photos]="photos()" [receptions]="receptions()" [rupture]="rupture()" />
              </section>

              @if (d.ligne.cmm; as c) {
                @if (c.calculable) {
                  <section class="mt-6">
                    <h2 class="text-base font-semibold">Calcul de la CMM</h2>
                    <div hlmTableContainer class="mt-2">
                      <table hlmTable class="border border-border">
                        <thead hlmTHead>
                          <tr hlmTr>
                            <th hlmTh class="${TH}">Début ({{ dateFr(c.dateDebut) }})</th>
                            <th hlmTh class="${TH}">Réceptions</th>
                            <th hlmTh class="${TH}">Fin ({{ dateFr(d.ligne.dateFin) }})</th>
                            <th hlmTh class="${TH}">Sorties reconstituées</th>
                            <th hlmTh class="${TH}">Sorties déclarées</th>
                            <th hlmTh class="${TH}">Jours</th>
                            <th hlmTh class="${TH}">CMM reconstituée</th>
                            <th hlmTh class="${TH}">CMM déclarée</th>
                          </tr>
                        </thead>
                        <tbody hlmTBody>
                          <tr hlmTr>
                            <td hlmTd class="${TD} tabular-nums">{{ nombre(c.stockDebut) }}</td>
                            <td hlmTd class="${TD} tabular-nums">{{ nombre(c.receptions) }}</td>
                            <td hlmTd class="${TD} tabular-nums">{{ nombre(d.ligne.stockFin) }}</td>
                            <td hlmTd class="${TD} tabular-nums">{{ nombre(c.sortiesReconstituees) }}</td>
                            <td hlmTd class="${TD} tabular-nums">{{ nombre(c.declaree) }}</td>
                            <td hlmTd class="${TD} tabular-nums">{{ c.jours }}</td>
                            <td hlmTd class="${TD} tabular-nums font-medium">{{ nombre(c.cmmReconstituee) }}</td>
                            <td hlmTd class="${TD} tabular-nums">{{ nombre(c.cmmDeclaree) }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p class="mt-1 text-xs text-muted-foreground">
                      Sorties reconstituées = début + réceptions - fin ; CMM = sorties ÷ jours × 30,4. L'écart entre les deux CMM
                      mesure les pertes non saisies.
                    </p>
                  </section>
                }
              }

              @if (d.ligne.photo; as ph) {
                <p class="mt-4 text-sm">
                  Photo mSupply du {{ dateFr(ph.date) }} : <b class="tabular-nums">{{ nombre(ph.stockMsupply) }}</b>
                  @if (ph.stockProjete !== null) {
                    pour un stock projeté de <b class="tabular-nums">{{ nombre(ph.stockProjete) }}</b>
                    (écart <b class="tabular-nums">{{ ecartPhoto(ph.stockProjete, ph.stockMsupply) }}</b>).
                  }
                </p>
              }
            </div>
          }
        }
      }
    </main>
  `,
})
export class DetailStockPage {
  private readonly service = inject(StocksService);

  readonly siteId = input.required<string>();
  readonly produitId = input.required<string>();

  protected readonly dateFr = dateFr;
  protected readonly nombre = nombre;
  protected readonly duree = duree;
  protected readonly ecartPhoto = ecartPhoto;
  protected readonly raisonNonCalculable = raisonNonCalculable;

  protected readonly res = ressource<DetailStock | null, FiltresDetailStock>({
    charger: (f) => this.service.detail(this.siteId(), this.produitId(), f.date),
    germe: null,
    filtresInitiaux: { date: '' },
  });

  protected readonly projection = computed<PointStock[]>(() =>
    (this.res.valeur()?.serie ?? []).flatMap((p) => (p.stockProjete === null ? [] : [{ jour: p.jour, valeur: p.stockProjete }])));
  protected readonly inventaires = computed<PointStock[]>(() =>
    (this.res.valeur()?.inventaires ?? []).map((i) => ({ jour: i.date, valeur: i.compte })));
  protected readonly photos = computed<PointStock[]>(() =>
    (this.res.valeur()?.photos ?? []).map((p) => ({ jour: p.date, valeur: p.stockMsupply })));
  protected readonly receptions = computed<PointStock[]>(() =>
    (this.res.valeur()?.receptions ?? []).map((r) => ({ jour: r.jour, valeur: r.quantite })));
  protected readonly rupture = computed(() => {
    const l = this.res.valeur()?.ligne;
    return l && l.cmm.calculable && l.statut !== 'en_rupture' ? l.cmm.dateRupture : null;
  });
  /** Le retour garde la date choisie. */
  protected readonly retour = computed(() => (this.res.filtres().date ? { date: this.res.filtres().date } : {}));

  constructor() {
    // les entrées de route sont posées après la construction : premier chargement ici
    effect(() => {
      this.siteId();
      this.produitId();
      untracked(() => void this.res.demarrer());
    });
  }

  protected majDate(valeur: unknown): void {
    this.res.definir({ date: versChaine(valeur) });
  }
}
