import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { AnomalieImport, LotImport } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { ImportService } from '../core/import.service';
import { Coquille } from '../ui/coquille';

@Component({
  selector: 'dqa-journal-imports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Coquille],
  template: `
    <dqa-coquille />
    <main>
      <h1>Journal des imports</h1>

      @if (chargement()) {
      <p>Chargement…</p>
    } @else if (lots().length === 0) {
      <p class="vide">Aucun import n'a encore été traité.</p>
    } @else {
      <table>
        <thead>
          <tr>
            <th>Reçu le</th>
            <th>Fichier</th>
            <th>Mois PAQD</th>
            <th>Statut</th>
            <th>Compteurs</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (lot of lots(); track lot.id) {
            <tr [class.rejete]="lot.statut === 'rejete'">
              <td>{{ lot.recuLe | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td>{{ lot.nomFichier }}</td>
              <td>{{ lot.moisPaqd ?? absent }}</td>
              <td>
                <span class="badge {{ lot.statut }}">{{ libelleStatut(lot.statut) }}</span>
                @if (lot.motifRejet) {
                  <span class="motif">{{ lot.motifRejet }}</span>
                }
              </td>
              <td class="compteurs">{{ resumeCompteurs(lot) }}</td>
              <td>
                <button type="button" (click)="basculer(lot.id)">
                  {{ ouvert() === lot.id ? 'Masquer' : 'Anomalies' }}
                </button>
              </td>
            </tr>
            @if (ouvert() === lot.id) {
              <tr class="detail">
                <td colspan="6">
                  @if (anomalies().length === 0) {
                    <p>Aucune anomalie.</p>
                  } @else {
                    <ul>
                      @for (a of anomalies(); track $index) {
                        <li>
                          <span class="badge {{ a.gravite }}">{{ a.gravite }}</span>
                          @if (a.onglet) {
                            <strong>{{ a.onglet }}</strong>
                          }
                          @if (a.ligneSource) {
                            <span>ligne {{ a.ligneSource }}</span>
                          }
                          : {{ a.message }}
                        </li>
                      }
                    </ul>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    }
    </main>
  `,
  styles: `
    main { display: block; max-width: 72rem; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.6rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid var(--bordure); vertical-align: top; }
    tr.rejete td { background: var(--alerte-fond); }
    tr.detail td { background: var(--surface-alt); }
    .compteurs { font-variant-numeric: tabular-nums; font-size: 0.85rem; color: var(--texte-doux); }
    .motif { display: block; font-size: 0.8rem; color: var(--alerte-texte); }
    .badge { display: inline-block; padding: 0.1rem 0.4rem; font-size: 0.75rem; }
    .badge.valide { background: var(--conforme-fond); color: var(--conforme-texte); }
    .badge.rejete, .badge.erreur { background: var(--alerte-fond); color: var(--alerte-texte); }
    .badge.avertissement { background: var(--partiel-fond); color: var(--partiel-texte); }
    ul { margin: 0; padding-left: 1rem; }
    li { line-height: 1.8; }
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
    this.anomalies.set(await this.service.anomalies(lotId));
    this.ouvert.set(lotId);
  }

  protected libelleStatut(s: LotImport['statut']): string {
    return { recu: 'Reçu', en_cours: 'En cours', valide: 'Validé', rejete: 'Rejeté' }[s];
  }

  protected resumeCompteurs(lot: LotImport): string {
    const jeux = Object.keys(lot.nbLignesReelles);
    return jeux
      .map((j) => `${j}: ${lot.nbLignesReelles[j] ?? 0}`)
      .slice(0, 4)
      .join(' · ');
  }
}
