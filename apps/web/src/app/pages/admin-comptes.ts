import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ROLES, type CompteAdmin, type EntreeCompte, type MajCompte } from '@dqa/contracts';
import { AdminComptesService } from '../core/admin-comptes.service';
import { AuthService } from '../core/auth.service';
import { messageErreurHttp } from '../core/message-erreur';
import { Entete } from '../ui/entete';

@Component({
  selector: 'dqa-admin-comptes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, Entete],
  template: `
    <dqa-entete />
    <main>
      <h1>Comptes</h1>
      <p class="intro">
        Le rôle <b>admin</b> gère les comptes sans toucher aux données.
        <b>coordination</b> déclenche les imports et édite la grille et les
        traceurs. <b>lecteur</b> consulte seulement.
      </p>

      @if (erreur()) {
        <p class="erreur" role="alert">{{ erreur() }}</p>
      }

      <form (ngSubmit)="creer()">
        <input name="identifiant" [(ngModel)]="nouveau.identifiant" placeholder="Identifiant" required />
        <input name="nom" [(ngModel)]="nouveau.nom" placeholder="Nom" required />
        <select name="role" [(ngModel)]="nouveau.role">
          @for (r of roles; track r) { <option [value]="r">{{ r }}</option> }
        </select>
        <input name="mdp" type="password" [(ngModel)]="nouveau.motDePasse" placeholder="Mot de passe (8+)" required />
        <button type="submit" [disabled]="enCours()">Créer</button>
      </form>

      @if (chargement()) {
        <p>Chargement…</p>
      } @else {
        <table>
          <thead>
            <tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>Actif</th><th>Créé</th><th></th></tr>
          </thead>
          <tbody>
            @for (c of comptes(); track c.id) {
              <tr [class.inactif]="!c.actif">
                <td>{{ c.identifiant }}</td>
                <td><input [(ngModel)]="c.nom" [name]="'nom-' + c.id" /></td>
                <td>
                  <select [(ngModel)]="c.role" [name]="'role-' + c.id" [disabled]="verrouille(c)">
                    @for (r of roles; track r) { <option [value]="r">{{ r }}</option> }
                  </select>
                </td>
                <td>
                  <label class="switch">
                    <input type="checkbox" [checked]="c.actif" [disabled]="verrouille(c)" (change)="basculer(c)" />
                    {{ c.actif ? 'oui' : 'non' }}
                  </label>
                </td>
                <td>{{ c.creeLe | date: 'dd/MM/yyyy' }}</td>
                <td class="actions">
                  <button type="button" class="lien" (click)="enregistrer(c)">Enregistrer</button>
                  <button type="button" class="lien" (click)="ouvrirMdp(c)">Mot de passe</button>
                </td>
              </tr>
              @if (mdpPour() === c.id) {
                <tr class="ligne-mdp">
                  <td colspan="6">
                    <input type="password" [(ngModel)]="mdpValeur" name="mdp-valeur" placeholder="Nouveau mot de passe (8+)" />
                    <button type="button" (click)="validerMdp(c)" [disabled]="mdpValeur.length < 8">Réinitialiser</button>
                    <button type="button" class="lien" (click)="mdpPour.set(null)">Annuler</button>
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
    main { max-width: 62rem; margin: 0 auto; padding: 0 1rem; }
    h1 { font-size: 1.6rem; }
    .intro { color: #5b5b5b; font-size: 0.9rem; }
    form { display: flex; gap: 0.6rem; margin: 1rem 0; flex-wrap: wrap; }
    input, select { padding: 0.45rem; border: 1px solid #d9d9d6; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #d9d9d6; vertical-align: middle; }
    tr.inactif { color: #999; }
    .actions { display: flex; gap: 0.8rem; }
    .ligne-mdp td { display: flex; gap: 0.6rem; align-items: center; }
    button { padding: 0.45rem 0.8rem; background: #1f3d7a; color: #fff; border: 0; cursor: pointer; }
    button[disabled] { opacity: 0.5; cursor: default; }
    .lien { background: none; color: #1f3d7a; padding: 0; text-decoration: underline; }
    .switch { display: inline-flex; gap: 0.4rem; align-items: center; font-size: 0.85rem; }
    .erreur { color: #8a1c13; }
  `,
})
export class AdminComptesPage {
  private readonly service = inject(AdminComptesService);
  private readonly auth = inject(AuthService);

  protected readonly roles = ROLES;
  protected readonly comptes = signal<CompteAdmin[]>([]);
  protected readonly chargement = signal(true);
  protected readonly enCours = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly mdpPour = signal<string | null>(null);
  protected mdpValeur = '';

  protected nouveau: EntreeCompte = { identifiant: '', nom: '', role: 'lecteur', motDePasse: '' };

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.comptes.set(await this.service.lister());
    this.chargement.set(false);
  }

  protected estMoi(c: CompteAdmin): boolean {
    return this.auth.utilisateur()?.id === c.id;
  }

  /** Verrouillé côté client : soi-même, ou le dernier administrateur actif. */
  protected verrouille(c: CompteAdmin): boolean {
    if (this.estMoi(c)) return true;
    const adminsActifs = this.comptes().filter((x) => x.role === 'admin' && x.actif);
    return c.role === 'admin' && c.actif && adminsActifs.length === 1;
  }

  protected async creer(): Promise<void> {
    this.erreur.set(null);
    this.enCours.set(true);
    try {
      await this.service.creer({ ...this.nouveau, identifiant: this.nouveau.identifiant.trim(), nom: this.nouveau.nom.trim() });
      this.nouveau = { identifiant: '', nom: '', role: 'lecteur', motDePasse: '' };
      await this.charger();
    } catch (err) {
      this.erreur.set(messageErreurHttp(err));
    } finally {
      this.enCours.set(false);
    }
  }

  protected async enregistrer(c: CompteAdmin): Promise<void> {
    await this.appliquer(c, { nom: c.nom, role: c.role, actif: c.actif });
  }

  protected async basculer(c: CompteAdmin): Promise<void> {
    await this.appliquer(c, { nom: c.nom, role: c.role, actif: !c.actif });
  }

  private async appliquer(c: CompteAdmin, maj: MajCompte): Promise<void> {
    this.erreur.set(null);
    try {
      await this.service.modifier(c.id, maj);
      await this.charger();
    } catch (err) {
      this.erreur.set(messageErreurHttp(err));
      await this.charger();
    }
  }

  protected ouvrirMdp(c: CompteAdmin): void {
    this.mdpValeur = '';
    this.mdpPour.set(this.mdpPour() === c.id ? null : c.id);
  }

  protected async validerMdp(c: CompteAdmin): Promise<void> {
    this.erreur.set(null);
    try {
      await this.service.reinitialiserMotDePasse(c.id, this.mdpValeur);
      this.mdpPour.set(null);
      this.mdpValeur = '';
    } catch (err) {
      this.erreur.set(messageErreurHttp(err));
    }
  }
}
