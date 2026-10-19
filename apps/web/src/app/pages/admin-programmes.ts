import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSkeleton } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { ProgrammeSite, SiteProgrammes, VueProgrammesSites } from '@dqa/contracts';
import { AdminProgrammesService } from '../core/admin-programmes.service';
import { AuthService } from '../core/auth.service';
import { messageErreurHttp } from '../core/message-erreur';
import { sansActivite } from '../core/programmes-eligibles';
import { ressource } from '../core/ressource';
import { BarreAttente } from '../ui/barre-attente';
import { Coquille } from '../ui/coquille';

/** Filtres de l'écran, tous appliqués côté client sur la liste chargée. */
type FiltresProgrammes = {
  q: string;
  /** `inactifs` : seulement les programmes sans activité sur la période. */
  vue: string;
}

const cle = (siteId: string, programmeId: string): string => `${siteId}|${programmeId}`;


/**
 * Programmes éligibles à l'évaluation de chaque site (ADR 0020). P1 et P2
 * attendent une réquisition (et un inventaire pour P2) par programme
 * éligible : un programme rattaché dans mSupply mais non géré fait tomber ces
 * piliers à 0. La coordination désactive ces programmes ici ; un import
 * ultérieur ne revient jamais sur ses choix. Les scores se recalculent au
 * bouton « Recalculer les scores » ou au prochain import.
 */
@Component({
  selector: 'dqa-admin-programmes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, Coquille, BarreAttente, HlmTableImports, HlmBadge, HlmButton, HlmInput, HlmSkeleton],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-6xl px-4 py-6">
      <h1 class="text-2xl font-semibold tracking-tight">Programmes éligibles</h1>
      <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
        Programmes évalués pour chaque site (complétude et promptitude des réquisitions et des
        inventaires). Un programme rattaché au site dans mSupply mais qu'il ne gère pas fait chuter
        P1 et P2 : décochez-le. Un choix fait ici n'est jamais écrasé par un import ; un programme
        nouveau du fichier arrive avec le statut du fichier.
      </p>

      @if (!modifiable()) {
        <p class="mt-3 text-sm text-muted-foreground" role="status">
          Consultation seule : seule la coordination modifie les programmes éligibles.
        </p>
      }

      <div class="mt-4 flex flex-wrap items-end gap-4">
        <label class="grid gap-1.5 text-xs font-medium text-muted-foreground">
          Rechercher un site ou un programme
          <input
            hlmInput
            class="w-72"
            [ngModel]="res.filtres().q"
            (ngModelChange)="res.definirLocal({ q: $event })"
          />
        </label>
        <label class="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            [ngModel]="res.filtres().vue === 'inactifs'"
            (ngModelChange)="res.definirLocal({ vue: $event ? 'inactifs' : '' })"
          />
          Seulement les programmes sans activité
        </label>
        @if (modifiable()) {
          <button hlmBtn type="button" class="ml-auto" [disabled]="recalculEnCours()" (click)="recalculer()">
            {{ recalculEnCours() ? 'Recalcul en cours…' : 'Recalculer les scores' }}
          </button>
        }
      </div>
      @if (nbModifiesDepuisRecalcul() > 0) {
        <p class="mt-2 text-sm text-foreground" role="status">
          {{ nbModifiesDepuisRecalcul() }} modification(s) pas encore prise(s) en compte dans les scores.
        </p>
      }

      @switch (res.phase()) {
        @case ('squelette') {
          <div class="mt-6 space-y-2" aria-hidden="true">
            @for (i of [0, 1, 2, 3, 4]; track i) {
              <div hlmSkeleton class="h-10 w-full"></div>
            }
          </div>
        }
        @case ('echec') {
          <p class="mt-6 text-muted-foreground">La liste des programmes est indisponible.</p>
        }
        @default {
          <div class="mt-4" [attr.aria-busy]="res.enCours()">
            <dqa-barre-attente [actif]="res.enCours()" />
            <p class="mb-2 text-xs text-muted-foreground">
              Activité depuis le {{ res.valeur().activiteDepuis | date: 'dd/MM/yyyy' }} :
              inventaires finalisés et réquisitions du programme.
              {{ nbSansActivite() }} programme(s) sans aucune activité sur {{ nbProgrammes() }}.
            </p>
            @if (sitesAffiches().length === 0) {
              <p class="text-muted-foreground">Aucun programme ne correspond.</p>
            } @else {
              <div hlmTableContainer class="rounded-lg border border-border">
                <table hlmTable>
                  <thead hlmTHead>
                    <tr hlmTr>
                      <th hlmTh>Site</th>
                      <th hlmTh>Programme</th>
                      <th hlmTh class="text-right">Inventaires</th>
                      <th hlmTh class="text-right">Réquisitions</th>
                      <th hlmTh>Statut fixé par</th>
                      <th hlmTh>Éligible</th>
                    </tr>
                  </thead>
                  <tbody hlmTBody>
                    @for (s of sitesAffiches(); track s.siteId) {
                      @for (p of s.programmes; track p.programmeId; let premier = $first) {
                        <tr hlmTr [class.text-muted-foreground]="!p.actif">
                          <td hlmTd class="align-top font-medium">
                            @if (premier) {
                              {{ s.siteNom }}
                              <span class="block text-xs font-normal text-muted-foreground">{{ s.district }}</span>
                            }
                          </td>
                          <td hlmTd>
                            {{ p.programmeNom }}
                            @if (p.programmeCode) {
                              <span class="ml-1 font-mono text-xs text-muted-foreground">{{ p.programmeCode }}</span>
                            }
                          </td>
                          <td hlmTd class="text-right tabular-nums">{{ p.nbInventaires }}</td>
                          <td hlmTd class="text-right tabular-nums">{{ p.nbRequisitions }}</td>
                          <td hlmTd class="text-sm">
                            @if (p.origine === 'application') {
                              <span hlmBadge variant="secondary">Coordination</span>
                              <span class="ml-1 text-xs text-muted-foreground">
                                {{ p.modifiePar }}, {{ p.modifieLe | date: 'dd/MM/yyyy' }}
                              </span>
                            } @else {
                              <span class="text-muted-foreground">Fichier mSupply</span>
                            }
                          </td>
                          <td hlmTd>
                            <label class="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                [checked]="p.actif"
                                [disabled]="!modifiable() || enCours().has(cleDe(s, p))"
                                (change)="basculer(s, p, !p.actif)"
                                [attr.aria-label]="'Évaluer ' + p.programmeNom + ' pour ' + s.siteNom"
                              />
                              {{ p.actif ? 'Oui' : 'Non' }}
                            </label>
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
      }
    </main>
  `,
})
export class AdminProgrammesPage {
  private readonly service = inject(AdminProgrammesService);
  private readonly auth = inject(AuthService);

  protected readonly modifiable = computed(() => this.auth.utilisateur()?.role === 'coordination');

  protected readonly res = ressource<VueProgrammesSites, FiltresProgrammes>({
    charger: () => this.service.etat(),
    germe: { activiteDepuis: '1970-01-01', sites: [] },
    filtresInitiaux: { q: '', vue: '' },
  });

  /** Statuts modifiés depuis le dernier chargement : la vue se met à jour sans recharger la liste. */
  private readonly modifies = signal<ReadonlyMap<string, ProgrammeSite>>(new Map());
  protected readonly enCours = signal<ReadonlySet<string>>(new Set());
  protected readonly recalculEnCours = signal(false);
  protected readonly nbModifiesDepuisRecalcul = signal(0);

  private readonly sites = computed<SiteProgrammes[]>(() => {
    const m = this.modifies();
    return this.res.valeur().sites.map((s) => ({
      ...s,
      programmes: s.programmes.map((p) => m.get(cle(s.siteId, p.programmeId)) ?? p),
    }));
  });

  protected readonly sitesAffiches = computed<SiteProgrammes[]>(() => {
    const q = this.res.filtres().q.trim().toLocaleLowerCase('fr');
    const inactifs = this.res.filtres().vue === 'inactifs';
    return this.sites()
      .map((s) => {
        const siteCorrespond = q === '' || s.siteNom.toLocaleLowerCase('fr').includes(q)
          || (s.district ?? '').toLocaleLowerCase('fr').includes(q);
        const programmes = s.programmes.filter(
          (p) =>
            (!inactifs || sansActivite(p)) &&
            (siteCorrespond
              || p.programmeNom.toLocaleLowerCase('fr').includes(q)
              || (p.programmeCode ?? '').toLocaleLowerCase('fr').includes(q)),
        );
        return { ...s, programmes };
      })
      .filter((s) => s.programmes.length > 0);
  });

  protected readonly nbProgrammes = computed(() =>
    this.sites().reduce((n, s) => n + s.programmes.length, 0));
  protected readonly nbSansActivite = computed(() =>
    this.sites().reduce((n, s) => n + s.programmes.filter(sansActivite).length, 0));

  constructor() {
    void this.res.demarrer();
  }

  protected cleDe(s: SiteProgrammes, p: ProgrammeSite): string {
    return cle(s.siteId, p.programmeId);
  }

  protected async basculer(s: SiteProgrammes, p: ProgrammeSite, actif: boolean): Promise<void> {
    const k = cle(s.siteId, p.programmeId);
    this.enCours.update((e) => new Set(e).add(k));
    try {
      const maj = await this.service.modifier(s.siteId, p.programmeId, actif);
      this.modifies.update((m) => new Map(m).set(k, maj));
      this.nbModifiesDepuisRecalcul.update((n) => n + 1);
    } catch (err) {
      toast.error(messageErreurHttp(err));
    } finally {
      this.enCours.update((e) => {
        const n = new Set(e);
        n.delete(k);
        return n;
      });
    }
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
