import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmBadge } from '@spartan-ng/helm/badge';
import {
  LIBELLES_PILIER,
  LIBELLES_SOUS_COMPOSANTE,
  SOUS_COMPOSANTES_AVEC_TOLERANCE,
  type EntreeGrille,
  type GrilleDetail,
  type GrilleParametre,
  type PoidsPilier,
  type SeuilSousComposante,
  type SousComposante,
} from '@dqa/contracts';
import { SANS_OBJET } from '../core/affichage';
import { AdminGrilleService } from '../core/admin-grille.service';
import { messageErreurHttp } from '../core/message-erreur';
import { Coquille } from '../ui/coquille';

const AVEC_TOLERANCE = new Set<SousComposante>(SOUS_COMPOSANTES_AVEC_TOLERANCE);

type BadgeVariant = 'default' | 'secondary' | 'outline';

@Component({
  selector: 'dqa-admin-grille',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DatePipe,
    Coquille,
    HlmButton,
    HlmInput,
    HlmLabel,
    HlmSelectImports,
    HlmTableImports,
    HlmBadge,
  ],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-6xl px-6 py-6">
      <h1 class="text-2xl font-bold tracking-tight">Grille de paramètres</h1>
      <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
        Poids des piliers et seuils des sous-composantes. Une modification crée
        une <b class="font-medium text-foreground">nouvelle version</b> qui ne
        prend effet qu'à une date future : les scores déjà calculés ne changent
        jamais.
      </p>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <section class="rounded-lg border border-border bg-card lg:col-span-1">
          <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 class="text-sm font-semibold tracking-tight">Versions</h2>
            <button hlmBtn size="sm" type="button" (click)="nouvelleVersion()">Nouvelle version</button>
          </div>
          <div hlmTableContainer>
            <table hlmTable class="w-full">
              <thead hlmTHead>
                <tr hlmTr>
                  <th hlmTh class="text-xs text-muted-foreground">Version</th>
                  <th hlmTh class="text-xs text-muted-foreground">Effet</th>
                  <th hlmTh class="text-xs text-muted-foreground">Statut</th>
                </tr>
              </thead>
              <tbody hlmTBody>
                @for (g of versions(); track g.id) {
                  <tr
                    hlmTr
                    class="cursor-pointer"
                    [attr.data-state]="selection()?.id === g.id ? 'selected' : null"
                    (click)="voir(g.id)"
                  >
                    <td hlmTd class="font-medium">{{ g.version }}</td>
                    <td hlmTd>{{ g.effetAPartirDe | date: 'dd/MM/yyyy' }}</td>
                    <td hlmTd>
                      <span hlmBadge [variant]="badgeStatut(g.statut)">{{ libelleStatut(g.statut) }}</span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="rounded-lg border border-border bg-card p-4 lg:col-span-2">
          @if (brouillon(); as b) {
            <h2 class="text-sm font-semibold tracking-tight">
              {{ enModification() ? 'Modifier la version planifiée' : 'Nouvelle version' }}
            </h2>

            <div class="mt-4 grid gap-4 sm:grid-cols-2">
              <div class="grid gap-1.5">
                <label hlmLabel for="grille-version">Libellé</label>
                <input
                  hlmInput
                  id="grille-version"
                  maxlength="40"
                  required
                  [ngModel]="b.version"
                  (ngModelChange)="majVersion($event)"
                />
              </div>
              <div class="grid gap-1.5">
                <label hlmLabel for="grille-effet">Date d'effet (dans le futur)</label>
                <input
                  hlmInput
                  id="grille-effet"
                  type="date"
                  required
                  [ngModel]="b.effetAPartirDe"
                  (ngModelChange)="majEffet($event)"
                />
              </div>
            </div>

            <h3 class="mt-6 text-sm font-medium">Poids des piliers · total {{ totalPoids() }} %</h3>
            @if (totalPoids() !== 100) {
              <p class="mt-1 text-sm text-destructive" role="alert">
                La somme des poids doit faire exactement 100.
              </p>
            }
            <div class="mt-2 divide-y divide-border">
              @for (p of b.poids; track p.pilier) {
                <div class="flex items-center justify-between gap-3 py-2">
                  <span class="text-sm">{{ p.pilier }} · {{ libellePilier(p.pilier) }}</span>
                  <input
                    hlmInput
                    class="w-24 text-right"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    [ngModel]="p.poidsPct"
                    (ngModelChange)="majPoids(p, $event)"
                  />
                </div>
              }
            </div>

            <h3 class="mt-6 text-sm font-medium">Seuils des sous-composantes</h3>
            <div class="mt-2 divide-y divide-border">
              @for (s of b.seuils; track s.sousComposante) {
                <div class="grid grid-cols-2 items-center gap-2 py-2 sm:grid-cols-4">
                  <span class="text-sm">{{ libelleSousComposante(s.sousComposante) }}</span>
                  <input
                    hlmInput
                    class="w-full text-right"
                    type="number"
                    step="0.5"
                    [ngModel]="s.seuil"
                    (ngModelChange)="majSeuil(s, $event)"
                  />
                  <hlm-select [value]="s.sens" (valueChange)="majSens(s, $event)">
                    <hlm-select-trigger class="w-full">
                      <hlm-select-value />
                    </hlm-select-trigger>
                    <hlm-select-content *hlmSelectPortal>
                      <hlm-select-item value="sup">≥ seuil</hlm-select-item>
                      <hlm-select-item value="inf">≤ seuil</hlm-select-item>
                    </hlm-select-content>
                  </hlm-select>
                  @if (avecTolerance(s.sousComposante)) {
                    <input
                      hlmInput
                      class="w-full text-right"
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="tolérance %"
                      [ngModel]="s.tolerance"
                      (ngModelChange)="majTolerance(s, $event)"
                    />
                  } @else {
                    <span class="text-center text-sm text-muted-foreground">{{ sansObjet }}</span>
                  }
                </div>
              }
            </div>

            <div class="mt-6 flex items-center gap-2">
              <button hlmBtn type="button" [disabled]="enCours()" (click)="enregistrer()">Enregistrer</button>
              <button hlmBtn variant="ghost" type="button" (click)="annuler()">Annuler</button>
            </div>
          } @else if (selection(); as s) {
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold tracking-tight">
                {{ s.version }} · {{ libelleStatut(s.statut) }}
              </h2>
              @if (s.modifiable) {
                <div class="flex items-center gap-2">
                  <button hlmBtn size="sm" type="button" (click)="editer()">Modifier</button>
                  <button hlmBtn size="sm" variant="destructive" type="button" (click)="supprimer(s.id)">
                    Supprimer
                  </button>
                </div>
              }
            </div>
            @if (!s.modifiable) {
              <p class="mt-1 text-sm text-muted-foreground">Version figée : consultation seule.</p>
            }

            <h3 class="mt-6 text-sm font-medium">Poids</h3>
            <ul class="mt-2 divide-y divide-border text-sm">
              @for (p of s.poids; track p.pilier) {
                <li class="flex items-center justify-between py-2">
                  <span>{{ p.pilier }} · {{ libellePilier(p.pilier) }}</span>
                  <b class="font-semibold tabular-nums">{{ p.poidsPct }} %</b>
                </li>
              }
            </ul>

            <h3 class="mt-6 text-sm font-medium">Seuils</h3>
            <ul class="mt-2 divide-y divide-border text-sm">
              @for (se of s.seuils; track se.sousComposante) {
                <li class="flex items-center justify-between gap-2 py-2">
                  <span>{{ libelleSousComposante(se.sousComposante) }}</span>
                  <span class="tabular-nums">
                    <b class="font-semibold">{{ se.sens === 'sup' ? '≥' : '≤' }} {{ se.seuil }}</b>
                    <span class="text-muted-foreground">
                      · tolérance {{ se.tolerance !== null ? se.tolerance + ' %' : sansObjet }}
                    </span>
                  </span>
                </li>
              }
            </ul>
          } @else {
            <p class="text-sm text-muted-foreground">Choisir une version, ou en créer une nouvelle.</p>
          }
        </section>
      </div>
    </main>
  `,
})
export class AdminGrillePage {
  protected readonly sansObjet = SANS_OBJET;
  private readonly service = inject(AdminGrilleService);

  protected readonly versions = signal<GrilleParametre[]>([]);
  protected readonly selection = signal<GrilleDetail | null>(null);
  protected readonly brouillon = signal<EntreeGrille | null>(null);
  protected readonly enModification = signal(false);
  protected readonly enCours = signal(false);

  protected readonly totalPoids = computed(() => {
    const b = this.brouillon();
    return b ? Math.round(b.poids.reduce((t, p) => t + Number(p.poidsPct || 0), 0) * 10) / 10 : 0;
  });

  constructor() {
    void this.charger();
  }

  protected libellePilier = (p: GrilleDetail['poids'][number]['pilier']) => LIBELLES_PILIER[p];
  protected libelleSousComposante = (s: GrilleDetail['seuils'][number]['sousComposante']) =>
    LIBELLES_SOUS_COMPOSANTE[s];
  protected avecTolerance = (s: SousComposante) => AVEC_TOLERANCE.has(s);
  protected libelleStatut = (s: GrilleParametre['statut']) =>
    ({ planifiee: 'Planifiée', en_vigueur: 'En vigueur', passee: 'Passée' })[s];
  protected badgeStatut = (s: GrilleParametre['statut']): BadgeVariant =>
    ({ planifiee: 'secondary', en_vigueur: 'default', passee: 'outline' } as const)[s];

  // -- Édition du brouillon : recalcul du total 100 % client, sans rechargement.
  // Chaque saisie rejoue le signal `brouillon` pour que `totalPoids` (computed)
  // se recalcule immédiatement.

  private rejouer(): void {
    const b = this.brouillon();
    if (b) this.brouillon.set({ ...b });
  }

  protected majVersion(v: string): void {
    const b = this.brouillon();
    if (b) this.brouillon.set({ ...b, version: v });
  }

  protected majEffet(v: string): void {
    const b = this.brouillon();
    if (b) this.brouillon.set({ ...b, effetAPartirDe: v });
  }

  protected majPoids(p: PoidsPilier, v: number | null): void {
    p.poidsPct = v ?? 0;
    this.rejouer();
  }

  protected majSeuil(s: SeuilSousComposante, v: number | null): void {
    s.seuil = v ?? 0;
    this.rejouer();
  }

  protected majSens(s: SeuilSousComposante, v: unknown): void {
    if (v === 'sup' || v === 'inf') {
      s.sens = v;
      this.rejouer();
    }
  }

  protected majTolerance(s: SeuilSousComposante, v: number | null): void {
    s.tolerance = v;
    this.rejouer();
  }

  private async charger(): Promise<void> {
    this.versions.set(await this.service.lister());
  }

  protected async voir(id: number): Promise<void> {
    this.brouillon.set(null);
    this.selection.set(await this.service.detail(id));
  }

  private brouillonDepuis(d: GrilleDetail): EntreeGrille {
    return {
      version: d.version,
      effetAPartirDe: d.effetAPartirDe,
      poids: d.poids.map((p) => ({ ...p })),
      seuils: d.seuils.map((s) => ({ ...s })),
    };
  }

  protected async nouvelleVersion(): Promise<void> {
    const enVigueur = this.versions().find((g) => g.statut === 'en_vigueur') ?? this.versions()[0];
    if (!enVigueur) return;
    const modele = this.brouillonDepuis(await this.service.detail(enVigueur.id));
    modele.version = '';
    modele.effetAPartirDe = '';
    this.enModification.set(false);
    this.selection.set(null);
    this.brouillon.set(modele);
  }

  protected editer(): void {
    const s = this.selection();
    if (!s?.modifiable) return;
    this.enModification.set(true);
    this.brouillon.set(this.brouillonDepuis(s));
  }

  protected annuler(): void {
    this.brouillon.set(null);
  }

  protected async enregistrer(): Promise<void> {
    const b = this.brouillon();
    if (!b) return;
    this.enCours.set(true);
    try {
      const enregistree =
        this.enModification() && this.selection()
          ? await this.service.modifier(this.selection()!.id, b)
          : await this.service.creer(b);
      this.brouillon.set(null);
      await this.charger();
      this.selection.set(enregistree);
      toast.success(`Version ${enregistree.version} enregistrée`);
    } catch (err) {
      toast.error(messageErreurHttp(err));
    } finally {
      this.enCours.set(false);
    }
  }

  protected async supprimer(id: number): Promise<void> {
    try {
      await this.service.supprimer(id);
      this.selection.set(null);
      await this.charger();
      toast.success('Version supprimée');
    } catch (err) {
      toast.error(messageErreurHttp(err));
    }
  }
}
