import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { VueStrates } from '@dqa/contracts';
import { AdminStratesService } from '../core/admin-strates.service';
import { messageErreurHttp } from '../core/message-erreur';
import { AuthService } from '../core/auth.service';
import { Coquille } from '../ui/coquille';

interface LigneStrate {
  readonly typeStructure: string;
  readonly strateEnregistree: string | null;
}

/**
 * Administration de la correspondance `type_structure → strate`. La strate est
 * un regroupement d'affichage des lectures nationales : un changement prend
 * effet à la consultation suivante, rien n'est gelé. Un `type_structure` sans
 * correspondance agrège sous « Non classé » ; il apparaît ici en tête tant
 * qu'il n'est pas classé. Lecture seule hors rôle coordination.
 */
@Component({
  selector: 'dqa-admin-strates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Coquille, HlmTableImports, HlmBadge, HlmButton, HlmInput, HlmLabel],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-4xl px-6 py-6">
      <h1 class="text-2xl font-bold tracking-tight">Strates de structure</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        Regroupement des
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">type_structure</code>
        du référentiel DAP pour les lectures nationales « rapports &amp;
        inventaires ». Un type sans correspondance est agrégé sous
        <b class="font-medium text-foreground">Non classé</b>, jamais ignoré. Un
        changement prend effet à la consultation suivante, sans ré-import.
      </p>

      @if (!modifiable()) {
        <p class="mt-4 text-sm text-muted-foreground" role="status">
          Consultation seule : seule la coordination modifie le classement.
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
              <input hlmInput id="strate" name="strate" class="w-56" [(ngModel)]="nouvelleStrate" required />
            </div>
            <button hlmBtn type="submit" [disabled]="!nouveauType.trim() || !nouvelleStrate.trim() || enCours()">
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
                <th hlmTh><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (l of lignes(); track l.typeStructure) {
                <tr hlmTr [class.bg-muted]="l.strateEnregistree === null">
                  <td hlmTd>
                    <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">{{ l.typeStructure }}</code>
                  </td>
                  <td hlmTd>
                    @if (modifiable()) {
                      <input
                        hlmInput
                        class="h-8 w-48 tabular-nums"
                        [ngModel]="brouillon()[l.typeStructure] ?? l.strateEnregistree ?? ''"
                        (ngModelChange)="majBrouillon(l.typeStructure, $event)"
                        [attr.aria-label]="'Strate pour ' + l.typeStructure"
                      />
                    } @else if (l.strateEnregistree !== null) {
                      <span class="tabular-nums">{{ l.strateEnregistree }}</span>
                    } @else {
                      <span hlmBadge variant="secondary">Non classé</span>
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
                          (click)="enregistrer(l.typeStructure)"
                        >
                          Enregistrer
                        </button>
                        @if (l.strateEnregistree !== null) {
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

  protected readonly modifiable = computed(() => this.auth.utilisateur()?.role === 'coordination');

  protected nouveauType = '';
  protected nouvelleStrate = '';
  protected readonly etat = signal<VueStrates>({ mappings: [], nonClasses: [] });
  protected readonly brouillon = signal<Record<string, string>>({});
  protected readonly chargement = signal(true);
  protected readonly enCours = signal(false);

  protected readonly lignes = computed<readonly LigneStrate[]>(() => {
    const e = this.etat();
    const nonClasses = e.nonClasses.map((typeStructure) => ({ typeStructure, strateEnregistree: null }));
    const mappings = e.mappings.map((m) => ({
      typeStructure: m.typeStructure,
      strateEnregistree: m.strate,
    }));
    return [...nonClasses, ...mappings];
  });

  protected readonly nbNonClasses = computed(() => this.etat().nonClasses.length);

  constructor() {
    void this.charger();
  }

  protected majBrouillon(typeStructure: string, valeur: string): void {
    this.brouillon.set({ ...this.brouillon(), [typeStructure]: valeur });
  }

  protected aModification(l: LigneStrate): boolean {
    const saisi = this.brouillon()[l.typeStructure];
    if (saisi === undefined) return false;
    const net = saisi.trim();
    return net.length > 0 && net !== (l.strateEnregistree ?? '');
  }

  private async charger(): Promise<void> {
    this.etat.set(await this.service.etat());
    this.brouillon.set({});
    this.chargement.set(false);
  }

  protected async ajouter(): Promise<void> {
    await this.appliquer(this.nouveauType.trim(), this.nouvelleStrate.trim(), () => {
      this.nouveauType = '';
      this.nouvelleStrate = '';
    });
  }

  protected async enregistrer(typeStructure: string): Promise<void> {
    const strate = (this.brouillon()[typeStructure] ?? '').trim();
    await this.appliquer(typeStructure, strate);
  }

  private async appliquer(typeStructure: string, strate: string, apres?: () => void): Promise<void> {
    if (!typeStructure || !strate) return;
    this.enCours.set(true);
    try {
      await this.service.enregistrer(typeStructure, strate);
      apres?.();
      await this.charger();
      toast.success('Correspondance enregistrée.');
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
      toast.success('Correspondance retirée. Le type retombe sous « Non classé ».');
    } catch (err) {
      toast.error(messageErreurHttp(err));
    } finally {
      this.enCours.set(false);
    }
  }
}
