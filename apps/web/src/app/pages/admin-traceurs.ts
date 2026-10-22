import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { ProduitTraceur } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { TraceursService } from '../core/traceurs.service';
import { Coquille } from '../ui/coquille';

/**
 * Panier de produits traceurs (P4 / P5), en consultation : la liste vient de
 * l'onglet PRODUITS de chaque import (ADR 0015). Un code absent du dernier lot
 * reste affiché, estompé, pour garder la trace des anciens paniers.
 */
@Component({
  selector: 'dqa-admin-traceurs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Coquille, HlmTableImports, HlmBadge],
  template: `
    <dqa-coquille />
    <main class="mx-auto w-full max-w-vue py-6">
      <h1 class="text-2xl font-bold tracking-tight">Produits traceurs</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        Panier de produits retenu pour les piliers P4 (conformité SDU et
        consommation) et P5 (concordance). La liste est tenue dans le script
        d'extraction de la DAP : chaque import la met à jour à partir de
        l'onglet PRODUITS. Un produit absent du dernier fichier reçu passe
        inactif.
      </p>

      @if (chargement()) {
        <p class="mt-6 text-sm text-muted-foreground">Chargement…</p>
      } @else if (traceurs().length === 0) {
        <div class="mt-6 rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p class="text-sm font-medium text-foreground">Aucun produit traceur</p>
          <p class="mt-1 text-sm text-muted-foreground">
            La liste se remplira au premier import d'un fichier d'extraction.
          </p>
        </div>
      } @else {
        <div hlmTableContainer class="mt-6 rounded-lg border border-border">
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh>Code</th>
                <th hlmTh>Libellé</th>
                <th hlmTh>État</th>
                <th hlmTh>Mis à jour le</th>
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
                    <span hlmBadge [variant]="t.actif ? 'default' : 'outline'">
                      {{ t.actif ? 'actif' : 'inactif' }}
                    </span>
                  </td>
                  <td hlmTd class="tabular-nums text-muted-foreground">
                    {{ t.majLe | date: 'dd/MM/yyyy HH:mm' }}
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

  protected readonly traceurs = signal<ProduitTraceur[]>([]);
  protected readonly chargement = signal(true);
  protected readonly actifs = computed(() => this.traceurs().filter((t) => t.actif).length);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.traceurs.set(await this.service.lister());
    this.chargement.set(false);
  }
}
