import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { EntreeStrate, VueStrates } from '@dqa/contracts';
import { AdminStratesService } from '../core/admin-strates.service';
import { messageErreurHttp } from '../core/message-erreur';
import { AuthService } from '../core/auth.service';
import { Coquille } from '../ui/coquille';

/** Valeurs de repli d'un type non encore classé (ADR 0013). */
const REPLI = { strate: '', jourLimiteRequisition: 10, estDistrict: false } as const;

interface LigneStrate {
  readonly typeStructure: string;
  readonly enregistre: EntreeStrate | null;
}

/**
 * Administration du référentiel des types de structure (ADR 0013). Chaque
 * `type_structure` porte sa strate d'affichage, le jour limite de soumission
 * d'une réquisition et le régime de scoring (district ou site de soins). Un
 * changement prend effet au rafraîchissement suivant, rien n'est gelé. Un type
 * sans correspondance agrège sous « Non classé » (strate), avec échéance 10 et
 * régime site de soins ; il apparaît ici en tête tant qu'il n'est pas classé.
 * Lecture seule hors rôle coordination.
 */
@Component({
  selector: 'dqa-admin-strates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Coquille, HlmTableImports, HlmBadge, HlmButton, HlmInput, HlmLabel],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-5xl px-6 py-6">
      <h1 class="text-2xl font-bold tracking-tight">Types de structure</h1>
      <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
        Référentiel des
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">type_structure</code>
        du référentiel DAP. Chaque type porte&nbsp;: sa
        <b class="font-medium text-foreground">strate</b> d'affichage des lectures
        nationales, le
        <b class="font-medium text-foreground">jour limite</b> de soumission d'une
        réquisition (jour du mois suivant), et son
        <b class="font-medium text-foreground">régime</b> de scoring. Un type sans
        correspondance est agrégé sous <b class="font-medium text-foreground">Non
        classé</b> (échéance 10, site de soins), jamais ignoré. Un changement
        prend effet au rafraîchissement suivant, sans ré-import.
      </p>

      @if (!modifiable()) {
        <p class="mt-4 text-sm text-muted-foreground" role="status">
          Consultation seule : seule la coordination modifie le référentiel.
        </p>
      }

      @if (chargement()) {
        <p class="mt-6 text-sm text-muted-foreground">Chargement…</p>
      } @else {
        @if (modifiable()) {
          <form class="mt-5 flex flex-wrap items-end gap-3" (ngSubmit)="ajouter()">
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="type">Type de structure</label>
              <input hlmInput id="type" name="type" class="w-56" [(ngModel)]="nouveauType" required />
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="strate">Strate</label>
              <input hlmInput id="strate" name="strate" class="w-48" [(ngModel)]="nouvelleStrate" required />
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="jour">Jour limite</label>
              <input
                hlmInput
                id="jour"
                name="jour"
                type="number"
                min="1"
                max="28"
                class="w-24 tabular-nums"
                [(ngModel)]="nouveauJour"
              />
            </div>
            <label class="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" name="district" [(ngModel)]="nouveauDistrict" />
              District
            </label>
            <button hlmBtn type="submit" [disabled]="!formulaireValide() || enCours()">
              Ajouter ou mettre à jour
            </button>
          </form>
        }

        <div hlmTableContainer class="mt-6 rounded-lg border border-border">
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh>Type de structure</th>
                <th hlmTh>Strate</th>
                <th hlmTh class="text-right">Jour limite</th>
                <th hlmTh>Régime</th>
                <th hlmTh><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (l of lignes(); track l.typeStructure) {
                <tr hlmTr [class.bg-muted]="l.enregistre === null">
                  <td hlmTd>
                    <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">{{ l.typeStructure }}</code>
                  </td>
                  <td hlmTd>
                    @if (modifiable()) {
                      <input
                        hlmInput
                        class="h-8 w-44"
                        [ngModel]="brouillonDe(l).strate"
                        (ngModelChange)="majBrouillon(l, { strate: $event })"
                        [attr.aria-label]="'Strate pour ' + l.typeStructure"
                      />
                    } @else if (l.enregistre !== null) {
                      <span>{{ l.enregistre.strate }}</span>
                    } @else {
                      <span hlmBadge variant="secondary">Non classé</span>
                    }
                  </td>
                  <td hlmTd class="text-right">
                    @if (modifiable()) {
                      <input
                        hlmInput
                        type="number"
                        min="1"
                        max="28"
                        class="h-8 w-20 tabular-nums"
                        [ngModel]="brouillonDe(l).jourLimiteRequisition"
                        (ngModelChange)="majBrouillon(l, { jourLimiteRequisition: +$event })"
                        [attr.aria-label]="'Jour limite pour ' + l.typeStructure"
                      />
                    } @else {
                      <span class="tabular-nums">{{ (l.enregistre ?? repli).jourLimiteRequisition }}</span>
                    }
                  </td>
                  <td hlmTd>
                    @if (modifiable()) {
                      <label class="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          [ngModel]="brouillonDe(l).estDistrict"
                          (ngModelChange)="majBrouillon(l, { estDistrict: $event })"
                          [attr.aria-label]="'Régime district pour ' + l.typeStructure"
                        />
                        District
                      </label>
                    } @else {
                      <span>{{ (l.enregistre ?? repli).estDistrict ? 'District' : 'Site de soins' }}</span>
                    }
                  </td>
                  <td hlmTd class="text-right">
                    @if (modifiable()) {
                      <div class="flex justify-end gap-1">
                        <button
                          hlmBtn
                          variant="ghost"
                          size="sm"
                          type="button"
                          [disabled]="!aModification(l) || enCours()"
                          (click)="enregistrer(l)"
                        >
                          Enregistrer
                        </button>
                        @if (l.enregistre !== null) {
                          <button
                            hlmBtn
                            variant="ghost"
                            size="sm"
                            type="button"
                            class="text-destructive"
                            [disabled]="enCours()"
                            (click)="retirer(l.typeStructure)"
                          >
                            Retirer
                          </button>
                        }
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          <span hlmBadge variant="secondary">{{ nbNonClasses() }} non classé(s)</span>
          sur {{ lignes().length }} type(s) de structure connu(s).
        </p>
      }
    </main>
  `,
})
export class AdminStratesPage {
  private readonly service = inject(AdminStratesService);
  private readonly auth = inject(AuthService);

  protected readonly repli = REPLI;
  protected readonly modifiable = computed(() => this.auth.utilisateur()?.role === 'coordination');

  protected nouveauType = '';
  protected nouvelleStrate = '';
  protected nouveauJour = 10;
  protected nouveauDistrict = false;

  protected readonly etat = signal<VueStrates>({ mappings: [], nonClasses: [] });
  protected readonly brouillon = signal<Record<string, EntreeStrate>>({});
  protected readonly chargement = signal(true);
  protected readonly enCours = signal(false);

  protected readonly lignes = computed<readonly LigneStrate[]>(() => {
    const e = this.etat();
    const nonClasses = e.nonClasses.map((typeStructure) => ({ typeStructure, enregistre: null }));
    const mappings = e.mappings.map((m) => ({
      typeStructure: m.typeStructure,
      enregistre: {
        strate: m.strate,
        jourLimiteRequisition: m.jourLimiteRequisition,
        estDistrict: m.estDistrict,
      },
    }));
    return [...nonClasses, ...mappings];
  });

  protected readonly nbNonClasses = computed(() => this.etat().nonClasses.length);

  constructor() {
    void this.charger();
  }

  protected brouillonDe(l: LigneStrate): EntreeStrate {
    return this.brouillon()[l.typeStructure] ?? l.enregistre ?? REPLI;
  }

  protected majBrouillon(l: LigneStrate, partiel: Partial<EntreeStrate>): void {
    const courant = this.brouillonDe(l);
    this.brouillon.set({ ...this.brouillon(), [l.typeStructure]: { ...courant, ...partiel } });
  }

  protected aModification(l: LigneStrate): boolean {
    const d = this.brouillon()[l.typeStructure];
    if (d === undefined) return false;
    if (!estEntreeValide(d)) return false;
    const base = l.enregistre ?? REPLI;
    return (
      d.strate.trim() !== base.strate ||
      d.jourLimiteRequisition !== base.jourLimiteRequisition ||
      d.estDistrict !== base.estDistrict
    );
  }

  protected formulaireValide(): boolean {
    return (
      this.nouveauType.trim().length > 0 &&
      estEntreeValide({
        strate: this.nouvelleStrate,
        jourLimiteRequisition: this.nouveauJour,
        estDistrict: this.nouveauDistrict,
      })
    );
  }

  private async charger(): Promise<void> {
    this.etat.set(await this.service.etat());
    this.brouillon.set({});
    this.chargement.set(false);
  }

  protected async ajouter(): Promise<void> {
    if (!this.formulaireValide()) return;
    await this.appliquer(
      this.nouveauType.trim(),
      {
        strate: this.nouvelleStrate.trim(),
        jourLimiteRequisition: this.nouveauJour,
        estDistrict: this.nouveauDistrict,
      },
      () => {
        this.nouveauType = '';
        this.nouvelleStrate = '';
        this.nouveauJour = 10;
        this.nouveauDistrict = false;
      },
    );
  }

  protected async enregistrer(l: LigneStrate): Promise<void> {
    const d = this.brouillonDe(l);
    if (!estEntreeValide(d)) return;
    await this.appliquer(l.typeStructure, { ...d, strate: d.strate.trim() });
  }

  private async appliquer(typeStructure: string, entree: EntreeStrate, apres?: () => void): Promise<void> {
    if (!typeStructure || !estEntreeValide(entree)) return;
    this.enCours.set(true);
    try {
      await this.service.enregistrer(typeStructure, { ...entree, strate: entree.strate.trim() });
      apres?.();
      await this.charger();
      toast.success('Type de structure enregistré.');
    } catch (err) {
      toast.error(messageErreurHttp(err));
    } finally {
      this.enCours.set(false);
    }
  }

  protected async retirer(typeStructure: string): Promise<void> {
    this.enCours.set(true);
    try {
      await this.service.supprimer(typeStructure);
      await this.charger();
      toast.success('Type retiré. Il retombe sous « Non classé », échéance 10, site de soins.');
    } catch (err) {
      toast.error(messageErreurHttp(err));
    } finally {
      this.enCours.set(false);
    }
  }
}

function estEntreeValide(e: EntreeStrate): boolean {
  return (
    e.strate.trim().length > 0 &&
    Number.isInteger(e.jourLimiteRequisition) &&
    e.jourLimiteRequisition >= 1 &&
    e.jourLimiteRequisition <= 28
  );
}
