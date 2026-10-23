import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
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
import { HlmButton } from '@spartan-ng/helm/button';
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
import { TerritoireRapports } from './territoire-rapports';
import { TerritoireScores } from './territoire-scores';

type TriColonne = 'libelle' | 'pilier' | 'tauxAtteinteMoyen' | 'nbConforme' | 'nbAlerte' | 'nbNonCalculable';

/** Lecture de l'onglet « Rapports & inventaires ». */
type VueRapports = 'strate' | 'territoire';

type FiltresSynthese = {
  mois: string;
  programmeId: string;
  region: string;
  /** Lectures par territoire seulement ; vide = toutes les strates. */
  strate: string;
  /** Vide = par strate (lecture historique de l'onglet). */
  vueRapports: '' | VueRapports;
}

const FILTRES_INITIAUX: FiltresSynthese = { mois: '', programmeId: '', region: '', strate: '', vueRapports: '' };

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
    TerritoireRapports,
    TerritoireScores,
    HlmButton,
    HlmSkeletonImports,
    HlmSelectImports,
    HlmTabsImports,
    HlmCardImports,
    HlmTableImports,
  ],
  template: `
    <dqa-coquille />
    <main class="mx-auto w-full max-w-vue py-6">
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
          @if (s.moisDisponibles.length > 0) {
            <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Mois affiché
              <hlm-select [value]="res.filtres().mois" (valueChange)="majMois($event)">
                <hlm-select-trigger class="w-44">
                  <hlm-select-value placeholder="Mois affiché" />
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  @for (m of s.moisDisponibles; track m) {
                    <hlm-select-item [value]="m">{{ m }}</hlm-select-item>
                  }
                </hlm-select-content>
              </hlm-select>
            </label>
          } @else {
            <p class="text-sm text-muted-foreground">Mois affiché : {{ absent }}</p>
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

          <label class="grid gap-1.5 text-xs font-medium text-muted-foreground"
                 title="S'applique aux lectures par territoire">
            Strate (par territoire)
            <hlm-select [value]="res.filtres().strate" (valueChange)="majStrate($event)">
              <hlm-select-trigger class="w-56">
                <hlm-select-value placeholder="Toutes" />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                <hlm-select-item value="">Toutes</hlm-select-item>
                @for (st of strates(); track st) {
                  <hlm-select-item [value]="st">{{ st }}</hlm-select-item>
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
                          <div class="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
                               title="Sites dont ce pilier est calculable ce mois">
                            sur {{ mp.nbSites }} site{{ mp.nbSites > 1 ? 's' : '' }}
                          </div>
                        </div>
                      }
                      <p class="mt-1 text-xs text-muted-foreground">
                        Chaque moyenne porte sur les seuls sites dont le pilier est calculable ce mois.
                      </p>
                    </div>
                  </section>

                  <section hlmCard>
                    <div hlmCardHeader>
                      <h2 hlmCardTitle>Suivi des réceptions</h2>
                      <p class="text-sm text-muted-foreground">Hors score : factures à faire accepter par les sites.</p>
                    </div>
                    <div hlmCardContent class="grid gap-4 sm:grid-cols-3">
                      <div>
                        <div class="text-2xl font-bold tabular-nums">
                          {{ s.suiviReceptions.nbAvecFacture }} / {{ s.suiviReceptions.nbRequisitions }}
                        </div>
                        <p class="text-xs text-muted-foreground">réquisitions ordinaires du mois précédent ayant reçu une facture</p>
                      </div>
                      <div>
                        <div class="text-2xl font-bold tabular-nums">{{ s.suiviReceptions.nbFacturesEnAttente }}</div>
                        <p class="text-xs text-muted-foreground">factures en attente d'acceptation</p>
                      </div>
                      <div>
                        <div class="text-2xl font-bold tabular-nums" [class.text-alerte-texte]="s.suiviReceptions.nbFacturesEnAlerte > 0">
                          {{ s.suiviReceptions.nbFacturesEnAlerte }}
                        </div>
                        <p class="text-xs text-muted-foreground">en attente depuis plus de {{ s.suiviReceptions.delaiAlerteJours }} jours</p>
                      </div>
                    </div>
                  </section>

                  <section hlmCard>
                    <div hlmCardHeader>
                      <h2 hlmCardTitle>Par territoire</h2>
                      <p class="text-sm text-muted-foreground">
                        Région, zone de district puis site{{ res.filtres().strate ? ' · strate ' + res.filtres().strate : '' }}.
                        Déplier une région pour ses zones, une zone pour ses sites.
                      </p>
                    </div>
                    <div hlmCardContent>
                      <dqa-territoire-scores [mois]="s.moisPaqd" [programmeId]="res.filtres().programmeId"
                                             [region]="res.filtres().region" [strate]="res.filtres().strate" />
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

                <div hlmTabsContent="rapports" class="flex flex-col gap-4 pt-4">
                  <div class="flex gap-2" role="group" aria-label="Lecture des rapports et inventaires">
                    <button hlmBtn size="sm" type="button" [variant]="vueRapports() === 'strate' ? 'default' : 'outline'"
                            [attr.aria-pressed]="vueRapports() === 'strate'" (click)="majVueRapports('strate')">Par strate</button>
                    <button hlmBtn size="sm" type="button" [variant]="vueRapports() === 'territoire' ? 'default' : 'outline'"
                            [attr.aria-pressed]="vueRapports() === 'territoire'" (click)="majVueRapports('territoire')">Par territoire</button>
                  </div>
                  @if (vueRapports() === 'territoire') {
                    <section hlmCard>
                      <div hlmCardHeader>
                        <h2 hlmCardTitle>Rapports et inventaires par territoire</h2>
                        <p class="text-sm text-muted-foreground">
                          Région, zone de district puis site{{ res.filtres().strate ? ' · strate ' + res.filtres().strate : '' }}.
                          L'attendu est compté par programme géré.
                        </p>
                      </div>
                      <div hlmCardContent>
                        <dqa-territoire-rapports [mois]="s.moisPaqd" [programmeId]="res.filtres().programmeId"
                                                 [region]="res.filtres().region" [strate]="res.filtres().strate" />
                      </div>
                    </section>
                  } @else {
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
                        @if (r.moisPaqd !== s.moisPaqd && !resRapports.enCours()) {
                          <p class="text-sm text-muted-foreground" role="status">
                            Aucun compte figé pour {{ s.moisPaqd }} : les rapports et inventaires de ce mois ne sont pas encore dus.
                          </p>
                        } @else if (r.strates.length === 0) {
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
                  }
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

  protected readonly regions = signal<string[]>([]);
  protected readonly programmes = signal<Programme[]>([]);
  protected readonly strates = signal<string[]>([]);
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
    filtresInitiaux: FILTRES_INITIAUX,
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
    filtresInitiaux: FILTRES_INITIAUX,
    // n'aligne que le mois par défaut : un mois choisi sans comptes figés (pas encore dû) reste affiché tel quel
    apresChargement: (r, f) => (r && !f.mois ? { mois: r.moisPaqd ?? '' } : undefined),
  });

  protected rapports(): SyntheseRapports | null {
    return this.resRapports.valeur();
  }

  protected vueRapports(): VueRapports {
    return this.res.filtres().vueRapports || 'strate';
  }

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    const [r, p, st] = await Promise.all([
      this.sites.regions(),
      this.sites.programmes(),
      this.service.strates().catch((): string[] => []),
    ]);
    this.regions.set(r);
    this.programmes.set(p);
    this.strates.set(st);
    // sans mois dans l'URL, la synthèse s'ouvre sur le dernier mois clos, pas sur un mois provisoire
    if (!this.res.filtres().mois) {
      const dernierClos = await this.service.territoireScores({}).then((t) => t.moisPaqd, () => null);
      if (dernierClos) this.majFiltreLocal({ mois: dernierClos });
    }
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

  /** Strate et vue ne servent qu'aux lectures par territoire : rien à recharger côté synthèse. */
  protected majStrate(valeur: unknown): void {
    this.majFiltreLocal({ strate: versChaine(valeur) });
  }

  protected majVueRapports(vue: VueRapports): void {
    this.majFiltreLocal({ vueRapports: vue === 'strate' ? '' : vue });
  }

  /** Propage un changement de filtre aux deux ressources de la page. */
  private majFiltre(modif: Partial<FiltresSynthese>): void {
    this.res.definir(modif);
    this.resRapports.definir(modif);
  }

  private majFiltreLocal(modif: Partial<FiltresSynthese>): void {
    this.res.definirLocal(modif);
    this.resRapports.definirLocal(modif);
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
}

