import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCheckbox } from '@spartan-ng/helm/checkbox';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { ProduitTraceur } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { messageErreurHttp } from '../core/message-erreur';
import { TraceursService } from '../core/traceurs.service';
import { Coquille } from '../ui/coquille';

/**
 * Administration du panier de produits traceurs (P4 / P5). Table et champs
 * spartan ; retours utilisateur en toasts sonner. Une ligne inactive reste
 * lisible mais estompée.
 */
@Component({
  selector: 'dqa-admin-traceurs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DatePipe,
    Coquille,
    HlmTableImports,
    HlmBadge,
    HlmButton,
    HlmCheckbox,
    HlmInput,
    HlmLabel,
  ],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-5xl px-6 py-6">
      <h1 class="text-2xl font-bold tracking-tight">Produits traceurs</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        Panier de produits retenu pour les piliers P4 (écart SDU) et P5
        (concordance). Le code doit correspondre au
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">produit_code</code>
        du fichier d'extraction.
      </p>

      <form class="mt-5 flex flex-wrap items-end gap-3" (ngSubmit)="ajouter()">
        <div class="flex flex-col gap-1.5">
          <label hlmLabel for="code">Code produit</label>
          <input hlmInput id="code" name="code" class="w-56" [(ngModel)]="code" required />
        </div>
        <div class="flex flex-col gap-1.5">
          <label hlmLabel for="libelle">Libellé (facultatif)</label>
          <input hlmInput id="libelle" name="libelle" class="w-72" [(ngModel)]="libelle" />
        </div>
        <button hlmBtn type="submit" [disabled]="!code || enCours()">Ajouter ou mettre à jour</button>
      </form>

      @if (chargement()) {
        <p class="mt-6 text-sm text-muted-foreground">Chargement…</p>
      } @else if (traceurs().length === 0) {
        <div class="mt-6 rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p class="text-sm font-medium text-foreground">Aucun produit traceur</p>
          <p class="mt-1 text-sm text-muted-foreground">
            Ajoutez un premier code produit pour composer le panier P4 / P5.
          </p>
        </div>
      } @else {
        <div hlmTableContainer class="mt-6 rounded-lg border border-border">
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh>Code</th>
                <th hlmTh>Libellé</th>
                <th hlmTh>Actif</th>
                <th hlmTh>Modifié le</th>
                <th hlmTh><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (t of traceurs(); track t.produitCode) {
                <tr hlmTr [class.opacity-60]="!t.actif">
                  <td hlmTd>
                    <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">{{ t.produitCode }}</code>
                  </td>
                  <td hlmTd [class.text-muted-foreground]="!t.libelle">{{ t.libelle ?? absent }}</td>
                  <td hlmTd>
                    <label class="flex items-center gap-2 text-sm">
                      <hlm-checkbox [checked]="t.actif" (checkedChange)="basculer(t)" />
                      <span>{{ t.actif ? 'oui' : 'non' }}</span>
                    </label>
                  </td>
                  <td hlmTd class="tabular-nums text-muted-foreground">
                    {{ t.majLe | date: 'dd/MM/yyyy HH:mm' }}
                  </td>
                  <td hlmTd class="text-right">
                    <button
                      hlmBtn
                      variant="ghost"
                      size="sm"
                      type="button"
                      class="text-destructive"
                      (click)="retirer(t)"
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="mt-2 text-xs text-muted-foreground">
          <span hlmBadge variant="secondary">{{ actifs() }} actif(s)</span>
          sur {{ traceurs().length }} code(s) enregistré(s).
        </p>
      }
    </main>
  `,
})
export class AdminTraceursPage {
  protected readonly absent = VALEUR_ABSENTE;
  private readonly service = inject(TraceursService);

  protected code = '';
  protected libelle = '';
  protected readonly traceurs = signal<ProduitTraceur[]>([]);
  protected readonly chargement = signal(true);
  protected readonly enCours = signal(false);

  constructor() {
    void this.charger();
  }

  protected actifs(): number {
    return this.traceurs().filter((t) => t.actif).length;
  }

  private async charger(): Promise<void> {
    this.traceurs.set(await this.service.lister());
    this.chargement.set(false);
  }

  protected async ajouter(): Promise<void> {
    this.enCours.set(true);
    try {
      await this.service.enregistrer({
        produitCode: this.code.trim(),
        libelle: this.libelle.trim() || undefined,
      });
      this.code = '';
      this.libelle = '';
      await this.charger();
      toast.success('Produit traceur enregistré.');
    } catch (err) {
      toast.error(messageErreurHttp(err));
    } finally {
      this.enCours.set(false);
    }
  }

  protected async basculer(t: ProduitTraceur): Promise<void> {
    try {
      await this.service.enregistrer({ produitCode: t.produitCode, actif: !t.actif });
      await this.charger();
      toast.success(t.actif ? 'Produit désactivé.' : 'Produit activé.');
    } catch (err) {
      toast.error(messageErreurHttp(err));
      await this.charger();
    }
  }

  protected async retirer(t: ProduitTraceur): Promise<void> {
    try {
      await this.service.supprimer(t.produitCode);
      await this.charger();
      toast.success('Produit traceur retiré.');
    } catch (err) {
      toast.error(messageErreurHttp(err));
    }
  }
}
