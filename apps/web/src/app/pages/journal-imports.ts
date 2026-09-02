import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmBadge, type BadgeVariants } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { AnomalieImport, Gravite, LotImport, StatutImport } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { ImportService } from '../core/import.service';
import { Coquille } from '../ui/coquille';

type Variante = BadgeVariants['variant'];

/**
 * Journal des lots d'import transmis par la DAP. Table spartan, badges de
 * statut spartan (les statuts d'import ne recoupent pas les statuts de
 * sous-composante, donc `badge` et pas `dqa-badge-statut`). Ligne d'anomalies
 * dépliable ; état vide explicite.
 */
@Component({
  selector: 'dqa-journal-imports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Coquille, HlmTableImports, HlmBadge, HlmButton],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-6xl px-6 py-6">
      <h1 class="text-2xl font-bold tracking-tight">Journal des imports</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        Historique des fichiers hebdomadaires. Un lot rejeté n'a modifié aucune donnée.
      </p>

      @if (chargement()) {
        <p class="mt-6 text-sm text-muted-foreground">Chargement…</p>
      } @else if (lots().length === 0) {
        <div class="mt-6 rounded-lg border border-dashed border-border px-4 py-12 text-center">
          <p class="text-sm font-medium text-foreground">Aucun import traité</p>
          <p class="mt-1 text-sm text-muted-foreground">
            Aucun fichier hebdomadaire n'a encore été reçu de la DAP.
          </p>
        </div>
      } @else {
        <div hlmTableContainer class="mt-6 rounded-lg border border-border">
          <table hlmTable>
            <thead hlmTHead>
              <tr hlmTr>
                <th hlmTh>Reçu le</th>
                <th hlmTh>Fichier</th>
                <th hlmTh>Mois PAQD</th>
                <th hlmTh>Statut</th>
                <th hlmTh>Compteurs</th>
                <th hlmTh><span class="sr-only">Anomalies</span></th>
              </tr>
            </thead>
            <tbody hlmTBody>
              @for (lot of lots(); track lot.id) {
                <tr hlmTr>
                  <td hlmTd class="tabular-nums">{{ lot.recuLe | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td hlmTd class="font-medium">{{ lot.nomFichier }}</td>
                  <td hlmTd class="tabular-nums">{{ lot.moisPaqd ?? absent }}</td>
                  <td hlmTd>
                    <span hlmBadge [variant]="varianteStatut(lot.statut)">
                      {{ libelleStatut(lot.statut) }}
                    </span>
                    @if (lot.motifRejet) {
                      <span class="mt-1 block max-w-xs text-xs whitespace-normal text-muted-foreground">
                        {{ lot.motifRejet }}
                      </span>
                    }
                  </td>
                  <td hlmTd class="text-xs tabular-nums text-muted-foreground">
                    {{ resumeCompteurs(lot) }}
                  </td>
                  <td hlmTd class="text-right">
                    <button
                      hlmBtn
                      variant="ghost"
                      size="sm"
                      type="button"
                      [attr.aria-expanded]="ouvert() === lot.id"
                      (click)="basculer(lot.id)"
                    >
                      {{ ouvert() === lot.id ? 'Masquer' : 'Anomalies' }}
                    </button>
                  </td>
                </tr>
                @if (ouvert() === lot.id) {
                  <tr hlmTr>
                    <td hlmTd colspan="6" class="bg-muted/50">
                      <div class="whitespace-normal py-1">
                        @if (anomalies().length === 0) {
                          <p class="text-sm text-muted-foreground">
                            Aucune anomalie relevée sur ce lot.
                          </p>
                        } @else {
                          <ul class="flex flex-col gap-1.5">
                            @for (a of anomalies(); track $index) {
                              <li class="flex flex-wrap items-center gap-2 text-sm">
                                <span hlmBadge [variant]="varianteGravite(a.gravite)">
                                  {{ libelleGravite(a.gravite) }}
                                </span>
                                @if (a.onglet) {
                                  <span class="font-medium">{{ a.onglet }}</span>
                                }
                                @if (a.ligneSource) {
                                  <span class="text-muted-foreground">ligne {{ a.ligneSource }}</span>
                                }
                                <span>{{ a.message }}</span>
                              </li>
                            }
                          </ul>
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </main>
  `,
})
export class JournalImportsPage {
  protected readonly absent = VALEUR_ABSENTE;
  private readonly service = inject(ImportService);

  protected readonly lots = signal<LotImport[]>([]);
  protected readonly chargement = signal(true);
  protected readonly ouvert = signal<number | null>(null);
  protected readonly anomalies = signal<AnomalieImport[]>([]);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.lots.set(await this.service.listerLots());
    this.chargement.set(false);
  }

  protected async basculer(lotId: number): Promise<void> {
    if (this.ouvert() === lotId) {
      this.ouvert.set(null);
      return;
    }
    try {
      this.anomalies.set(await this.service.anomalies(lotId));
      this.ouvert.set(lotId);
    } catch {
      toast.error('Anomalies du lot indisponibles.');
    }
  }

  protected libelleStatut(s: StatutImport): string {
    return { recu: 'Reçu', en_cours: 'En cours', valide: 'Validé', rejete: 'Rejeté' }[s];
  }

  protected varianteStatut(s: StatutImport): Variante {
    return (
      {
        recu: 'secondary',
        en_cours: 'outline',
        valide: 'default',
        rejete: 'destructive',
      } satisfies Record<StatutImport, Variante>
    )[s];
  }

  protected libelleGravite(g: Gravite): string {
    return { info: 'Info', avertissement: 'Avertissement', erreur: 'Erreur' }[g];
  }

  protected varianteGravite(g: Gravite): Variante {
    return (
      {
        info: 'secondary',
        avertissement: 'outline',
        erreur: 'destructive',
      } satisfies Record<Gravite, Variante>
    )[g];
  }

  protected resumeCompteurs(lot: LotImport): string {
    const jeux = Object.keys(lot.nbLignesReelles);
    return jeux
      .map((j) => `${j}: ${lot.nbLignesReelles[j] ?? 0}`)
      .slice(0, 4)
      .join(' · ');
  }
}
