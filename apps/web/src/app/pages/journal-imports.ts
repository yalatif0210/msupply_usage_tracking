import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { AnomalieImport, LotImport } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { ImportService } from '../core/import.service';

@Component({
  selector: 'dqa-journal-imports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  template: `
    <header>
      <a routerLink="/">← Tableau de bord</a>
      <h1>Journal des imports</h1>
    </header>

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
  `,
  styles: `
    :host { display: block; max-width: 72rem; margin: 2rem auto; padding: 0 1rem; }
    header a { color: #1f3d7a; font-size: 0.9rem; }
    h1 { font-size: 1.6rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid #d9d9d6; vertical-align: top; }
    tr.rejete td { background: #fdf3f2; }
    tr.detail td { background: #f7f7f5; }
    .compteurs { font-variant-numeric: tabular-nums; font-size: 0.85rem; color: #5b5b5b; }
    .motif { display: block; font-size: 0.8rem; color: #8a1c13; }
    .badge { display: inline-block; padding: 0.1rem 0.4rem; font-size: 0.75rem; }
    .badge.valide { background: #e3f1e4; color: #1b5e20; }
    .badge.rejete, .badge.erreur { background: #fde3e1; color: #8a1c13; }
    .badge.avertissement { background: #fff3d6; color: #7a5200; }
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
