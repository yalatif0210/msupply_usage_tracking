import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { ProduitTraceur } from '@dqa/contracts';
import { TraceursService } from '../core/traceurs.service';
import { Entete } from '../ui/entete';

@Component({
  selector: 'dqa-admin-traceurs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, Entete],
  template: `
    <dqa-entete />
    <main>
      <h1>Produits traceurs</h1>
      <p class="intro">
        Panier de produits retenu pour les piliers P4 (écart SDU) et P5
        (concordance). Le code doit correspondre au <code>produit_code</code> du
        fichier d'extraction.
      </p>

      <form (ngSubmit)="ajouter()">
        <input name="code" [(ngModel)]="code" placeholder="Code produit" required />
        <input name="libelle" [(ngModel)]="libelle" placeholder="Libellé (facultatif)" />
        <button type="submit" [disabled]="!code || enCours()">Ajouter / mettre à jour</button>
      </form>
      @if (erreur()) {
        <p class="erreur" role="alert">{{ erreur() }}</p>
      }

      @if (chargement()) {
        <p>Chargement…</p>
      } @else {
        <table>
          <thead>
            <tr><th>Code</th><th>Libellé</th><th>Actif</th><th>Modifié le</th><th></th></tr>
          </thead>
          <tbody>
            @for (t of traceurs(); track t.produitCode) {
              <tr [class.inactif]="!t.actif">
                <td><code>{{ t.produitCode }}</code></td>
                <td>{{ t.libelle ?? '—' }}</td>
                <td>
                  <label class="switch">
                    <input type="checkbox" [checked]="t.actif" (change)="basculer(t)" />
                    {{ t.actif ? 'oui' : 'non' }}
                  </label>
                </td>
                <td>{{ t.majLe | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td><button type="button" class="lien" (click)="retirer(t)">Retirer</button></td>
              </tr>
            }
          </tbody>
        </table>
      }
    </main>
  `,
  styles: `
    main { max-width: 60rem; margin: 0 auto; padding: 0 1rem; }
    h1 { font-size: 1.6rem; }
    .intro { color: #5b5b5b; font-size: 0.9rem; }
    form { display: flex; gap: 0.75rem; margin: 1rem 0; flex-wrap: wrap; }
    input { padding: 0.5rem; border: 1px solid #d9d9d6; }
    button { padding: 0.5rem 0.9rem; background: #1f3d7a; color: #fff; border: 0; cursor: pointer; }
    button[disabled] { opacity: 0.5; cursor: default; }
    .lien { background: none; color: #8a1c13; padding: 0; text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.6rem; border-bottom: 1px solid #d9d9d6; }
    tr.inactif { color: #999; }
    .erreur { color: #8a1c13; }
    .switch { display: inline-flex; gap: 0.4rem; align-items: center; font-size: 0.85rem; }
  `,
})
export class AdminTraceursPage {
  private readonly service = inject(TraceursService);

  protected code = '';
  protected libelle = '';
  protected readonly traceurs = signal<ProduitTraceur[]>([]);
  protected readonly chargement = signal(true);
  protected readonly enCours = signal(false);
  protected readonly erreur = signal<string | null>(null);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.traceurs.set(await this.service.lister());
    this.chargement.set(false);
  }

  protected async ajouter(): Promise<void> {
    this.erreur.set(null);
    this.enCours.set(true);
    try {
      await this.service.enregistrer({
        produitCode: this.code.trim(),
        libelle: this.libelle.trim() || undefined,
      });
      this.code = '';
      this.libelle = '';
      await this.charger();
    } catch {
      this.erreur.set('Enregistrement impossible.');
    } finally {
      this.enCours.set(false);
    }
  }

  protected async basculer(t: ProduitTraceur): Promise<void> {
    await this.service.enregistrer({ produitCode: t.produitCode, actif: !t.actif });
    await this.charger();
  }

  protected async retirer(t: ProduitTraceur): Promise<void> {
    await this.service.supprimer(t.produitCode);
    await this.charger();
  }
}
