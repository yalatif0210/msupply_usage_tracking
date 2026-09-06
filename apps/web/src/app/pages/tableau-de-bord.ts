import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBuilding2,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideGauge,
} from '@ng-icons/lucide';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { LIBELLES_SOUS_COMPOSANTE, type SousComposante, type TableauDeBord } from '@dqa/contracts';
import { VALEUR_ABSENTE, versChaine } from '../core/affichage';
import { ressource } from '../core/ressource';
import { SyntheseService } from '../core/synthese.service';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';
import { GrapheCourbe, type SerieGrapheCourbe } from '../ui/graphe-courbe';
import { RepartitionClassificationComponent } from '../ui/repartition-classification';

interface CarteKpi {
  readonly libelle: string;
  readonly valeur: string;
  readonly icone: string;
  readonly sousTitre: string;
  readonly delta: { readonly texte: string; readonly classe: string } | null;
}

type FiltresTableauDeBord = {
  mois: string;
}

/**
 * Page d'accueil : état national du mois PAQD affiché (le dernier par défaut,
 * navigable vers un mois passé : les scores historisés sont consultés en
 * reporting de conformité, cf. ADR 0003). Registre shadcn-admin : cartes de
 * statistiques, courbe de progression en vrai graphe, tableau des
 * sous-composantes en difficulté.
 */
@Component({
  selector: 'dqa-tableau-de-bord',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    RouterLink,
    NgIcon,
    HlmBadge,
    HlmCard,
    HlmSelectImports,
    HlmSkeletonImports,
    HlmTableImports,
    BarreAttente,
    Coquille,
    GrapheCourbe,
    RepartitionClassificationComponent,
  ],
  providers: [DecimalPipe, provideIcons({ lucideBuilding2, lucideCircleCheck, lucideCircleDashed, lucideGauge })],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 class="text-2xl font-bold tracking-tight">Tableau de bord national</h1>

      @switch (res.phase()) {
      @case ('squelette') {
        <div class="mt-6 flex flex-col gap-4" aria-hidden="true">
          <div hlmSkeleton class="h-9 w-44"></div>
          <div hlmSkeleton class="h-32 w-full"></div>
        </div>
      }
      @case ('echec') {
        <p class="mt-4 text-sm text-muted-foreground">Le tableau de bord est indisponible.</p>
      }
      @default {
      @if (res.valeur(); as t) {
        @if (t.moisPaqd === null) {
          <p class="mt-4 text-sm text-muted-foreground">
            Aucun mois n'a encore de score. Le tableau de bord s'alimentera au premier import traité.
          </p>
        } @else {
          <div class="mt-4 flex flex-wrap items-end gap-3">
            <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Mois affiché
              <hlm-select class="w-44" [value]="res.filtres().mois" (valueChange)="majMois($event)">
                <hlm-select-trigger class="w-44">
                  <hlm-select-value placeholder="Mois affiché" />
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  @for (m of moisDisponibles(); track m) {
                    <hlm-select-item [value]="m">{{ m }}</hlm-select-item>
                  }
                </hlm-select-content>
              </hlm-select>
            </label>
            @if (!t.moisClos) {
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

          <dqa-barre-attente class="mt-2 block" [actif]="res.enCours()" />

          <div class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            @for (c of cartes(); track c.libelle) {
              <div hlmCard>
                <div class="flex flex-col gap-2 px-4">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium">{{ c.libelle }}</span>
                    <ng-icon
                      [name]="c.icone"
                      class="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <div class="text-2xl font-bold tabular-nums">{{ c.valeur }}</div>
                    @if (c.delta; as d) {
                      <p class="mt-1 text-xs" [class]="d.classe">{{ d.texte }}</p>
                    } @else {
                      <p class="mt-1 text-xs text-muted-foreground">{{ c.sousTitre }}</p>
                    }
                  </div>
                </div>
              </div>
            }
          </div>

          <div class="mt-4 grid gap-4 lg:grid-cols-7">
            <div hlmCard class="lg:col-span-4">
              <div class="px-4">
                <h2 class="text-base font-semibold tracking-tight">
                  Progression nationale (score composite moyen)
                </h2>
                <div class="mt-4">
                  @if (assezDHistorique()) {
                    <dqa-graphe-courbe
                      [etiquettes]="etiquettesProgression()"
                      [series]="seriesProgression()"
                      [seuils]="seuils"
                      [pointilleDepuis]="pointilleDepuis()"
                    />
                    @if (pointilleDepuis() !== null) {
                      <p class="mt-2 text-xs text-muted-foreground">
                        Segment en pointillé : mois en cours, score encore provisoire.
                      </p>
                    }
                  } @else {
                    <p class="text-sm text-muted-foreground">
                      L'historique n'a pas encore deux mois : la courbe s'affichera au prochain
                      import.
                    </p>
                  }
                </div>
              </div>
            </div>

            <div hlmCard class="lg:col-span-3 lg:self-start">
              <div class="px-4">
                <h2 class="text-base font-semibold tracking-tight">
                  Répartition des classifications
                </h2>
                <div class="mt-4">
                  <dqa-repartition-classification [repartition]="t.national.repartition" />
                </div>
              </div>
            </div>
          </div>

          <div hlmCard class="mt-4">
            <div class="px-4">
              <h2 class="text-base font-semibold tracking-tight">Sous-composantes en difficulté</h2>
              <div class="mt-4">
                @if (t.sousComposantesEnDifficulte.length === 0) {
                  <p class="text-sm text-muted-foreground">Aucune sous-composante mesurée ce mois.</p>
                } @else {
                  <div hlmTableContainer>
                    <table hlmTable>
                      <thead hlmTHead>
                        <tr hlmTr>
                          <th hlmTh>Sous-composante</th>
                          <th hlmTh>Pilier</th>
                          <th hlmTh><span class="block text-right">Sites en alerte</span></th>
                          <th hlmTh><span class="block text-right">Taux d'atteinte moyen</span></th>
                        </tr>
                      </thead>
                      <tbody hlmTBody>
                        @for (sc of t.sousComposantesEnDifficulte; track sc.sousComposante) {
                          <tr hlmTr>
                            <td hlmTd class="font-medium">{{ libelleSc(sc.sousComposante) }}</td>
                            <td hlmTd>{{ sc.pilier }}</td>
                            <td hlmTd class="text-right tabular-nums">{{ sc.nbAlerte }}</td>
                            <td hlmTd class="text-right tabular-nums">
                              {{
                                sc.tauxAtteinteMoyen === null
                                  ? absent
                                  : (sc.tauxAtteinteMoyen | number: '1.0-1')
                              }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </div>
            </div>
          </div>

          <p class="mt-4 text-sm">
            <a routerLink="/sites" class="font-medium text-primary hover:underline">
              Voir les {{ t.national.nbSites }} sites
            </a>
          </p>
        }
      }
      }
      }
    </main>
  `,
})
export class TableauDeBordPage {
  protected readonly absent = VALEUR_ABSENTE;
  /** Repères de la courbe aux bornes de classification composite (cf. classer_composite). */
  protected readonly seuils = [75, 90];
  private readonly service = inject(SyntheseService);
  private readonly nb = inject(DecimalPipe);

  protected readonly res = ressource<TableauDeBord | null, FiltresTableauDeBord>({
    charger: (f) => this.service.tableauDeBord(f.mois || undefined),
    germe: null,
    filtresInitiaux: { mois: '' },
    // aligne le mois affiché sur celui que le serveur a réellement servi
    apresChargement: (t) => (t?.moisPaqd ? { mois: t.moisPaqd } : undefined),
  });

  /** Tous les mois PAQD historisés, du plus ancien au plus récent (sélecteur). */
  protected readonly moisDisponibles = computed(() => this.res.valeur()?.progression.map((p) => p.moisPaqd) ?? []);

  protected readonly assezDHistorique = computed(() => (this.res.valeur()?.progression.length ?? 0) > 1);

  protected readonly etiquettesProgression = computed(
    () => this.res.valeur()?.progression.map((p) => p.moisPaqd) ?? [],
  );

  protected readonly seriesProgression = computed<SerieGrapheCourbe[]>(() => [
    {
      nom: 'Score composite moyen',
      points: this.res.valeur()?.progression.map((p) => p.scoreCompositeMoyen) ?? [],
    },
  ]);

  /**
   * Index du premier mois non clos de la progression (score provisoire) :
   * la courbe passe en pointillé à partir de ce point. `null` si tous les
   * mois affichés sont clos.
   */
  protected readonly pointilleDepuis = computed<number | null>(() => {
    const progression = this.res.valeur()?.progression ?? [];
    const i = progression.findIndex((p) => !p.moisClos);
    return i > 0 ? i : null;
  });

  constructor() {
    void this.res.demarrer();
  }

  /** `valueChange` d'un `hlm-select` : la valeur d'un item est toujours une chaîne. */
  protected majMois(valeur: unknown): void {
    this.res.definir({ mois: versChaine(valeur) });
  }

  /** Écart du mois affiché sur le précédent, en points de score ; `null` si l'un des deux manque. */
  private readonly deltaScore = computed<CarteKpi['delta']>(() => {
    const t = this.res.valeur();
    const progression = t?.progression ?? [];
    const i = progression.findIndex((p) => p.moisPaqd === t?.moisPaqd);
    const dernier = i >= 0 ? progression[i] : undefined;
    const precedent = i > 0 ? progression[i - 1] : undefined;
    if (
      !dernier ||
      !precedent ||
      dernier.scoreCompositeMoyen === null ||
      precedent.scoreCompositeMoyen === null
    ) {
      return null;
    }
    const ecart =
      Math.round((dernier.scoreCompositeMoyen - precedent.scoreCompositeMoyen) * 10) / 10;
    if (ecart === 0) {
      return { texte: `stable depuis ${precedent.moisPaqd}`, classe: 'text-muted-foreground' };
    }
    const signe = ecart > 0 ? '+' : '';
    return {
      texte: `${signe}${this.nb.transform(ecart, '1.0-1')} pts depuis ${precedent.moisPaqd}`,
      classe: ecart > 0 ? 'text-conforme-texte' : 'text-alerte-texte',
    };
  });

  protected readonly cartes = computed<readonly CarteKpi[]>(() => {
    const t = this.res.valeur();
    if (!t || t.moisPaqd === null) return [];
    const n = t.national;
    return [
      {
        libelle: 'Sites du périmètre',
        valeur: `${n.nbSites}`,
        icone: 'lucideBuilding2',
        sousTitre: 'suivis dans la DQA',
        delta: null,
      },
      {
        libelle: 'Score composite moyen',
        valeur:
          n.scoreCompositeMoyen === null
            ? this.absent
            : (this.nb.transform(n.scoreCompositeMoyen, '1.0-1') ?? this.absent),
        icone: 'lucideGauge',
        sousTitre: 'sur 100',
        delta: this.deltaScore(),
      },
      {
        libelle: 'Sites conformes',
        valeur: `${n.repartition.CONFORME}`,
        icone: 'lucideCircleCheck',
        sousTitre: 'score composite ≥ 90',
        delta: null,
      },
      {
        libelle: 'Sites sans mesure',
        valeur: `${n.repartition.SANS_MESURE}`,
        icone: 'lucideCircleDashed',
        sousTitre: 'aucun score ce mois',
        delta: null,
      },
    ];
  });

  protected libelleSc(sc: SousComposante): string {
    return LIBELLES_SOUS_COMPOSANTE[sc];
  }
}
