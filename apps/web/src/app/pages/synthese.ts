import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  LIBELLES_PILIER,
  LIBELLES_SOUS_COMPOSANTE,
  type LigneSousComposanteSynthese,
  type Pilier,
  type Programme,
  type SousComposante,
  type SyntheseNationale,
  type SyntheseRapports,
} from '@dqa/contracts';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { VALEUR_ABSENTE, versChaine } from '../core/affichage';
import { ressource } from '../core/ressource';
import { SitesService } from '../core/sites.service';
import { SyntheseService } from '../core/synthese.service';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';
import { RepartitionClassificationComponent } from '../ui/repartition-classification';

type TriColonne = 'libelle' | 'pilier' | 'tauxAtteinteMoyen' | 'nbConforme' | 'nbAlerte' | 'nbNonCalculable';

type FiltresSynthese = {
  mois: string;
  programmeId: string;
  region: string;
}

const COLONNES: readonly { cle: TriColonne; libelle: string; num: boolean }[] = [
  { cle: 'libelle', libelle: 'Sous-composante', num: false },
  { cle: 'pilier', libelle: 'Pilier', num: false },
  { cle: 'tauxAtteinteMoyen', libelle: "Taux d'atteinte moyen", num: true },
  { cle: 'nbConforme', libelle: 'Conformes', num: true },
  { cle: 'nbAlerte', libelle: 'Alertes', num: true },
  { cle: 'nbNonCalculable', libelle: 'Non calculables', num: true },
];

/** Classe partagée des en-têtes de tableau (DESIGN_SYSTEM §6). */
const TH = 'text-xs font-medium text-muted-foreground';

@Component({
  selector: 'dqa-synthese',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    Coquille,
    BarreAttente,
    RepartitionClassificationComponent,
    HlmSkeletonImports,
    HlmSelectImports,
    HlmTabsImports,
    HlmCardImports,
    HlmTableImports,
  ],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 class="text-2xl font-bold tracking-tight">Synthèse nationale</h1>

      @switch (res.phase()) {
      @case ('squelette') {
        <div class="mt-6 flex flex-col gap-4">
          <div hlmSkeleton class="h-9 w-72"></div>
          <div hlmSkeleton class="h-32 w-full"></div>
          <div hlmSkeleton class="h-64 w-full"></div>
        </div>
      }
      @case ('echec') {
        <p class="mt-6 text-sm text-muted-foreground">La synthèse est indisponible.</p>
      }
      @default {
      @if (res.valeur(); as s) {
        <div class="mt-4 mb-6 flex flex-wrap items-end gap-4">
          @if (s.moisDisponibles.length > 1) {
            <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Mois PAQD
              <hlm-select [value]="res.filtres().mois" (valueChange)="majMois($event)">
                <hlm-select-trigger class="w-44">
                  <hlm-select-value placeholder="Mois PAQD" />
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  @for (m of s.moisDisponibles; track m) {
                    <hlm-select-item [value]="m">{{ m }}</hlm-select-item>
                  }
                </hlm-select-content>
              </hlm-select>
            </label>
          } @else {
            <p class="text-sm text-muted-foreground">Mois PAQD : {{ s.moisPaqd ?? absent }}</p>
          }

          <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Programme
            <hlm-select [value]="res.filtres().programmeId" (valueChange)="majProgramme($event)">
              <hlm-select-trigger class="w-56">
                <hlm-select-value placeholder="Tous programmes" />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                <hlm-select-item value="">Tous programmes</hlm-select-item>
                @for (p of programmes(); track p.programmeId) {
                  <hlm-select-item [value]="p.programmeId">{{ p.programmeNom }}</hlm-select-item>
                }
              </hlm-select-content>
            </hlm-select>
          </label>

          <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Région
            <hlm-select [value]="res.filtres().region" (valueChange)="majRegion($event)">
              <hlm-select-trigger class="w-48">
                <hlm-select-value placeholder="Toutes" />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                <hlm-select-item value="">Toutes</hlm-select-item>
                @for (r of regions(); track r) {
                  <hlm-select-item [value]="r">{{ r }}</hlm-select-item>
                }
              </hlm-select-content>
            </hlm-select>
          </label>
        </div>

        <div [attr.aria-busy]="res.enCours()">
          <dqa-barre-attente [actif]="res.enCours() || resRapports.enCours()" />

          <div class="flex flex-col gap-6">
            @if (s.programmeId) {
              <p class="text-sm text-muted-foreground">
                National, piliers et districts filtrés sur le programme sélectionné.
              </p>
            }

            @if (s.moisPaqd === null) {
              <p class="text-sm text-muted-foreground">
                Aucun mois n'a encore de score. La synthèse s'alimentera au premier
                import traité.
              </p>
            } @else if (s.national.nbMesures === 0) {
              <p class="text-sm text-muted-foreground">
                Aucun site n'a de score composite pour ce mois{{ s.programmeId || s.region ? ' avec ce filtre' : '' }}.
              </p>
            } @else {
              <hlm-tabs tab="pilier">
                <hlm-tabs-list class="grid w-full max-w-xl grid-cols-3" aria-label="Vue de la synthèse">
                  <button hlmTabsTrigger="pilier">Par pilier</button>
                  <button hlmTabsTrigger="sousComposante">Sous-composantes</button>
                  <button hlmTabsTrigger="rapports">Rapports &amp; inventaires</button>
                </hlm-tabs-list>

                <div hlmTabsContent="pilier" class="flex flex-col gap-6 pt-4">
                  <section hlmCard>
                    <div hlmCardContent class="flex flex-wrap items-center gap-x-10 gap-y-4">
                      <div>
                        <div class="text-4xl leading-none font-bold tabular-nums">
                          {{ s.national.scoreCompositeMoyen === null ? absent : (s.national.scoreCompositeMoyen | number: '1.0-1') }}
                        </div>
                        <div class="mt-1 text-sm text-muted-foreground">/ 100 · score composite moyen</div>
                        <div class="text-xs text-muted-foreground">
                          calculé sur {{ s.national.nbMesures }} site{{ s.national.nbMesures > 1 ? 's' : '' }}
                          sur {{ s.national.nbSites }}
                        </div>
                      </div>
                      <div class="min-w-64 flex-1">
                        <dqa-repartition-classification [repartition]="s.national.repartition" />
                      </div>
                    </div>
                  </section>

                  <section hlmCard>
                    <div hlmCardHeader>
                      <h2 hlmCardTitle>Moyenne nationale par pilier</h2>
                    </div>
                    <div hlmCardContent class="flex flex-col gap-2">
                      @for (mp of s.national.moyennesPiliers; track mp.pilier) {
                        <div class="flex items-center gap-4">
                          <div class="w-64 shrink-0 text-sm">{{ mp.pilier }} · {{ libelle(mp.pilier) }}</div>
                          <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div class="h-full rounded-full bg-primary" [style.width.%]="mp.moyenne ?? 0"></div>
                          </div>
                          <div class="w-12 shrink-0 text-right text-sm tabular-nums">
                            {{ mp.moyenne === null ? absent : (mp.moyenne | number: '1.0-1') }}
                          </div>
                        </div>
                      }
                    </div>
                  </section>

                  <section hlmCard>
                    <div hlmCardHeader>
                      <h2 hlmCardTitle>Par district</h2>
                    </div>
                    <div hlmCardContent>
                      @if (s.parDistrict.length === 0) {
                        <p class="text-sm text-muted-foreground">Aucun district ne correspond à ce filtre.</p>
                      } @else {
                        <div hlmTableContainer>
                          <table hlmTable>
                            <thead hlmTHead>
                              <tr hlmTr>
                                <th hlmTh [class]="TH">District</th>
                                <th hlmTh [class]="TH + ' text-right'">Sites</th>
                                <th hlmTh [class]="TH + ' text-right'">Mesurés</th>
                                <th hlmTh [class]="TH + ' text-right'">Score moyen</th>
                                <th hlmTh [class]="TH">Répartition</th>
                              </tr>
                            </thead>
                            <tbody hlmTBody>
                              @for (d of s.parDistrict; track d.district) {
                                <tr hlmTr class="cursor-pointer" (click)="ouvrirDistrict(d.district)">
                                  <td hlmTd>{{ d.district }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ d.nbSites }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ d.nbMesures }}</td>
                                  <td hlmTd class="text-right tabular-nums">
                                    {{ d.scoreCompositeMoyen === null ? absent : (d.scoreCompositeMoyen | number: '1.0-1') }}
                                  </td>
                                  <td hlmTd class="whitespace-normal">
                                    <dqa-repartition-classification [repartition]="d.repartition" [compact]="true" />
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      }
                    </div>
                  </section>

                  <section hlmCard>
                    <div hlmCardHeader>
                      <h2 hlmCardTitle>Scores par programme</h2>
                    </div>
                    <div hlmCardContent>
                      @if (s.parProgramme.length === 0) {
                        <p class="text-sm text-muted-foreground">Aucun programme ne correspond à ce filtre.</p>
                      } @else {
                        <div hlmTableContainer>
                          <table hlmTable>
                            <thead hlmTHead>
                              <tr hlmTr>
                                <th hlmTh [class]="TH">Programme</th>
                                <th hlmTh [class]="TH + ' text-right'">Sites gérant</th>
                                <th hlmTh [class]="TH + ' text-right'">Mesurés</th>
                                <th hlmTh [class]="TH + ' text-right'">Score national</th>
                                <th hlmTh [class]="TH">Répartition</th>
                              </tr>
                            </thead>
                            <tbody hlmTBody>
                              @for (p of s.parProgramme; track p.programmeId) {
                                <tr hlmTr>
                                  <td hlmTd>{{ p.programmeNom }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ p.nbSites }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ p.nbMesures }}</td>
                                  <td hlmTd class="text-right tabular-nums">
                                    {{ p.scoreCompositeMoyen === null ? absent : (p.scoreCompositeMoyen | number: '1.0-1') }}
                                  </td>
                                  <td hlmTd class="whitespace-normal">
                                    <dqa-repartition-classification [repartition]="p.repartition" [compact]="true" />
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      }
                    </div>
                  </section>
                </div>

                <div hlmTabsContent="sousComposante" class="pt-4">
                  <section hlmCard>
                    <div hlmCardHeader>
                      <h2 hlmCardTitle>Par sous-composante</h2>
                    </div>
                    <div hlmCardContent>
                      @if (s.parSousComposante.length === 0) {
                        <p class="text-sm text-muted-foreground">Aucune sous-composante mesurée pour ce filtre.</p>
                      } @else {
                        <div hlmTableContainer>
                          <table hlmTable>
                            <thead hlmTHead>
                              <tr hlmTr>
                                @for (c of colonnes; track c.cle) {
                                  <th
                                    hlmTh
                                    class="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground"
                                    [class.text-right]="c.num"
                                    [attr.aria-sort]="ariaSort(c.cle)"
                                    (click)="trier(c.cle)"
                                  >
                                    {{ c.libelle }}
                                    @if (ariaSort(c.cle) === 'ascending') {
                                      <span aria-hidden="true">↑</span>
                                    } @else if (ariaSort(c.cle) === 'descending') {
                                      <span aria-hidden="true">↓</span>
                                    }
                                  </th>
                                }
                              </tr>
                            </thead>
                            <tbody hlmTBody>
                              @for (sc of sousComposantesTriees(s); track sc.sousComposante) {
                                <tr hlmTr>
                                  <td hlmTd>{{ libelleSc(sc.sousComposante) }}</td>
                                  <td hlmTd>{{ sc.pilier }}</td>
                                  <td hlmTd class="text-right tabular-nums">
                                    {{ sc.tauxAtteinteMoyen === null ? absent : (sc.tauxAtteinteMoyen | number: '1.0-1') }}
                                  </td>
                                  <td hlmTd class="text-right tabular-nums">{{ sc.nbConforme }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ sc.nbAlerte }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ sc.nbNonCalculable }}</td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      }
                    </div>
                  </section>
                </div>

                <div hlmTabsContent="rapports" class="pt-4">
                  <section hlmCard>
                    <div hlmCardHeader>
                      <h2 hlmCardTitle>Rapports et inventaires par strate de structure</h2>
                      <p class="text-sm text-muted-foreground">
                        Réquisitions (rapports mensuels) et inventaires de fin de mois attendus,
                        réalisés et réalisés dans les délais. L'attendu est compté par programme géré.
                      </p>
                    </div>
                    <div hlmCardContent>
                      @if (rapports(); as r) {
                        @if (r.strates.length === 0) {
                          <p class="text-sm text-muted-foreground">
                            Aucune strate n'a de comptes figés pour ce mois{{ s.programmeId || s.region ? ' avec ce filtre' : '' }}.
                          </p>
                        } @else {
                          <div hlmTableContainer>
                            <table hlmTable>
                              <thead hlmTHead>
                                <tr hlmTr>
                                  <th hlmTh [class]="TH" rowspan="2">Strate</th>
                                  <th hlmTh [class]="TH + ' text-right'" colspan="3">Réquisitions</th>
                                  <th hlmTh [class]="TH + ' text-right'" colspan="3">Inventaires de fin de mois</th>
                                </tr>
                                <tr hlmTr>
                                  <th hlmTh [class]="TH + ' text-right'">Attendues</th>
                                  <th hlmTh [class]="TH + ' text-right'">Réalisées</th>
                                  <th hlmTh [class]="TH + ' text-right'">À l'heure</th>
                                  <th hlmTh [class]="TH + ' text-right'">Attendus</th>
                                  <th hlmTh [class]="TH + ' text-right'">Réalisés</th>
                                  <th hlmTh [class]="TH + ' text-right'">À l'heure</th>
                                </tr>
                              </thead>
                              <tbody hlmTBody>
                                @for (l of r.strates; track l.strate) {
                                  <tr hlmTr>
                                    <td hlmTd>{{ l.strate }}</td>
                                    <td hlmTd class="text-right tabular-nums">{{ l.requisitions.attendu }}</td>
                                    <td hlmTd class="text-right tabular-nums">{{ l.requisitions.realise }}</td>
                                    <td hlmTd class="text-right tabular-nums">{{ l.requisitions.aLHeure }}</td>
                                    <td hlmTd class="text-right tabular-nums">{{ l.inventaires.attendu }}</td>
                                    <td hlmTd class="text-right tabular-nums">{{ l.inventaires.realise }}</td>
                                    <td hlmTd class="text-right tabular-nums">{{ l.inventaires.aLHeure }}</td>
                                  </tr>
                                }
                                <tr hlmTr class="font-bold">
                                  <td hlmTd>Total</td>
                                  <td hlmTd class="text-right tabular-nums">{{ r.total.requisitions.attendu }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ r.total.requisitions.realise }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ r.total.requisitions.aLHeure }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ r.total.inventaires.attendu }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ r.total.inventaires.realise }}</td>
                                  <td hlmTd class="text-right tabular-nums">{{ r.total.inventaires.aLHeure }}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        }
                      } @else {
                        <p class="text-sm text-muted-foreground">Chargement des comptes.</p>
                      }
                    </div>
                  </section>
                </div>
              </hlm-tabs>
            }
          </div>
        </div>
      }
      }
      }
    </main>
  `,
})
export class SynthesePage {
  protected readonly absent = VALEUR_ABSENTE;
  protected readonly colonnes = COLONNES;
  protected readonly TH = TH;
  private readonly service = inject(SyntheseService);
  private readonly sites = inject(SitesService);
  private readonly router = inject(Router);

  protected readonly regions = signal<string[]>([]);
  protected readonly programmes = signal<Programme[]>([]);
  protected readonly tri = signal<{ colonne: TriColonne; sens: 1 | -1 }>({
    colonne: 'tauxAtteinteMoyen',
    sens: 1,
  });

  protected readonly res = ressource<SyntheseNationale | null, FiltresSynthese>({
    charger: (f) =>
      this.service.synthese({
        mois: f.mois || undefined,
        region: f.region || undefined,
        programmeId: f.programmeId || undefined,
      }),
    germe: null,
    filtresInitiaux: { mois: '', programmeId: '', region: '' },
    // aligne le mois affiché sur celui que le serveur a réellement servi
    apresChargement: (s) => (s ? { mois: s.moisPaqd ?? '' } : undefined),
  });

  /**
   * Onglet « Rapports & inventaires » : ressource dédiée, sur les mêmes filtres
   * que `res` (un changement de filtre rafraîchit les deux sans remonter la vue).
   */
  protected readonly resRapports = ressource<SyntheseRapports | null, FiltresSynthese>({
    charger: (f) =>
      this.service.syntheseRapports({
        mois: f.mois || undefined,
        region: f.region || undefined,
        programmeId: f.programmeId || undefined,
      }),
    germe: null,
    filtresInitiaux: { mois: '', programmeId: '', region: '' },
    apresChargement: (r) => (r ? { mois: r.moisPaqd ?? '' } : undefined),
  });

  protected rapports(): SyntheseRapports | null {
    return this.resRapports.valeur();
  }

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    const [r, p] = await Promise.all([this.sites.regions(), this.sites.programmes()]);
    this.regions.set(r);
    this.programmes.set(p);
    await Promise.all([this.res.demarrer(), this.resRapports.demarrer()]);
  }

  protected libelle(pilier: Pilier): string {
    return LIBELLES_PILIER[pilier];
  }

  protected libelleSc(sc: SousComposante): string {
    return LIBELLES_SOUS_COMPOSANTE[sc];
  }

  /** `valueChange` d'un `hlm-select` : la valeur d'un item est toujours une chaîne. */
  protected majMois(valeur: unknown): void {
    this.majFiltre({ mois: versChaine(valeur) });
  }

  protected majProgramme(valeur: unknown): void {
    this.majFiltre({ programmeId: versChaine(valeur) });
  }

  protected majRegion(valeur: unknown): void {
    this.majFiltre({ region: versChaine(valeur) });
  }

  /** Propage un changement de filtre aux deux ressources de la page. */
  private majFiltre(modif: Partial<FiltresSynthese>): void {
    this.res.definir(modif);
    this.resRapports.definir(modif);
  }

  protected trier(colonne: TriColonne): void {
    const t = this.tri();
    this.tri.set({ colonne, sens: t.colonne === colonne ? ((t.sens * -1) as 1 | -1) : 1 });
  }

  protected ariaSort(colonne: TriColonne): 'ascending' | 'descending' | 'none' {
    const t = this.tri();
    return t.colonne !== colonne ? 'none' : t.sens === 1 ? 'ascending' : 'descending';
  }

  /** Les dix lignes triées selon l'en-tête cliqué ; une valeur `null` reste en dernier. */
  protected sousComposantesTriees(s: SyntheseNationale): LigneSousComposanteSynthese[] {
    const { colonne, sens } = this.tri();
    const cle = (l: LigneSousComposanteSynthese): string | number | null =>
      colonne === 'libelle' ? this.libelleSc(l.sousComposante) : l[colonne];
    return [...s.parSousComposante].sort((a, b) => {
      const [x, y] = [cle(a), cle(b)];
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * sens;
    });
  }

  protected ouvrirDistrict(district: string): void {
    void this.router.navigate(['/sites'], { queryParams: { district } });
  }
}

