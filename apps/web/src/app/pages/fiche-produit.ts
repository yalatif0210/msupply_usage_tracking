import { ChangeDetectionStrategy, Component, type OnInit, inject, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { FicheProduitMois } from '@dqa/contracts';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSkeleton } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { VALEUR_ABSENTE, versChaine } from '../core/affichage';
import { ressource } from '../core/ressource';
import { SitesService } from '../core/sites.service';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';

type FiltresProduit = {
  mois: string;
  programmeId: string;
};

/**
 * Fiche produit-mois : URL partageable montrant, pour un produit traceur d'un
 * site et un mois, toutes les grandeurs brutes derrière les piliers P3..P6
 * (stock théorique / compté, photos de stock, réceptions, dispensations,
 * ajustements, consommation reconstituée vs déclarée). Sélecteur de mois
 * synchronisé à l'URL sans remontage (`core/ressource`).
 */
@Component({
  selector: 'dqa-fiche-produit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DecimalPipe],
  imports: [
    FormsModule,
    RouterLink,
    DecimalPipe,
    DatePipe,
    Coquille,
    BarreAttente,
    HlmSkeleton,
    ...HlmSelectImports,
    ...HlmTableImports,
  ],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-5xl px-4 py-6">
      <a [routerLink]="['/sites', id()]" class="text-sm text-primary hover:underline">← Retour à la fiche site</a>

      @switch (res.phase()) {
      @case ('squelette') {
        <div class="mt-6 space-y-4">
          <hlm-skeleton class="h-8 w-72" />
          <hlm-skeleton class="h-40 w-full" />
          <hlm-skeleton class="h-40 w-full" />
        </div>
      }
      @case ('echec') {
        <p class="mt-6 text-muted-foreground">
          La fiche produit n'a pas pu être chargée. Le produit n'est peut-être pas un traceur, ou le site est hors périmètre.
        </p>
      }
      @default {
      @if (res.valeur(); as f) {
        <header class="mt-2">
          <h1 class="text-2xl font-bold tracking-tight">{{ f.produit.libelle ?? f.produit.code }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ f.produit.code }} · {{ f.site.siteNom }} · {{ f.site.district ?? absent }} · {{ f.site.region ?? absent }}
          </p>
        </header>

        <div class="mt-5 flex flex-wrap items-end gap-6" [attr.aria-busy]="res.enCours() ? 'true' : null">
          <div class="grid gap-1.5">
            <span class="text-sm font-medium">Mois affiché</span>
            @if (f.moisDisponibles.length > 0) {
              <hlm-select
                class="w-40"
                [ngModel]="res.filtres().mois"
                (ngModelChange)="res.definir({ mois: versChaine($event) })"
              >
                <hlm-select-trigger class="w-40"><hlm-select-value placeholder="n/d" /></hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  @for (m of f.moisDisponibles; track m) {
                    <hlm-select-item [value]="m">{{ m }}</hlm-select-item>
                  }
                </hlm-select-content>
              </hlm-select>
            } @else {
              <span class="text-sm text-muted-foreground">{{ f.moisPaqd ?? absent }}</span>
            }
          </div>
        </div>
        <dqa-barre-attente [actif]="res.enCours()" />

        @if (f.moisPaqd === null) {
          <p class="mt-6 text-muted-foreground">Aucun mois mesuré pour ce site.</p>
        } @else {
          @if (f.reimporteDepuisLeGel) {
            <p class="mt-4 text-sm text-alerte-texte">
              Données du core modifiées depuis le gel du mois : le détail ci-dessous peut différer des comptes figés.
            </p>
          }

          <!-- Stock -->
          <section class="mt-8">
            <h2 class="text-lg font-semibold tracking-tight">Stock</h2>
            <h3 class="mt-3 text-sm font-medium text-muted-foreground">Inventaires finalisés du mois</h3>
            @if (f.inventaires.length > 0) {
              <div hlmTableContainer class="mt-2">
                <table hlmTable>
                  <thead hlmTHead>
                    <tr hlmTr>
                      <th hlmTh>Date</th>
                      <th hlmTh>Statut</th>
                      <th hlmTh class="text-right">Stock théorique (mSupply)</th>
                      <th hlmTh class="text-right">Stock physique compté</th>
                      <th hlmTh class="text-right">Écart (compté moins théorique)</th>
                    </tr>
                  </thead>
                  <tbody hlmTBody>
                    @for (iv of f.inventaires; track $index) {
                      <tr hlmTr>
                        <td hlmTd class="tabular-nums">{{ iv.date }}</td>
                        <td hlmTd>{{ iv.statut ?? absent }}</td>
                        <td hlmTd class="text-right tabular-nums">{{ iv.theorique === null ? absent : (iv.theorique | number: '1.0-3') }}</td>
                        <td hlmTd class="text-right tabular-nums">{{ iv.comptee === null ? absent : (iv.comptee | number: '1.0-3') }}</td>
                        <td hlmTd class="text-right tabular-nums">{{ iv.ecart === null ? absent : signe(iv.ecart) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="mt-2 text-sm text-muted-foreground">Aucun inventaire finalisé portant ce produit ce mois.</p>
            }

            <h3 class="mt-5 text-sm font-medium text-muted-foreground">Photos de stock du mois</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              Stock disponible dans mSupply le jour où la DAP a lancé l'extraction : une photo par extraction,
              datée de ce jour, indépendante des inventaires. Elle n'entre dans aucun pilier.
            </p>
            @if (f.snapshots.length > 0) {
              <ul class="mt-2 space-y-0.5 text-sm">
                @for (s of f.snapshots; track s.datePhoto) {
                  <li class="tabular-nums">
                    {{ s.datePhoto | date: 'dd/MM/yyyy' }} (jour d'extraction) : {{ s.quantiteDisponible | number: '1.0-3' }} disponibles
                  </li>
                }
              </ul>
            } @else {
              <p class="mt-2 text-sm text-muted-foreground">Aucune photo de stock ce mois.</p>
            }
          </section>

          <!-- Consommation -->
          <section class="mt-8">
            <h2 class="text-lg font-semibold tracking-tight">Consommation</h2>
            @if (f.consommation.reconstituee === null) {
              <p class="mt-2 text-sm text-muted-foreground">
                Écart consommation non évaluable ce mois : il faut un inventaire de
                clôture et une borne d'ouverture (dernier inventaire du mois
                précédent, ou deux inventaires dans le mois).
              </p>
            } @else {
              <dl class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div class="rounded-lg border border-border p-3">
                  <dt class="text-xs text-muted-foreground">Consommation reconstituée</dt>
                  <dd class="mt-1 text-2xl font-semibold tabular-nums">{{ nb(f.consommation.reconstituee) }}</dd>
                  <dd class="mt-1 text-xs text-muted-foreground">stock début plus réceptions moins stock fin</dd>
                </div>
                <div class="rounded-lg border border-border p-3">
                  <dt class="text-xs text-muted-foreground">Consommation déclarée</dt>
                  <dd class="mt-1 text-2xl font-semibold tabular-nums">{{ nb(f.consommation.declaree) }}</dd>
                  <dd class="mt-1 text-xs text-muted-foreground">somme des dispensations entre les deux inventaires bornants</dd>
                </div>
                <div class="rounded-lg border border-border p-3">
                  <dt class="text-xs text-muted-foreground">Écart (déclarée moins reconstituée)</dt>
                  <dd class="mt-1 text-2xl font-semibold tabular-nums">
                    {{ f.consommation.ecart === null ? absent : signe(f.consommation.ecart) }}
                  </dd>
                </div>
              </dl>
              <p class="mt-3 text-sm tabular-nums">
                Stock au premier inventaire bornant : {{ nb(f.stockDebut) }} ·
                Stock au dernier inventaire bornant : {{ nb(f.stockFin) }}
              </p>
            }

            <h3 class="mt-5 text-sm font-medium text-muted-foreground">Réceptions du mois</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              Factures fournisseur finalisées (réception admise), datées de leur finalisation.
            </p>
            @if (f.receptions.length > 0) {
              <ul class="mt-2 space-y-0.5 text-sm">
                @for (r of f.receptions; track $index) {
                  <li class="tabular-nums">{{ r.date | date: 'dd/MM/yyyy' }} : {{ r.quantite | number: '1.0-3' }}</li>
                }
              </ul>
            } @else {
              <p class="mt-2 text-sm text-muted-foreground">Aucune facture fournisseur finalisée ce mois.</p>
            }
          </section>

          <!-- Dispensations -->
          <section class="mt-8">
            <h2 class="text-lg font-semibold tracking-tight">Dispensations</h2>
            <p class="mt-3 text-sm tabular-nums">
              Total dispensé : {{ f.dispensations.total | number: '1.0-3' }} ·
              Jours avec au moins une dispensation : {{ f.dispensations.nbJours }}
            </p>
          </section>

          <!-- Ajustements -->
          <section class="mt-8">
            <h2 class="text-lg font-semibold tracking-tight">Ajustements</h2>
            @if (f.ajustements.length > 0) {
              <div hlmTableContainer class="mt-3">
                <table hlmTable>
                  <thead hlmTHead>
                    <tr hlmTr>
                      <th hlmTh>Date</th>
                      <th hlmTh class="text-right">Quantité</th>
                      <th hlmTh>Sens</th>
                    </tr>
                  </thead>
                  <tbody hlmTBody>
                    @for (aj of f.ajustements; track $index) {
                      <tr hlmTr>
                        <td hlmTd class="tabular-nums">{{ aj.date }}</td>
                        <td hlmTd class="text-right tabular-nums">{{ aj.quantite | number: '1.0-3' }}</td>
                        <td hlmTd>{{ aj.sens === 'positif' ? 'positif' : 'négatif' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="mt-3 text-sm text-muted-foreground">Aucun ajustement ce mois.</p>
            }
          </section>

          @if (f.calculeLe) {
            <p class="mt-8 text-xs text-muted-foreground tabular-nums">Comptes du mois gelés le {{ f.calculeLe | date: "dd/MM/yyyy 'à' HH:mm" }}</p>
          }
        }
      } @else {
        <p class="mt-6 text-muted-foreground">Produit ou site inconnu.</p>
      }
      }
      }
    </main>
  `,
})
export class FicheProduitPage implements OnInit {
  readonly id = input.required<string>();
  readonly code = input.required<string>();

  protected readonly absent = VALEUR_ABSENTE;
  protected readonly versChaine = versChaine;

  private readonly service = inject(SitesService);
  private readonly decimal = inject(DecimalPipe);

  protected readonly res = ressource<FicheProduitMois | null, FiltresProduit>({
    charger: (f) =>
      this.service.ficheProduitMois(this.id(), this.code(), {
        mois: f.mois || undefined,
        programmeId: f.programmeId || undefined,
      }),
    germe: null,
    filtresInitiaux: { mois: '', programmeId: '' },
    // aligne le sélecteur sur le mois réellement servi, sans recharger
    apresChargement: (v) => (v && v.moisPaqd ? { mois: v.moisPaqd } : undefined),
  });

  // `ngOnInit` (pas le constructeur) : les inputs de route `id` / `code` ne sont
  // liés qu'après la construction. Les lire trop tôt lève NG0950.
  ngOnInit(): void {
    void this.res.demarrer();
  }

  /** Nombre formaté, ou `n/d` si nul. */
  protected nb(v: number | null): string {
    return v === null ? this.absent : (this.decimal.transform(v, '1.0-3') ?? this.absent);
  }

  /** Nombre signé (le `+` explicite ; le `-` vient du formatage). */
  protected signe(v: number): string {
    const s = this.decimal.transform(v, '1.0-3') ?? String(v);
    return v > 0 ? `+${s}` : s;
  }
}
