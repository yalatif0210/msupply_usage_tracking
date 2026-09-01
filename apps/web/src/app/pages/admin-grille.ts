import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LIBELLES_PILIER,
  LIBELLES_SOUS_COMPOSANTE,
  SOUS_COMPOSANTES_AVEC_TOLERANCE,
  type EntreeGrille,
  type GrilleDetail,
  type GrilleParametre,
  type SousComposante,
} from '@dqa/contracts';
import { AdminGrilleService } from '../core/admin-grille.service';
import { messageErreurHttp } from '../core/message-erreur';
import { Entete } from '../ui/entete';

const AVEC_TOLERANCE = new Set<SousComposante>(SOUS_COMPOSANTES_AVEC_TOLERANCE);

@Component({
  selector: 'dqa-admin-grille',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, Entete],
  template: `
    <dqa-entete />
    <main>
      <h1>Grille de paramètres</h1>
      <p class="intro">
        Poids des piliers et seuils des sous-composantes. Une modification crée
        une <b>nouvelle version</b> qui ne prend effet qu'à une date future :
        les scores déjà calculés ne changent jamais (ADR 0003).
      </p>

      @if (erreur()) {
        <p class="erreur" role="alert">{{ erreur() }}</p>
      }

      <div class="colonnes">
        <section class="liste">
          <div class="titre-liste">
            <h2>Versions</h2>
            <button type="button" (click)="nouvelleVersion()">Nouvelle version</button>
          </div>
          <table>
            <thead><tr><th>Version</th><th>Effet</th><th>Statut</th></tr></thead>
            <tbody>
              @for (g of versions(); track g.id) {
                <tr [class.actif]="selection()?.id === g.id" (click)="voir(g.id)">
                  <td>{{ g.version }}</td>
                  <td>{{ g.effetAPartirDe | date: 'dd/MM/yyyy' }}</td>
                  <td><span class="badge {{ g.statut }}">{{ libelleStatut(g.statut) }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        <section class="detail">
          @if (brouillon(); as b) {
            <h2>{{ enModification() ? 'Modifier la version planifiée' : 'Nouvelle version' }}</h2>
            <label>Libellé
              <input name="version" [(ngModel)]="b.version" maxlength="40" required />
            </label>
            <label>Date d'effet (dans le futur)
              <input type="date" name="effet" [(ngModel)]="b.effetAPartirDe" required />
            </label>

            <h3>Poids des piliers · total {{ totalPoids() }} %</h3>
            @if (totalPoids() !== 100) {
              <p class="alerte">La somme des poids doit faire exactement 100.</p>
            }
            @for (p of b.poids; track p.pilier) {
              <label class="ligne">
                <span>{{ p.pilier }} · {{ libellePilier(p.pilier) }}</span>
                <input type="number" min="0" max="100" step="0.5" [name]="'poids-' + p.pilier"
                       [(ngModel)]="p.poidsPct" (ngModelChange)="recalculer()" />
              </label>
            }

            <h3>Seuils des sous-composantes</h3>
            @for (s of b.seuils; track s.sousComposante) {
              <div class="ligne-seuil">
                <span>{{ libelleSousComposante(s.sousComposante) }}</span>
                <input type="number" step="0.5" [(ngModel)]="s.seuil" [name]="'seuil-' + s.sousComposante" />
                <select [(ngModel)]="s.sens" [name]="'sens-' + s.sousComposante">
                  <option value="sup">≥ seuil</option>
                  <option value="inf">≤ seuil</option>
                </select>
                @if (avecTolerance(s.sousComposante)) {
                  <input type="number" min="0" step="0.5" [(ngModel)]="s.tolerance" [name]="'tol-' + s.sousComposante"
                         placeholder="tolérance %" />
                } @else {
                  <span class="sans-tol">s/o</span>
                }
              </div>
            }

            <div class="actions">
              <button type="button" (click)="enregistrer()" [disabled]="enCours()">Enregistrer</button>
              <button type="button" class="lien" (click)="annuler()">Annuler</button>
            </div>
          } @else if (selection(); as s) {
            <h2>{{ s.version }} · {{ libelleStatut(s.statut) }}</h2>
            @if (s.modifiable) {
              <div class="actions">
                <button type="button" (click)="editer()">Modifier</button>
                <button type="button" class="lien danger" (click)="supprimer(s.id)">Supprimer</button>
              </div>
            } @else {
              <p class="intro">Version figée : consultation seule.</p>
            }
            <h3>Poids</h3>
            <ul class="valeurs">
              @for (p of s.poids; track p.pilier) {
                <li>{{ p.pilier }} · {{ libellePilier(p.pilier) }} : <b>{{ p.poidsPct }} %</b></li>
              }
            </ul>
            <h3>Seuils</h3>
            <ul class="valeurs">
              @for (se of s.seuils; track se.sousComposante) {
                <li>
                  {{ libelleSousComposante(se.sousComposante) }} :
                  <b>{{ se.sens === 'sup' ? '≥' : '≤' }} {{ se.seuil }}</b>
                  @if (se.tolerance !== null) { <span>(tolérance {{ se.tolerance }} %)</span> }
                </li>
              }
            </ul>
          } @else {
            <p class="intro">Choisir une version, ou en créer une nouvelle.</p>
          }
        </section>
      </div>
    </main>
  `,
  styles: `
    main { max-width: 66rem; margin: 0 auto; padding: 0 1rem; }
    h1 { font-size: 1.6rem; }
    h2 { font-size: 1.1rem; }
    h3 { font-size: 0.95rem; margin: 1.2rem 0 0.5rem; }
    .intro { color: #5b5b5b; font-size: 0.9rem; }
    .colonnes { display: grid; grid-template-columns: minmax(16rem, 22rem) 1fr; gap: 2rem; align-items: start; }
    .titre-liste { display: flex; justify-content: space-between; align-items: baseline; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #d9d9d6; }
    tbody tr { cursor: pointer; }
    tbody tr:hover, tbody tr.actif { background: #f0f2f6; }
    .badge { padding: 0.1rem 0.4rem; font-size: 0.75rem; border-radius: 4px; }
    .badge.en_vigueur { background: #e3f1e4; color: #1b5e20; }
    .badge.planifiee { background: #fff3d6; color: #7a5200; }
    .badge.passee { background: #ececec; color: #4a4a4a; }
    label { display: grid; gap: 0.3rem; font-size: 0.85rem; margin: 0.6rem 0; }
    input, select { padding: 0.45rem; border: 1px solid #d9d9d6; }
    .ligne { grid-template-columns: 1fr 6rem; align-items: center; }
    .ligne-seuil { display: grid; grid-template-columns: 1fr 6rem 7rem 7rem; gap: 0.5rem; align-items: center; margin: 0.4rem 0; font-size: 0.85rem; }
    .sans-tol { color: #b9b9b6; text-align: center; }
    .actions { display: flex; gap: 1rem; margin: 1rem 0; }
    button { padding: 0.5rem 0.9rem; background: #1f3d7a; color: #fff; border: 0; cursor: pointer; }
    button[disabled] { opacity: 0.5; cursor: default; }
    .lien { background: none; color: #1f3d7a; padding: 0; text-decoration: underline; }
    .lien.danger { color: #8a1c13; }
    .erreur, .alerte { color: #8a1c13; font-size: 0.9rem; }
    .valeurs { list-style: none; padding: 0; font-size: 0.9rem; }
    .valeurs li { padding: 0.2rem 0; }
    .valeurs span { color: #5b5b5b; }
  `,
})
export class AdminGrillePage {
  private readonly service = inject(AdminGrilleService);

  protected readonly versions = signal<GrilleParametre[]>([]);
  protected readonly selection = signal<GrilleDetail | null>(null);
  protected readonly brouillon = signal<EntreeGrille | null>(null);
  protected readonly enModification = signal(false);
  protected readonly enCours = signal(false);
  protected readonly erreur = signal<string | null>(null);

  protected readonly totalPoids = computed(() => {
    const b = this.brouillon();
    return b ? Math.round(b.poids.reduce((t, p) => t + Number(p.poidsPct || 0), 0) * 10) / 10 : 0;
  });

  /** Rejoue le signal après une saisie de poids : le total (computed) se recalcule. */
  protected recalculer(): void {
    const b = this.brouillon();
    if (b) this.brouillon.set({ ...b });
  }

  constructor() {
    void this.charger();
  }

  protected libellePilier = (p: GrilleDetail['poids'][number]['pilier']) => LIBELLES_PILIER[p];
  protected libelleSousComposante = (s: GrilleDetail['seuils'][number]['sousComposante']) =>
    LIBELLES_SOUS_COMPOSANTE[s];
  protected avecTolerance = (s: SousComposante) => AVEC_TOLERANCE.has(s);
  protected libelleStatut = (s: GrilleParametre['statut']) =>
    ({ planifiee: 'Planifiée', en_vigueur: 'En vigueur', passee: 'Passée' })[s];

  private async charger(): Promise<void> {
    this.versions.set(await this.service.lister());
  }

  protected async voir(id: number): Promise<void> {
    this.brouillon.set(null);
    this.erreur.set(null);
    this.selection.set(await this.service.detail(id));
  }

  private brouillonDepuis(d: GrilleDetail): EntreeGrille {
    return {
      version: d.version,
      effetAPartirDe: d.effetAPartirDe,
      poids: d.poids.map((p) => ({ ...p })),
      seuils: d.seuils.map((s) => ({ ...s })),
    };
  }

  protected async nouvelleVersion(): Promise<void> {
    this.erreur.set(null);
    const enVigueur = this.versions().find((g) => g.statut === 'en_vigueur') ?? this.versions()[0];
    if (!enVigueur) return;
    const modele = this.brouillonDepuis(await this.service.detail(enVigueur.id));
    modele.version = '';
    modele.effetAPartirDe = '';
    this.enModification.set(false);
    this.selection.set(null);
    this.brouillon.set(modele);
  }

  protected editer(): void {
    const s = this.selection();
    if (!s?.modifiable) return;
    this.erreur.set(null);
    this.enModification.set(true);
    this.brouillon.set(this.brouillonDepuis(s));
  }

  protected annuler(): void {
    this.brouillon.set(null);
    this.erreur.set(null);
  }

  protected async enregistrer(): Promise<void> {
    const b = this.brouillon();
    if (!b) return;
    this.erreur.set(null);
    this.enCours.set(true);
    try {
      const enregistree =
        this.enModification() && this.selection()
          ? await this.service.modifier(this.selection()!.id, b)
          : await this.service.creer(b);
      this.brouillon.set(null);
      await this.charger();
      this.selection.set(enregistree);
    } catch (err) {
      this.erreur.set(messageErreurHttp(err));
    } finally {
      this.enCours.set(false);
    }
  }

  protected async supprimer(id: number): Promise<void> {
    this.erreur.set(null);
    try {
      await this.service.supprimer(id);
      this.selection.set(null);
      await this.charger();
    } catch (err) {
      this.erreur.set(messageErreurHttp(err));
    }
  }
}
