import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BrnDialogContent } from '@spartan-ng/brain/dialog';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { ROLES, type CompteAdmin, type EntreeCompte, type MajCompte, type Role } from '@dqa/contracts';
import { AdminComptesService } from '../core/admin-comptes.service';
import { AuthService } from '../core/auth.service';
import { messageErreurHttp } from '../core/message-erreur';
import { Coquille } from '../ui/coquille';

/** `valueChange` d'un `hlm-select` est typé `unknown` : on restreint au rôle avant d'écrire. */
const estRole = (v: unknown): v is Role =>
  typeof v === 'string' && (ROLES as readonly string[]).includes(v);

@Component({
  selector: 'dqa-admin-comptes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DatePipe,
    Coquille,
    BrnDialogContent,
    HlmButton,
    HlmDialogImports,
    HlmInput,
    HlmLabel,
    HlmSelectImports,
    HlmTableImports,
    HlmBadge,
  ],
  template: `
    <dqa-coquille />
    <main class="mx-auto max-w-6xl px-6 py-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Comptes</h1>
          <p class="mt-1 max-w-3xl text-sm text-muted-foreground">
            Le rôle <b class="font-medium text-foreground">admin</b> gère les comptes sans toucher
            aux données. <b class="font-medium text-foreground">coordination</b> déclenche les
            imports et édite la grille et les traceurs.
            <b class="font-medium text-foreground">lecteur</b> consulte seulement.
          </p>
        </div>

        <hlm-dialog #dialogCreer="hlmDialog">
          <button hlmBtn hlmDialogTrigger type="button" (click)="reinitFormulaire()">Nouveau compte</button>
          <hlm-dialog-content *brnDialogContent class="sm:max-w-md">
            <hlm-dialog-header>
              <h3 hlmDialogTitle>Nouveau compte</h3>
              <p hlmDialogDescription>
                Le compte est actif dès la création. Le mot de passe fait au moins 8 caractères.
              </p>
            </hlm-dialog-header>

            <form class="grid gap-4 py-2" (ngSubmit)="creer(dialogCreer)">
              <div class="grid gap-1.5">
                <label hlmLabel for="compte-identifiant">Identifiant</label>
                <input
                  hlmInput
                  id="compte-identifiant"
                  name="identifiant"
                  autocomplete="off"
                  required
                  [ngModel]="nouveau().identifiant"
                  (ngModelChange)="majNouveau('identifiant', $event)"
                />
              </div>
              <div class="grid gap-1.5">
                <label hlmLabel for="compte-nom">Nom</label>
                <input
                  hlmInput
                  id="compte-nom"
                  name="nom"
                  required
                  [ngModel]="nouveau().nom"
                  (ngModelChange)="majNouveau('nom', $event)"
                />
              </div>
              <div class="grid gap-1.5">
                <label hlmLabel>Rôle</label>
                <hlm-select [value]="nouveau().role" (valueChange)="majRoleNouveau($event)">
                  <hlm-select-trigger class="w-full">
                    <hlm-select-value />
                  </hlm-select-trigger>
                  <hlm-select-content *hlmSelectPortal>
                    @for (r of roles; track r) {
                      <hlm-select-item [value]="r">{{ r }}</hlm-select-item>
                    }
                  </hlm-select-content>
                </hlm-select>
              </div>
              <div class="grid gap-1.5">
                <label hlmLabel for="compte-mdp">Mot de passe</label>
                <input
                  hlmInput
                  id="compte-mdp"
                  name="motDePasse"
                  type="password"
                  autocomplete="new-password"
                  required
                  [ngModel]="nouveau().motDePasse"
                  (ngModelChange)="majNouveau('motDePasse', $event)"
                />
              </div>

              <hlm-dialog-footer>
                <button hlmBtn variant="outline" type="button" (click)="dialogCreer.close()">Annuler</button>
                <button hlmBtn type="submit" [disabled]="enCours()">Créer</button>
              </hlm-dialog-footer>
            </form>
          </hlm-dialog-content>
        </hlm-dialog>
      </div>

      <div class="mt-6 rounded-lg border border-border bg-card">
        @if (chargement()) {
          <p class="p-4 text-sm text-muted-foreground">Chargement…</p>
        } @else {
          <div hlmTableContainer>
            <table hlmTable class="w-full">
              <thead hlmTHead>
                <tr hlmTr>
                  <th hlmTh class="text-xs text-muted-foreground">Identifiant</th>
                  <th hlmTh class="text-xs text-muted-foreground">Nom</th>
                  <th hlmTh class="text-xs text-muted-foreground">Rôle</th>
                  <th hlmTh class="text-xs text-muted-foreground">Statut</th>
                  <th hlmTh class="text-xs text-muted-foreground">Créé</th>
                  <th hlmTh class="text-xs text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody hlmTBody>
                @for (c of comptes(); track c.id) {
                  <tr hlmTr [class.text-muted-foreground]="!c.actif">
                    <td hlmTd class="font-medium">{{ c.identifiant }}</td>
                    <td hlmTd>
                      <input
                        hlmInput
                        class="w-44"
                        [name]="'nom-' + c.id"
                        [ngModel]="c.nom"
                        (ngModelChange)="c.nom = $event"
                      />
                    </td>
                    <td hlmTd>
                      <hlm-select
                        [value]="c.role"
                        [disabled]="verrouille(c)"
                        (valueChange)="majRoleCompte(c, $event)"
                      >
                        <hlm-select-trigger class="w-40">
                          <hlm-select-value />
                        </hlm-select-trigger>
                        <hlm-select-content *hlmSelectPortal>
                          @for (r of roles; track r) {
                            <hlm-select-item [value]="r">{{ r }}</hlm-select-item>
                          }
                        </hlm-select-content>
                      </hlm-select>
                    </td>
                    <td hlmTd>
                      <span hlmBadge [variant]="c.actif ? 'default' : 'outline'">
                        {{ c.actif ? 'Actif' : 'Inactif' }}
                      </span>
                    </td>
                    <td hlmTd>{{ c.creeLe | date: 'dd/MM/yyyy' }}</td>
                    <td hlmTd>
                      <div class="flex flex-wrap items-center gap-1.5">
                        <button hlmBtn size="sm" type="button" (click)="enregistrer(c)">Enregistrer</button>
                        <button hlmBtn size="sm" variant="outline" type="button" (click)="ouvrirMdp(c)">
                          Mot de passe
                        </button>
                        <button
                          hlmBtn
                          size="sm"
                          [variant]="c.actif ? 'destructive' : 'outline'"
                          type="button"
                          [disabled]="verrouille(c)"
                          (click)="basculer(c)"
                        >
                          {{ c.actif ? 'Désactiver' : 'Activer' }}
                        </button>
                      </div>
                      @if (mdpPour() === c.id) {
                        <div class="mt-2 flex flex-wrap items-center gap-1.5">
                          <input
                            hlmInput
                            class="w-56"
                            type="password"
                            autocomplete="new-password"
                            placeholder="Nouveau mot de passe (8+)"
                            name="mdp-valeur"
                            [ngModel]="mdpValeur()"
                            (ngModelChange)="mdpValeur.set($event)"
                          />
                          <button
                            hlmBtn
                            size="sm"
                            type="button"
                            [disabled]="mdpValeur().length < 8"
                            (click)="validerMdp(c)"
                          >
                            Réinitialiser
                          </button>
                          <button hlmBtn size="sm" variant="ghost" type="button" (click)="mdpPour.set(null)">
                            Annuler
                          </button>
                        </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </main>
  `,
})
export class AdminComptesPage {
  private readonly service = inject(AdminComptesService);
  private readonly auth = inject(AuthService);

  protected readonly roles = ROLES;
  protected readonly comptes = signal<CompteAdmin[]>([]);
  protected readonly chargement = signal(true);
  protected readonly enCours = signal(false);
  protected readonly mdpPour = signal<string | null>(null);
  protected readonly mdpValeur = signal('');

  protected readonly nouveau = signal<EntreeCompte>({
    identifiant: '',
    nom: '',
    role: 'lecteur',
    motDePasse: '',
  });

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.comptes.set(await this.service.lister());
    this.chargement.set(false);
  }

  protected reinitFormulaire(): void {
    this.nouveau.set({ identifiant: '', nom: '', role: 'lecteur', motDePasse: '' });
  }

  protected majNouveau<K extends keyof EntreeCompte>(cle: K, valeur: EntreeCompte[K]): void {
    this.nouveau.update((n) => ({ ...n, [cle]: valeur }));
  }

  protected majRoleNouveau(v: unknown): void {
    if (estRole(v)) this.majNouveau('role', v);
  }

  protected majRoleCompte(c: CompteAdmin, v: unknown): void {
    if (estRole(v)) c.role = v;
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

  protected async creer(dialog: { close: () => void }): Promise<void> {
    const n = this.nouveau();
    this.enCours.set(true);
    try {
      await this.service.creer({ ...n, identifiant: n.identifiant.trim(), nom: n.nom.trim() });
      this.reinitFormulaire();
      dialog.close();
      await this.charger();
      toast.success('Compte créé');
    } catch (err) {
      toast.error(messageErreurHttp(err));
    } finally {
      this.enCours.set(false);
    }
  }

  protected async enregistrer(c: CompteAdmin): Promise<void> {
    await this.appliquer(c, { nom: c.nom, role: c.role, actif: c.actif }, 'Compte mis à jour');
  }

  protected async basculer(c: CompteAdmin): Promise<void> {
    await this.appliquer(
      c,
      { nom: c.nom, role: c.role, actif: !c.actif },
      c.actif ? 'Compte désactivé' : 'Compte activé',
    );
  }

  private async appliquer(c: CompteAdmin, maj: MajCompte, succes: string): Promise<void> {
    try {
      await this.service.modifier(c.id, maj);
      await this.charger();
      toast.success(succes);
    } catch (err) {
      toast.error(messageErreurHttp(err));
      await this.charger();
    }
  }

  protected ouvrirMdp(c: CompteAdmin): void {
    this.mdpValeur.set('');
    this.mdpPour.set(this.mdpPour() === c.id ? null : c.id);
  }

  protected async validerMdp(c: CompteAdmin): Promise<void> {
    try {
      await this.service.reinitialiserMotDePasse(c.id, this.mdpValeur());
      this.mdpPour.set(null);
      this.mdpValeur.set('');
      toast.success('Mot de passe réinitialisé');
    } catch (err) {
      toast.error(messageErreurHttp(err));
    }
  }
}
