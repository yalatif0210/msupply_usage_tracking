import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CODE_PILIER,
  LIBELLES_PILIER,
  libelleSousComposante,
  PILIER_DE_SOUS_COMPOSANTE,
  PILIERS,
  SOUS_COMPOSANTES_DU_PILIER,
  type DetailPilier,
  type DetailPilierP1,
  type DetailPilierP2,
  type DetailPilierP3,
  type DetailPilierP4,
  type DetailPilierP6,
  type DetailSite,
  type HistoriqueSite,
  type Pilier,
  type Programme,
  type RaisonExclusionConso,
  type SousComposante,
  type SousComposanteBref,
} from '@dqa/contracts';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSkeleton } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { VALEUR_ABSENTE, versChaine } from '../core/affichage';
import { ressource } from '../core/ressource';
import { SitesService } from '../core/sites.service';
import { BadgeClassification } from '../ui/badge-classification';
import { BadgeStatut } from '../ui/badge-statut';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';
import { GrapheCourbe, type SerieGrapheCourbe } from '../ui/graphe-courbe';
import { GrapheRadar, type AxeGrapheRadar } from '../ui/graphe-radar';
import { construireCalendrierP3, type CalendrierP3 } from './calendrier-p3';
import { grouperProduitsP4P5 } from './groupes-produits-p4p5';

type Granularite = 'composite' | 'pilier' | 'sousComposante';
type ModeRadar = '6' | '10';
type TriSc = 'sousComposante' | 'pilier' | 'valeur' | 'seuil' | 'ecart' | 'tauxAtteinte' | 'statut';

type FiltresFiche = {
  programme: string;
  de: string;
  a: string;
  /** Mois affiché explicitement choisi ; vide = suit la borne haute de `a`/l'historique. */
  mois: string;
}

interface DonneesFiche {
  detail: DetailSite | null;
  historique: HistoriqueSite | null;
}

/** Nombre de forces / faiblesses saillantes listées sous le radar. */
const NB_SAILLANTS = 3;
/** Fenêtre du préréglage « 12 derniers mois » (bornes incluses). */
const MOIS_FENETRE_ANNEE = 11;

const LIBELLE_GRANULARITE: Record<Granularite, string> = {
  composite: 'Score composite',
  pilier: 'Par pilier',
  sousComposante: 'Par sous-composante',
};

/** `AAAA-MM` moins `n` mois, sur le calendrier grégorien. */
function reculerMois(mois: string, n: number): string {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(a ?? 0, (m ?? 1) - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'dqa-detail-site',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    DecimalPipe,
    Coquille,
    BadgeStatut,
    BadgeClassification,
    BarreAttente,
    GrapheRadar,
    GrapheCourbe,
    HlmBadge,
    HlmButton,
    HlmSkeleton,
    ...HlmCardImports,
    ...HlmSelectImports,
    ...HlmTableImports,
  ],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-6xl px-4 py-6">
      <a routerLink="/sites" class="text-sm text-primary hover:underline">← Tous les sites</a>

      @switch (res.phase()) {
      @case ('squelette') {
        <div class="mt-6 space-y-4">
          <hlm-skeleton class="h-8 w-64" />
          <hlm-skeleton class="h-28 w-full" />
          <hlm-skeleton class="h-64 w-full" />
        </div>
      }
      @case ('echec') {
        <p class="mt-6 text-muted-foreground">La fiche n'a pas pu être chargée. Réessayez.</p>
      }
      @default {
      @if (res.valeur().detail; as d) {
        <h1 class="mt-2 text-2xl font-bold tracking-tight">{{ d.site.siteNom }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ d.site.district ?? absent }} · {{ d.site.region ?? absent }} · {{ d.site.typeStructure ?? absent }}
        </p>

        <div class="mt-6 flex flex-wrap items-end gap-6">
          <div class="grid gap-1.5">
            <span class="text-sm font-medium">Programme</span>
            <hlm-select
              class="w-64"
              [itemToString]="libelleProgramme"
              [ngModel]="res.filtres().programme"
              (ngModelChange)="res.definir({ programme: versChaine($event) })"
            >
              <hlm-select-trigger class="w-64">
                <hlm-select-value placeholder="Tous programmes" />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                <hlm-select-item value="">Tous programmes</hlm-select-item>
                @for (p of programmes(); track p.programmeId) {
                  <hlm-select-item [value]="p.programmeId">{{ p.programmeNom }}</hlm-select-item>
                }
              </hlm-select-content>
            </hlm-select>
          </div>
          <div class="grid gap-1.5">
            <span class="text-sm font-medium">Mois affiché</span>
            <hlm-select
              class="w-40"
              [ngModel]="res.filtres().mois || d.moisPaqd"
              (ngModelChange)="res.definir({ mois: versChaine($event) })"
            >
              <hlm-select-trigger class="w-40"><hlm-select-value placeholder="n/d" /></hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                @for (m of moisDisponibles(); track m) {
                  <hlm-select-item [value]="m">{{ m }}</hlm-select-item>
                }
              </hlm-select-content>
            </hlm-select>
          </div>
          @if (!d.moisClos) {
            <span
              hlmBadge
              variant="outline"
              class="mb-2"
              title="Le mois n'est pas encore terminé (délai de réquisition non expiré) : ce score peut encore évoluer."
            >
              Mois en cours · score provisoire
            </span>
          }
        </div>

        @if (d.piliers.length === 0) {
          <p class="mt-6 text-muted-foreground">Aucune mesure pour ce site. Le premier import contenant ce site alimentera l'écran.</p>
        } @else {
          <div hlmCard class="mt-6">
            <div hlmCardContent class="flex flex-wrap items-center gap-6">
              <div class="flex items-baseline gap-2">
                <span class="text-5xl font-bold leading-none tabular-nums">{{ d.scoreComposite === null ? absent : (d.scoreComposite | number: '1.0-1') }}</span>
                <span class="text-lg text-muted-foreground">/ 100</span>
              </div>
              <div class="grid gap-1.5">
                <dqa-badge-classification [classification]="d.classification" />
                @if (d.piliersCouverts < d.piliersTotal) {
                  <span class="text-sm text-muted-foreground">
                    Score calculé sur {{ d.piliersCouverts }} pilier{{ d.piliersCouverts > 1 ? 's' : '' }} sur {{ d.piliersTotal }}
                  </span>
                }
              </div>
              <div class="grid gap-1.5">
                <span class="text-sm font-medium text-muted-foreground">Progression (score composite)</span>
                @if (progressionComposite(); as p) {
                  <span class="text-sm" [class]="p.classe">{{ p.texte }}</span>
                } @else {
                  <span class="text-sm text-muted-foreground">{{ absent }}</span>
                }
              </div>
            </div>
          </div>

          <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (pil of d.piliers; track pil.pilier) {
              <div hlmCard>
                <div hlmCardHeader>
                  <h2 hlmCardTitle>{{ pil.pilier }} · {{ pil.libelle }}</h2>
                  <p class="text-sm text-muted-foreground tabular-nums">
                    Score du pilier {{ pil.score === null ? absent : (pil.score | number: '1.0-0') }} / 100
                    <span class="text-xs">· poids {{ pil.poids | number: '1.0-0' }} %</span>
                  </p>
                </div>
                <div hlmCardContent class="space-y-3">
                  @for (sc of pil.sousComposantes; track sc.sousComposante) {
                    <div class="flex items-start gap-3">
                      <dqa-badge-statut [statut]="sc.statut" />
                      <div>
                        <div class="text-sm font-medium">{{ sc.libelle }}</div>
                        <div class="text-2xl leading-none tabular-nums">
                          {{ sc.valeur === null ? absent : (sc.valeur | number: '1.0-1') }} <span class="text-sm text-muted-foreground">%</span>
                        </div>
                        <div class="mt-1 text-xs text-muted-foreground">seuil {{ sc.seuil === null ? absent : (sc.seuil | number: '1.0-1') }} %</div>
                        @if (sc.raison) { <div class="mt-1 text-xs text-alerte-texte">{{ sc.raison }}</div> }
                      </div>
                    </div>
                  }
                  @if (pil.comptesBruts.length) {
                    <dl class="space-y-1 border-t border-border pt-3 text-xs">
                      @for (cb of pil.comptesBruts; track cb.mesure) {
                        <div class="flex items-baseline justify-between gap-3">
                          <dt class="text-muted-foreground">{{ cb.libelle }}</dt>
                          <dd class="tabular-nums font-medium">
                            {{ cb.realise ?? absent }} / {{ cb.attendu }}
                            @if (cb.aLHeure !== null) {
                              <span class="text-muted-foreground">· {{ cb.aLHeure }} à l'heure</span>
                            }
                          </dd>
                        </div>
                      }
                    </dl>
                  }

                  @if (pil.pilier === 'P4' || pil.pilier === 'P5') {
                    <div class="border-t border-border pt-3 text-xs">
                      <button type="button" class="cursor-pointer text-primary hover:underline" (click)="ouvrirTableauP4P5()">
                        Voir le tableau P4 · P5 par produit traceur
                      </button>
                    </div>
                  }

                  @if (pil.pilier === 'P1' || pil.pilier === 'P2') {
                    <details class="border-t border-border pt-3 text-xs" #dt (toggle)="basculerPilier(pil.pilier, dt.open)">
                      <summary class="cursor-pointer text-primary">Détail ligne à ligne</summary>
                      <div class="mt-2" [attr.aria-busy]="chargePilier(pil.pilier) ? 'true' : null">
                        <dqa-barre-attente [actif]="chargePilier(pil.pilier)" />

                        @if (p1De(pil.pilier); as dp) {
                          @if (dp.reimporteDepuisLeGel) {
                            <p class="mt-2 text-alerte-texte">Données du core modifiées depuis le gel du mois : le détail ci-dessous peut différer des comptes figés.</p>
                          }
                          <div class="mt-2 space-y-3">
                            <div>
                              <h3 class="font-medium">Programmes gérés</h3>
                              <ul class="mt-1 space-y-0.5">
                                @for (pg of programmesTries(dp.programmesGeres); track pg.programme) {
                                  <li class="flex items-baseline justify-between gap-3">
                                    <span>{{ pg.programme }}</span>
                                    <span class="tabular-nums text-muted-foreground">
                                      inventaire {{ pg.aInventaire ? 'oui' : 'non' }} · réquisition {{ pg.aRequisition ? 'oui' : 'non' }}
                                    </span>
                                  </li>
                                } @empty {
                                  <li class="text-muted-foreground">aucun programme géré déclaré</li>
                                }
                              </ul>
                            </div>
                            <div>
                              <h3 class="font-medium">Inventaires finalisés ({{ dp.inventaires.length }})</h3>
                              <ul class="mt-1 space-y-0.5">
                                @for (iv of dp.inventaires; track $index) {
                                  <li class="tabular-nums">{{ iv.date }} · {{ iv.programme }}</li>
                                } @empty {
                                  <li class="text-muted-foreground">aucun</li>
                                }
                              </ul>
                            </div>
                            <div>
                              <h3 class="font-medium">Réquisitions couvrant le mois ({{ dp.requisitions.length }})</h3>
                              <ul class="mt-1 space-y-0.5">
                                @for (rq of dp.requisitions; track $index) {
                                  <li class="tabular-nums">{{ rq.programme }} · soumise {{ rq.dateSoumission ?? absent }}</li>
                                } @empty {
                                  <li class="text-muted-foreground">aucune</li>
                                }
                              </ul>
                            </div>
                            <div>
                              <h3 class="font-medium">Réceptions / factures ({{ dp.receptions.length }} / {{ dp.factures.length }})</h3>
                              <ul class="mt-1 space-y-0.5">
                                @for (rc of dp.receptions; track $index) {
                                  <li class="tabular-nums">réception {{ rc.date }}{{ rc.reference ? ' · ' + rc.reference : '' }}</li>
                                }
                                @for (fa of dp.factures; track $index) {
                                  <li class="tabular-nums">facture {{ fa.date }}{{ fa.reference ? ' · ' + fa.reference : '' }}</li>
                                }
                                @if (!dp.receptions.length && !dp.factures.length) {
                                  <li class="text-muted-foreground">aucune</li>
                                }
                              </ul>
                            </div>
                          </div>
                        }

                        @if (p2De(pil.pilier); as dp) {
                          @if (dp.reimporteDepuisLeGel) {
                            <p class="mt-2 text-alerte-texte">Données du core modifiées depuis le gel du mois : le détail ci-dessous peut différer des comptes figés.</p>
                          }
                          <div class="mt-2 space-y-3">
                            <div>
                              <h3 class="font-medium">Inventaires finalisés ({{ dp.inventaires.length }})</h3>
                              <ul class="mt-1 space-y-0.5">
                                @for (iv of invP2Tries(dp.inventaires); track $index) {
                                  <li class="tabular-nums">
                                    {{ iv.date }} · {{ iv.programme }} · {{ iv.dansLes3DerniersJours ? 'dans les 3 derniers jours' : 'hors des 3 derniers jours' }}
                                  </li>
                                } @empty {
                                  <li class="text-muted-foreground">aucun</li>
                                }
                              </ul>
                            </div>
                            <div>
                              <h3 class="font-medium">Réquisitions ({{ dp.requisitions.length }})</h3>
                              <ul class="mt-1 space-y-0.5">
                                @for (rq of reqP2Tries(dp.requisitions); track $index) {
                                  <li class="tabular-nums">
                                    {{ rq.programme }} · soumise {{ rq.dateSoumission ?? absent }} · limite {{ rq.dateLimite }} · {{ rq.aLHeure ? "à l'heure" : 'en retard' }}
                                  </li>
                                } @empty {
                                  <li class="text-muted-foreground">aucune</li>
                                }
                              </ul>
                            </div>
                          </div>
                        }
                      </div>
                    </details>
                  }

                  @if (pil.pilier === 'P3' || pil.pilier === 'P6') {
                    <details class="border-t border-border pt-3 text-xs" #dt (toggle)="basculerPilier(pil.pilier, dt.open)">
                      <summary class="cursor-pointer text-primary">Détail ligne à ligne</summary>
                      <div class="mt-2" [attr.aria-busy]="chargePilier(pil.pilier) ? 'true' : null">
                        <dqa-barre-attente [actif]="chargePilier(pil.pilier)" />

                        @if (p3De(pil.pilier); as dp) {
                          @if (dp.reimporteDepuisLeGel) {
                            <p class="mt-2 text-alerte-texte">Données du core modifiées depuis le gel du mois : le détail ci-dessous peut différer des comptes figés.</p>
                          }
                          @if (dp.reponseZone; as rz) {
                            <p class="mt-2 text-muted-foreground tabular-nums">
                              {{ rz.nbRepondues }} / {{ rz.nbRequisitions }} réquisitions de la zone (couvrant {{ rz.moisCouvert }})
                              servies par une distribution dans {{ d.moisPaqd }}
                            </p>
                            @if (rz.nbRequisitions === 0) {
                              <p class="mt-1 text-muted-foreground">Aucune réquisition de la zone à évaluer ce mois.</p>
                            }
                          }
                          @if (calendrierP3(dp); as cal) {
                            <p class="mt-2 text-muted-foreground tabular-nums">
                              {{ cal.nbJoursAvecSortie }} / {{ cal.nbJours }} jours avec au moins une sortie
                              ({{ (cal.nbJoursAvecSortie * 100 / cal.nbJours) | number: '1.0-0' }} %)
                            </p>
                            <div class="mt-2 space-y-1">
                              @for (semaine of cal.semaines; track $index) {
                                <div class="flex gap-1">
                                  @for (cellule of semaine; track $index) {
                                    @if (cellule) {
                                      <span
                                        class="flex size-7 items-center justify-center rounded-xs border text-xs leading-none tabular-nums"
                                        [class.bg-primary]="cellule.aSortie"
                                        [class.text-primary-foreground]="cellule.aSortie"
                                        [class.border-primary]="cellule.aSortie"
                                        [class.border-border]="!cellule.aSortie"
                                        [class.text-muted-foreground]="!cellule.aSortie"
                                        [attr.title]="cellule.jour + (cellule.aSortie ? ' · sortie' : ' · sans sortie')"
                                      >{{ cellule.numero }}</span>
                                    } @else {
                                      <span class="size-7"></span>
                                    }
                                  }
                                </div>
                              }
                            </div>
                            <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                              <span class="inline-flex items-center gap-1">
                                <span class="inline-block size-3 rounded-xs bg-primary border border-primary"></span>
                                jour avec au moins une sortie
                              </span>
                              <span class="inline-flex items-center gap-1">
                                <span class="inline-block size-3 rounded-xs border border-border"></span>
                                jour sans sortie
                              </span>
                            </p>
                          }
                        }

                        @if (p6De(pil.pilier); as dp) {
                          @if (dp.reimporteDepuisLeGel) {
                            <p class="mt-2 text-alerte-texte">Données du core modifiées depuis le gel du mois : le détail ci-dessous peut différer des comptes figés.</p>
                          }
                          <p class="mt-2 text-muted-foreground tabular-nums">
                            {{ dp.ajustements.length }} ajustement{{ dp.ajustements.length > 1 ? 's' : '' }} sur {{ dp.nbMouvements }} mouvement{{ dp.nbMouvements > 1 ? 's' : '' }}
                          </p>
                          @if (dp.ajustements.length) {
                            <div hlmTableContainer class="mt-2">
                              <table hlmTable>
                                <thead hlmTHead>
                                  <tr hlmTr>
                                    <th hlmTh>Date</th>
                                    <th hlmTh>Produit</th>
                                    <th hlmTh class="text-right">Quantité</th>
                                    <th hlmTh>Sens</th>
                                  </tr>
                                </thead>
                                <tbody hlmTBody>
                                  @for (aj of dp.ajustements; track $index) {
                                    <tr hlmTr>
                                      <td hlmTd class="tabular-nums">{{ aj.date }}</td>
                                      <td hlmTd>{{ aj.produit }}</td>
                                      <td hlmTd class="text-right tabular-nums">{{ aj.quantite | number: '1.0-3' }}</td>
                                      <td hlmTd>{{ aj.sens === 'positif' ? 'positif' : 'négatif' }}</td>
                                    </tr>
                                  }
                                </tbody>
                              </table>
                            </div>
                          } @else {
                            <p class="mt-1 text-muted-foreground">Aucun ajustement ce mois.</p>
                          }
                        }
                      </div>
                    </details>
                  }
                </div>
              </div>
            }
          </div>

          <details class="mt-6" [open]="tableauP4P5Ouvert()" #dtP4 (toggle)="basculerTableauP4P5(dtP4.open)">
            <summary class="cursor-pointer text-sm text-primary">
              Tableau produit P4 · P5 (écart SDU, concordance, écart consommation)
            </summary>
            <div class="mt-3" [attr.aria-busy]="chargeP4P5() ? 'true' : null">
              <dqa-barre-attente [actif]="chargeP4P5()" />
              @if (reimportP4P5()) {
                <p class="mt-2 text-xs text-alerte-texte">Données du core modifiées depuis le gel du mois : le détail ci-dessous peut différer des comptes figés.</p>
              }
              @if (produitsP4P5().length > 0) {
                <div hlmTableContainer class="mt-3">
                  <table hlmTable>
                    <thead hlmTHead>
                      <tr hlmTr>
                        <th hlmTh>Produit</th>
                        <th hlmTh class="text-right">Stock théorique</th>
                        <th hlmTh class="text-right">Stock physique compté</th>
                        <th hlmTh class="text-right">Écart SDU</th>
                        <th hlmTh class="text-right">Concordance</th>
                        <th hlmTh class="text-right">Stock début</th>
                        <th hlmTh class="text-right">Réceptions</th>
                        <th hlmTh class="text-right">Stock fin</th>
                        <th hlmTh class="text-right">Consommation reconstituée</th>
                        <th hlmTh class="text-right">Consommation déclarée</th>
                        <th hlmTh class="text-right">Écart consommation</th>
                        <th hlmTh>Statuts</th>
                      </tr>
                    </thead>
                    <tbody hlmTBody>
                      @for (g of groupesP4P5(); track g.produitCode) {
                        @if (g.articles.length > 1) {
                          <tr hlmTr>
                            <td hlmTd>
                              <a
                                class="text-primary hover:underline"
                                [routerLink]="['/sites', d.site.siteId, 'produits', g.produitCode]"
                                [queryParams]="{ mois: d.moisPaqd }"
                              >{{ g.libelle ?? g.produitCode }}</a>
                              <div class="text-xs text-muted-foreground">{{ g.articles.length }} articles mSupply sous ce code</div>
                            </td>
                            <td hlmTd class="text-muted-foreground" colspan="10">
                              Compté une fois : conforme seulement si tous ses articles le sont.
                            </td>
                            <td hlmTd>
                              <div class="flex flex-wrap items-center gap-2">
                                <span class="inline-flex items-center gap-1"><dqa-badge-statut [statut]="g.sduConforme ? 'CONFORME' : 'ALERTE'" /> SDU</span>
                                <span class="inline-flex items-center gap-1"><dqa-badge-statut [statut]="g.concordanceConforme ? 'CONFORME' : 'ALERTE'" /> concordance</span>
                                @if (g.consoConforme !== null) {
                                  <span class="inline-flex items-center gap-1"><dqa-badge-statut [statut]="g.consoConforme ? 'CONFORME' : 'ALERTE'" /> conso</span>
                                }
                              </div>
                            </td>
                          </tr>
                        }
                        @for (pr of g.articles; track pr.produitId) {
                        <tr hlmTr>
                          <td hlmTd>
                            @if (pr.article; as art) {
                              <div class="pl-4 text-sm">
                                article {{ art.rang }} sur {{ art.nombre }}@if (art.unite) { · {{ art.unite }} }
                              </div>
                            } @else {
                              <a
                                class="text-primary hover:underline"
                                [routerLink]="['/sites', d.site.siteId, 'produits', pr.produitCode]"
                                [queryParams]="{ mois: d.moisPaqd }"
                              >{{ pr.libelle ?? pr.produitCode }}</a>
                            }
                          </td>
                          <td hlmTd class="text-right tabular-nums">{{ pr.sdu.theorique === null ? absent : (pr.sdu.theorique | number: '1.0-0') }}</td>
                          <td hlmTd class="text-right tabular-nums">{{ pr.sdu.comptee === null ? absent : (pr.sdu.comptee | number: '1.0-0') }}</td>
                          <td hlmTd class="text-right tabular-nums">{{ pr.sdu.ecartPct === null ? '∞' : (pr.sdu.ecartPct | number: '1.0-1') + ' %' }}</td>
                          <td hlmTd class="text-right tabular-nums">{{ pr.concordance.tauxPct === null ? absent : (pr.concordance.tauxPct | number: '1.0-1') + ' %' }}</td>
                          @if (pr.consommation; as c) {
                            @if (c.evaluable) {
                              <td hlmTd class="text-right tabular-nums">{{ c.stockDebut | number: '1.0-0' }}</td>
                              <td hlmTd class="text-right tabular-nums">{{ c.receptions | number: '1.0-0' }}</td>
                              <td hlmTd class="text-right tabular-nums">{{ c.stockFin | number: '1.0-0' }}</td>
                              <td hlmTd class="text-right tabular-nums">{{ c.reconstituee | number: '1.0-0' }}</td>
                              <td hlmTd class="text-right tabular-nums">{{ c.declaree | number: '1.0-0' }}</td>
                              <td hlmTd class="text-right tabular-nums">{{ c.ecartPct | number: '1.0-1' }} %</td>
                            } @else {
                              <td hlmTd class="text-muted-foreground" colspan="6">consommation non évaluable : {{ raisonConso(c.raisonExclusion) }}</td>
                            }
                          }
                          <td hlmTd>
                            <div class="flex flex-wrap items-center gap-2">
                              <span class="inline-flex items-center gap-1"><dqa-badge-statut [statut]="pr.sdu.conforme ? 'CONFORME' : 'ALERTE'" /> SDU</span>
                              <span class="inline-flex items-center gap-1"><dqa-badge-statut [statut]="pr.concordance.conforme ? 'CONFORME' : 'ALERTE'" /> concordance</span>
                              @if (pr.consommation.evaluable) {
                                <span class="inline-flex items-center gap-1"><dqa-badge-statut [statut]="pr.consommation.conforme ? 'CONFORME' : 'ALERTE'" /> conso</span>
                              }
                            </div>
                          </td>
                        </tr>
                        }
                      }
                    </tbody>
                  </table>
                </div>
              } @else if (!chargeP4P5()) {
                <p class="mt-3 text-sm text-muted-foreground">Aucun produit traceur inventorié pour ce mois.</p>
              }
            </div>
          </details>

          @if (d.sousComposantes.length > 0) {
            <section class="mt-8 border-t border-border pt-6" [attr.aria-busy]="res.enCours()">
              <dqa-barre-attente [actif]="res.enCours()" />
              <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
                <h2 class="text-xl font-semibold tracking-tight">Analyse fine</h2>
                <div class="flex flex-wrap items-end gap-3">
                  <div class="grid gap-1.5">
                    <span class="text-sm font-medium">De</span>
                    <hlm-select class="w-36" [ngModel]="res.filtres().de" (ngModelChange)="res.definir({ de: versChaine($event) })">
                      <hlm-select-trigger class="w-36"><hlm-select-value placeholder="n/d" /></hlm-select-trigger>
                      <hlm-select-content *hlmSelectPortal>
                        @for (m of moisDisponibles(); track m) { <hlm-select-item [value]="m">{{ m }}</hlm-select-item> }
                      </hlm-select-content>
                    </hlm-select>
                  </div>
                  <div class="grid gap-1.5">
                    <span class="text-sm font-medium">à</span>
                    <hlm-select class="w-36" [ngModel]="res.filtres().a" (ngModelChange)="res.definir({ a: versChaine($event) })">
                      <hlm-select-trigger class="w-36"><hlm-select-value placeholder="n/d" /></hlm-select-trigger>
                      <hlm-select-content *hlmSelectPortal>
                        @for (m of moisDisponibles(); track m) { <hlm-select-item [value]="m">{{ m }}</hlm-select-item> }
                      </hlm-select-content>
                    </hlm-select>
                  </div>
                  @if (cycleCourantTracable()) {
                    <button hlmBtn size="sm" variant="outline" type="button" (click)="preset('cycle')">Cycle courant</button>
                  }
                  <button hlmBtn size="sm" variant="outline" type="button" (click)="preset('12m')">12 derniers mois</button>
                  <button hlmBtn size="sm" variant="outline" type="button" (click)="preset('tout')">Tout</button>
                </div>
              </div>

              <details class="mt-6" open>
                <summary class="cursor-pointer text-sm text-primary">Sous-composantes au {{ d.moisPaqd }}</summary>
                <div hlmTableContainer class="mt-3">
                  <table hlmTable>
                    <thead hlmTHead>
                      <tr hlmTr>
                        <th hlmTh><button type="button" class="inline-flex items-center gap-1 hover:text-primary" (click)="trierSc('sousComposante')">Sous-composante{{ fleche('sousComposante') }}</button></th>
                        <th hlmTh><button type="button" class="inline-flex items-center gap-1 hover:text-primary" (click)="trierSc('pilier')">Pilier{{ fleche('pilier') }}</button></th>
                        <th hlmTh class="text-right"><button type="button" class="inline-flex items-center gap-1 hover:text-primary" (click)="trierSc('valeur')">Valeur{{ fleche('valeur') }}</button></th>
                        <th hlmTh class="text-right"><button type="button" class="inline-flex items-center gap-1 hover:text-primary" (click)="trierSc('seuil')">Seuil{{ fleche('seuil') }}</button></th>
                        <th hlmTh class="text-right"><button type="button" class="inline-flex items-center gap-1 hover:text-primary" (click)="trierSc('ecart')">Écart au seuil{{ fleche('ecart') }}</button></th>
                        <th hlmTh class="text-right"><button type="button" class="inline-flex items-center gap-1 hover:text-primary" (click)="trierSc('tauxAtteinte')">Taux d'atteinte{{ fleche('tauxAtteinte') }}</button></th>
                        <th hlmTh><button type="button" class="inline-flex items-center gap-1 hover:text-primary" (click)="trierSc('statut')">Statut{{ fleche('statut') }}</button></th>
                      </tr>
                    </thead>
                    <tbody hlmTBody>
                      @for (sc of scTriees(); track sc.sousComposante) {
                        <tr hlmTr>
                          <td hlmTd>{{ libelleSc(sc.sousComposante) }}</td>
                          <td hlmTd>{{ pilierDe(sc.sousComposante) }}</td>
                          <td hlmTd class="text-right tabular-nums">{{ sc.valeur === null ? absent : (sc.valeur | number: '1.0-1') }}</td>
                          <td hlmTd class="text-right tabular-nums">{{ sc.seuil === null ? absent : (sc.seuil | number: '1.0-1') }}</td>
                          <td hlmTd class="text-right tabular-nums">{{ ecartAuSeuil(sc) }}</td>
                          <td hlmTd class="text-right tabular-nums">{{ sc.tauxAtteinte === null ? absent : (sc.tauxAtteinte | number: '1.0-1') }}</td>
                          <td hlmTd><dqa-badge-statut [statut]="sc.statut" /></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </details>

              <div class="mt-6">
                <div class="flex flex-wrap items-center justify-between gap-4">
                  <h3 class="text-base font-medium">Forces et faiblesses au {{ d.moisPaqd }}</h3>
                  <div class="flex gap-2">
                    <button hlmBtn size="sm" type="button" [variant]="axes() === '6' ? 'default' : 'outline'" (click)="axes.set('6')">6 piliers</button>
                    <button hlmBtn size="sm" type="button" [variant]="axes() === '10' ? 'default' : 'outline'" (click)="axes.set('10')">10 sous-composantes</button>
                  </div>
                </div>
                <dqa-graphe-radar class="mt-4 block" [axes]="axesRadar()" />
                <div class="mt-4 grid gap-6 text-sm sm:grid-cols-2">
                  <div>
                    <h4 class="mb-1 font-medium">Forces</h4>
                    <ul class="space-y-0.5">@for (f of forces(); track f.sousComposante) { <li class="tabular-nums">{{ libelleSc(f.sousComposante) }} · {{ f.tauxAtteinte | number: '1.0-0' }}</li> }</ul>
                  </div>
                  <div>
                    <h4 class="mb-1 font-medium">Faiblesses</h4>
                    <ul class="space-y-0.5">@for (f of faiblesses(); track f.sousComposante) { <li class="tabular-nums">{{ libelleSc(f.sousComposante) }} · {{ f.tauxAtteinte | number: '1.0-0' }}</li> }</ul>
                  </div>
                </div>
              </div>

              @if (historique(); as h) {
                @if (h.points.length > 1) {
                  <div class="mt-6">
                    <div class="flex flex-wrap items-center justify-between gap-4">
                      <h3 class="text-base font-medium">Évolution</h3>
                      <div class="flex flex-wrap gap-3">
                        <hlm-select class="w-52" [itemToString]="libelleGranularite" [ngModel]="granularite()" (ngModelChange)="granularite.set($event)">
                          <hlm-select-trigger class="w-52"><hlm-select-value /></hlm-select-trigger>
                          <hlm-select-content *hlmSelectPortal>
                            <hlm-select-item value="composite">Score composite</hlm-select-item>
                            <hlm-select-item value="pilier">Par pilier</hlm-select-item>
                            <hlm-select-item value="sousComposante">Par sous-composante</hlm-select-item>
                          </hlm-select-content>
                        </hlm-select>
                        @if (granularite() === 'sousComposante') {
                          <hlm-select class="w-64" [itemToString]="libellePilierCourbe" [ngModel]="pilierCourbe()" (ngModelChange)="pilierCourbe.set($event)">
                            <hlm-select-trigger class="w-64"><hlm-select-value /></hlm-select-trigger>
                            <hlm-select-content *hlmSelectPortal>
                              @for (p of piliers; track p) { <hlm-select-item [value]="p">{{ p }} · {{ libellePilier(p) }}</hlm-select-item> }
                            </hlm-select-content>
                          </hlm-select>
                        }
                      </div>
                    </div>
                    <dqa-graphe-courbe
                      class="mt-4 block"
                      [etiquettes]="etiquettesCourbe()"
                      [series]="seriesCourbe()"
                      [seuils]="granularite() === 'composite' ? [75, 90] : [65, 75, 90]"
                      [pointilleDepuis]="pointilleDepuisCourbe()"
                    />
                    @if (granularite() === 'composite') {
                      <p class="mt-2 text-sm text-muted-foreground">{{ deltaComposite() }}</p>
                      @if (pointilleDepuisCourbe() !== null) {
                        <p class="mt-1 text-xs text-muted-foreground">
                          Segment en pointillé : mois en cours, score encore provisoire.
                        </p>
                      }
                    }
                  </div>
                }
              }
            </section>
          }
        }
      } @else {
        <p class="mt-6 text-muted-foreground">Site inconnu ou hors périmètre.</p>
      }
      }
      }
    </main>
  `,
})
export class DetailSitePage {
  readonly id = input.required<string>();
  protected readonly absent = VALEUR_ABSENTE;
  protected readonly versChaine = versChaine;
  protected readonly piliers = PILIERS;

  private readonly service = inject(SitesService);

  protected readonly granularite = signal<Granularite>('composite');
  protected readonly pilierCourbe = signal<Pilier>(PILIERS[0]);
  protected readonly axes = signal<ModeRadar>('6');
  protected readonly triSc = signal<{ colonne: TriSc; sens: 1 | -1 }>({ colonne: 'tauxAtteinte', sens: 1 });

  protected readonly programmes = signal<Programme[]>([]);

  protected readonly res = ressource<DonneesFiche, FiltresFiche>({
    charger: async (f) => {
      const h = await this.service.historique(this.id(), {
        programmeId: f.programme || undefined,
        de: f.de || undefined,
        a: f.a || undefined,
      });
      // le mois affiché suit un choix explicite (sélecteur du haut), sinon la
      // borne haute réellement servie par l'historique
      const moisFiche = f.mois || h.points.at(-1)?.moisPaqd || (f.a || undefined);
      const d = await this.service.detailSite(this.id(), {
        programmeId: f.programme || undefined,
        mois: moisFiche,
      });
      return { detail: d, historique: h };
    },
    germe: { detail: null, historique: null },
    filtresInitiaux: { programme: '', de: '', a: '', mois: '' },
    apresChargement: (v, f) => {
      const mois = v.historique?.moisDisponibles ?? []; // décroissant
      if (mois.length === 0) return undefined;
      // Aucune borne (ouverture directe, sans plage dans l'URL) : fenêtre par
      // défaut = 12 derniers mois. Le cycle courant seul ne suffit pas : au
      // premier mois d'un cycle il n'a qu'un point, donc ni courbe ni
      // progression.
      if (!f.de && !f.a) {
        const fin = mois[0]!;
        const debut = reculerMois(fin, MOIS_FENETRE_ANNEE);
        return { de: debut < mois.at(-1)! ? mois.at(-1)! : debut, a: fin };
      }
      // Sinon on reflète la plage réellement servie dans les sélecteurs.
      const points = v.historique?.points ?? [];
      if (points.length === 0) return undefined;
      return { de: points[0]!.moisPaqd, a: points.at(-1)!.moisPaqd };
    },
    // l'élargissement à 12 mois (première ouverture sans plage) doit relancer
    // le chargement : l'historique du cycle courant seul ne suffit pas.
    rechargerApresAjustement: true,
  });

  protected readonly historique = computed<HistoriqueSite | null>(() => this.res.valeur().historique);
  private readonly detail = computed<DetailSite | null>(() => this.res.valeur().detail);

  protected readonly moisDisponibles = computed(() => this.historique()?.moisDisponibles ?? []);

  /** Détail ligne à ligne d'un pilier, chargé au dépli de sa carte (P1 / P2 / P3 / P6). */
  private readonly detailsPilier = signal<Partial<Record<Pilier, DetailPilier>>>({});
  private readonly chargements = signal<Partial<Record<Pilier, boolean>>>({});
  private readonly ouverts = signal<ReadonlySet<Pilier>>(new Set());
  /** Dernier couple (programme, mois) pour lequel les dépliants sont à jour. */
  private cleContexte = '';

  constructor() {
    // Un changement de mois / programme invalide les dépliants ouverts et les
    // recharge en arrière-plan, sans démonter la vue (CLAUDE.md §8).
    effect(() => {
      const cle = `${this.res.filtres().programme}|${this.detail()?.moisPaqd ?? ''}`;
      untracked(() => {
        if (cle === this.cleContexte) return;
        this.cleContexte = cle;
        this.tableauP4P5.set(null);
        if (this.tableauP4P5Ouvert()) void this.chargerP4P5();
        const ouverts = this.ouverts();
        if (ouverts.size === 0) return;
        this.detailsPilier.set({});
        for (const p of ouverts) void this.chargerPilier(p);
      });
    });
    void this.init();
  }

  protected chargePilier = (p: Pilier): boolean => this.chargements()[p] ?? false;

  protected p1De = (p: Pilier): DetailPilierP1 | undefined => {
    const d = this.detailsPilier()[p];
    return d?.code === 'p1' ? d : undefined;
  };
  protected p2De = (p: Pilier): DetailPilierP2 | undefined => {
    const d = this.detailsPilier()[p];
    return d?.code === 'p2' ? d : undefined;
  };
  protected p3De = (p: Pilier): DetailPilierP3 | undefined => {
    const d = this.detailsPilier()[p];
    return d?.code === 'p3' ? d : undefined;
  };
  protected p6De = (p: Pilier): DetailPilierP6 | undefined => {
    const d = this.detailsPilier()[p];
    return d?.code === 'p6' ? d : undefined;
  };

  /** Modèle du bandeau calendaire P3 (fonction pure `calendrier-p3`). */
  protected calendrierP3 = (dp: DetailPilierP3): CalendrierP3 | null =>
    dp.jours.length === 0 ? null : construireCalendrierP3(dp.jours);

  protected basculerPilier(p: Pilier, ouvert: boolean): void {
    const s = new Set(this.ouverts());
    if (ouvert) {
      s.add(p);
      void this.chargerPilier(p);
    } else {
      s.delete(p);
    }
    this.ouverts.set(s);
  }

  private async chargerPilier(p: Pilier): Promise<void> {
    if (p !== 'P1' && p !== 'P2' && p !== 'P3' && p !== 'P6') return;
    if (this.detailsPilier()[p] || this.chargements()[p]) return;
    this.chargements.update((m) => ({ ...m, [p]: true }));
    try {
      const f = this.res.filtres();
      const d = await this.service.detailPilier(this.id(), CODE_PILIER[p], {
        programmeId: f.programme || undefined,
        mois: this.detail()?.moisPaqd ?? undefined,
      });
      this.detailsPilier.update((m) => ({ ...m, [p]: d }));
    } catch {
      // échec non bloquant : la carte reste, un nouveau dépli retentera
    } finally {
      this.chargements.update((m) => ({ ...m, [p]: false }));
    }
  }

  /** Cas fautifs d'abord : programme sans inventaire ni réquisition en tête. */
  protected programmesTries = (
    l: DetailPilierP1['programmesGeres'],
  ): DetailPilierP1['programmesGeres'] =>
    [...l].sort((a, b) => this.rangProgramme(a) - this.rangProgramme(b));
  private rangProgramme = (x: DetailPilierP1['programmesGeres'][number]): number =>
    x.aInventaire && x.aRequisition ? 1 : 0;

  protected invP2Tries = (
    l: DetailPilierP2['inventaires'],
  ): DetailPilierP2['inventaires'] =>
    [...l].sort((a, b) => Number(a.dansLes3DerniersJours) - Number(b.dansLes3DerniersJours));

  protected reqP2Tries = (
    l: DetailPilierP2['requisitions'],
  ): DetailPilierP2['requisitions'] =>
    [...l].sort((a, b) => Number(a.aLHeure) - Number(b.aLHeure));

  private async init(): Promise<void> {
    this.programmes.set(await this.service.programmes());
    await this.res.demarrer();
  }

  /** Cycle PAQD d'un mois AAAA-MM (3 cycles de 4 mois : C1 janv-avr, C2 mai-août, C3 sept-déc). */
  private cycleDe(mois: string): string {
    const [a, m] = mois.split('-').map(Number);
    return `${a}-C${Math.floor((m! - 1) / 4) + 1}`;
  }

  /** Le cycle courant a-t-il au moins deux mois mesurés ? (sinon « Cycle courant » ne trace rien). */
  protected readonly cycleCourantTracable = computed(() => {
    const mois = this.moisDisponibles();
    if (mois.length === 0) return false;
    const cyc = this.cycleDe(mois[0]!);
    return mois.filter((m) => this.cycleDe(m) === cyc).length > 1;
  });

  protected preset(quoi: 'cycle' | '12m' | 'tout'): void {
    const mois = this.moisDisponibles(); // décroissant
    if (quoi === 'cycle' && mois.length) {
      // bornes explicites du cycle courant (et non de:'' a:'' qui déclencherait
      // la fenêtre 12 mois par défaut).
      const cyc = this.cycleDe(mois[0]!);
      const duCycle = mois.filter((m) => this.cycleDe(m) === cyc);
      this.res.definir({ de: duCycle.at(-1)!, a: duCycle[0]! });
      return;
    }
    if (quoi === 'tout' && mois.length) {
      this.res.definir({ de: mois.at(-1)!, a: mois[0]! });
      return;
    }
    if (quoi === '12m' && mois.length) {
      // 12 mois calendaires en arrière depuis le dernier mois connu, et non les
      // 12 derniers mois *mesurés* : l'API borne ensuite à l'historique réel.
      const fin = mois[0]!;
      this.res.definir({ a: fin, de: reculerMois(fin, MOIS_FENETRE_ANNEE) });
    }
  }

  /** Suffixe P3 selon le type de site (ADR 0011) : dispensation vs distribution. */
  private suffixeP3(): string {
    return this.detail()?.estDistrict ? ' (distribution)' : ' (dispensation)';
  }

  protected libellePilier = (p: Pilier) =>
    p === 'P3' ? LIBELLES_PILIER.P3 + this.suffixeP3() : LIBELLES_PILIER[p];
  protected libelleSc = (sc: SousComposante) =>
    libelleSousComposante(sc, this.detail()?.estDistrict ?? false);
  protected pilierDe = (sc: SousComposante) => PILIER_DE_SOUS_COMPOSANTE[sc];

  /** Libellé de série pour le `<hlm-select>` de programme (l'`itemToString` reçoit une chaîne). */
  protected libelleProgramme = (id: string): string =>
    this.programmes().find((p) => p.programmeId === id)?.programmeNom ?? 'Tous programmes';

  protected libelleGranularite = (g: string): string =>
    g === 'composite' || g === 'pilier' || g === 'sousComposante' ? LIBELLE_GRANULARITE[g] : g;

  protected libellePilierCourbe = (p: string): string => {
    const pil = PILIERS.find((x) => x === p);
    return pil ? `${pil} · ${LIBELLES_PILIER[pil]}` : p;
  };

  /** Écart signé valeur - seuil, arrondi au dixième ; `null` si non calculable. */
  private ecartNum(sc: SousComposanteBref): number | null {
    if (sc.valeur === null || sc.seuil === null) return null;
    return Math.round((sc.valeur - sc.seuil) * 10) / 10;
  }

  protected ecartAuSeuil(sc: SousComposanteBref): string {
    const e = this.ecartNum(sc);
    if (e === null) return VALEUR_ABSENTE;
    return e > 0 ? `+${e}` : String(e);
  }

  private readonly RAISONS_CONSO: Record<RaisonExclusionConso, string> = {
    aucune_borne: "pas de borne d'ouverture (dernier inventaire du mois précédent ou deux dans le mois)",
    reconstituee_non_positive: 'reconstituée ≤ 0',
  };
  protected raisonConso = (r: RaisonExclusionConso) => this.RAISONS_CONSO[r];

  // ── Tableau produit P4 · P5 fusionné ─────────────────────────────────────
  // Servi par la variante `p4` de /piliers/:code ; chargé au premier dépli,
  // pas au chargement de la fiche. Les cartes P4 et P5 l'ouvrent toutes deux.
  private readonly tableauP4P5 = signal<DetailPilierP4 | null>(null);
  protected readonly chargeP4P5 = signal(false);
  protected readonly tableauP4P5Ouvert = signal(false);

  protected readonly produitsP4P5 = computed(() => this.tableauP4P5()?.produits ?? []);
  protected readonly groupesP4P5 = computed(() => grouperProduitsP4P5(this.produitsP4P5()));
  protected readonly reimportP4P5 = computed(() => this.tableauP4P5()?.reimporteDepuisLeGel ?? false);

  protected ouvrirTableauP4P5(): void {
    this.tableauP4P5Ouvert.set(true);
    void this.chargerP4P5();
  }

  protected basculerTableauP4P5(ouvert: boolean): void {
    this.tableauP4P5Ouvert.set(ouvert);
    if (ouvert) void this.chargerP4P5();
  }

  private async chargerP4P5(): Promise<void> {
    if (this.tableauP4P5() || this.chargeP4P5()) return;
    this.chargeP4P5.set(true);
    try {
      const f = this.res.filtres();
      const d = await this.service.detailPilier(this.id(), 'p4', {
        programmeId: f.programme || undefined,
        mois: this.detail()?.moisPaqd ?? undefined,
      });
      if (d.code === 'p4') this.tableauP4P5.set(d);
    } catch {
      // échec non bloquant : un nouveau dépli retentera
    } finally {
      this.chargeP4P5.set(false);
    }
  }

  // tableau à plat
  protected trierSc(colonne: TriSc): void {
    const t = this.triSc();
    this.triSc.set({ colonne, sens: t.colonne === colonne ? ((t.sens * -1) as 1 | -1) : 1 });
  }

  protected fleche(colonne: TriSc): string {
    const t = this.triSc();
    return t.colonne === colonne ? (t.sens === 1 ? ' ▲' : ' ▼') : '';
  }

  protected readonly scTriees = computed<SousComposanteBref[]>(() => {
    const d = this.detail();
    if (!d) return [];
    const { colonne, sens } = this.triSc();
    const cle = (s: SousComposanteBref): string | number | null => {
      switch (colonne) {
        case 'sousComposante':
          return this.libelleSc(s.sousComposante);
        case 'pilier':
          return this.pilierDe(s.sousComposante);
        case 'statut':
          return s.statut;
        case 'ecart':
          return this.ecartNum(s);
        default:
          return s[colonne]; // valeur | seuil | tauxAtteinte
      }
    };
    return [...d.sousComposantes].sort((x, y) => {
      const [a, b] = [cle(x), cle(y)];
      if (a === b) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a < b ? -1 : 1) * sens;
    });
  });

  // radar
  protected readonly axesRadar = computed<AxeGrapheRadar[]>(() => {
    const d = this.detail();
    if (!d) return [];
    if (this.axes() === '10') {
      return d.sousComposantes.map((s) => ({
        etiquette: this.libelleSc(s.sousComposante),
        valeur: s.tauxAtteinte,
        statut: s.statut,
      }));
    }
    return this.piliers.map((p) => {
      const scs = d.sousComposantes.filter((s) => this.pilierDe(s.sousComposante) === p);
      const vals = scs.map((s) => s.tauxAtteinte).filter((v): v is number => v !== null);
      const alerte = scs.some((s) => s.statut === 'ALERTE');
      return {
        etiquette: `${p} · ${this.libellePilier(p)}`,
        valeur: vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : null,
        statut: vals.length === 0 ? 'NON_CALCULABLE' : alerte ? 'ALERTE' : 'CONFORME',
      };
    });
  });

  /** Les sous-composantes calculables, du plus faible taux d'atteinte au plus fort. */
  private readonly classees = computed<(SousComposanteBref & { tauxAtteinte: number })[]>(() => {
    const d = this.detail();
    if (!d) return [];
    return d.sousComposantes
      .filter((s): s is SousComposanteBref & { tauxAtteinte: number } => s.tauxAtteinte !== null)
      .sort((x, y) => x.tauxAtteinte - y.tauxAtteinte);
  });
  protected readonly faiblesses = computed(() =>
    this.classees()
      .filter((s) => s.tauxAtteinte < 100)
      .slice(0, NB_SAILLANTS),
  );
  protected readonly forces = computed(() => this.classees().slice(-NB_SAILLANTS).reverse());

  // courbes
  protected readonly etiquettesCourbe = computed(() =>
    (this.historique()?.points ?? []).map((p) => p.moisPaqd),
  );

  protected readonly seriesCourbe = computed<SerieGrapheCourbe[]>(() => {
    const points = this.historique()?.points ?? [];
    const g = this.granularite();
    if (g === 'composite') {
      return [{ nom: 'Score composite', points: points.map((p) => p.scoreComposite) }];
    }
    if (g === 'pilier') {
      return this.piliers.map((pil) => ({
        nom: pil,
        points: points.map((p) => p.scoresPiliers.find((s) => s.pilier === pil)?.score ?? null),
      }));
    }
    return SOUS_COMPOSANTES_DU_PILIER[this.pilierCourbe()].map((sc) => ({
      nom: this.libelleSc(sc),
      points: points.map((p) => p.sousComposantes.find((s) => s.sousComposante === sc)?.tauxAtteinte ?? null),
    }));
  });

  /**
   * Index du premier mois non clos de la fenêtre affichée (score provisoire) :
   * la courbe du score composite passe en pointillé à partir de ce point.
   * `null` hors granularité composite ou si tous les mois sont clos.
   */
  protected readonly pointilleDepuisCourbe = computed<number | null>(() => {
    if (this.granularite() !== 'composite') return null;
    const points = this.historique()?.points ?? [];
    const i = points.findIndex((p) => !p.moisClos);
    return i > 0 ? i : null;
  });

  protected readonly deltaComposite = computed(() => {
    const points = this.historique()?.points ?? [];
    const m = points.filter((p): p is (typeof p) & { scoreComposite: number } => p.scoreComposite !== null);
    if (m.length < 2) return '';
    const v = Math.round((m.at(-1)!.scoreComposite - m[0]!.scoreComposite) * 10) / 10;
    const signe = v > 0 ? `+${v}` : String(v);
    return `${m[0]!.moisPaqd} → ${m.at(-1)!.moisPaqd} : ${signe} pts`;
  });

  /** Écart du mois affiché sur le mois précédent (dans l'historique chargé) ; `null` si l'un des deux manque. */
  protected readonly progressionComposite = computed<{ texte: string; classe: string } | null>(() => {
    const d = this.detail();
    const points = this.historique()?.points ?? [];
    if (!d || d.scoreComposite === null) return null;
    const i = points.findIndex((p) => p.moisPaqd === d.moisPaqd);
    const precedent = i > 0 ? points[i - 1] : undefined;
    if (!precedent || precedent.scoreComposite === null) return null;
    const ecart = Math.round((d.scoreComposite - precedent.scoreComposite) * 10) / 10;
    if (ecart === 0) {
      return { texte: `stable depuis ${precedent.moisPaqd}`, classe: 'text-muted-foreground' };
    }
    const signe = ecart > 0 ? '+' : '';
    return {
      texte: `${signe}${ecart} pts depuis ${precedent.moisPaqd}`,
      classe: ecart > 0 ? 'text-conforme-texte' : 'text-alerte-texte',
    };
  });
}
