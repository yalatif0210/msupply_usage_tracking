import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import type { MethodeCalcul } from '@dqa/contracts';
import { MethodeCalculService } from '../core/methode-calcul.service';

/**
 * Dépliable « Comment ces scores sont calculés » des écrans de liste et de
 * synthèse : la grille du mois affiché, telle que la base l'applique. Il ne
 * porte aucune valeur de site ; la fiche site déplie le calcul d'un score.
 */
@Component({
  selector: 'dqa-methode-calcul',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe],
  template: `
    <details class="rounded-md border border-border bg-card px-4 py-3 text-sm">
      <summary class="cursor-pointer font-medium">Comment ces scores sont calculés</summary>
      @if (methode(); as m) {
        <div class="mt-3 space-y-3">
          <p class="text-muted-foreground">
            Grille {{ m.grille.version }}, en vigueur depuis le {{ m.grille.effetAPartirDe | date: 'dd/MM/yyyy' }}, appliquée au mois {{ m.moisPaqd }}.
          </p>
          <ol class="list-decimal space-y-1 pl-5">
            <li>
              Chaque sous-composante reçoit une <b class="font-medium">note</b> : 100 si son seuil est atteint, 0 sinon.
            </li>
            <li>
              Le <b class="font-medium">score d'un pilier</b> est la moyenne des notes de ses sous-composantes retenues,
              pondérée par leur poids dans le pilier. Une sous-composante non calculable sort du calcul.
            </li>
            <li>
              Le <b class="font-medium">score composite</b> est la moyenne des scores de pilier, pondérée par le poids des
              piliers ; un pilier non calculable sort du calcul et les autres poids sont ramenés à 100 %.
            </li>
            <li>
              Classification : conforme à partir de {{ m.regles.borneConforme | number: '1.0-1' }}, partiellement conforme
              à partir de {{ m.regles.bornePartiellementConforme | number: '1.0-1' }}, non conforme en dessous.
            </li>
            <li>
              P4 et P5 ne lisent que l'inventaire de clôture : {{ fenetreCloture(m) }}. Sans clôture (ou sans
              ouverture pour la conformité consommation), la note vaut
              {{ m.regles.noteSanction | number: '1.0-1' }} une fois le mois jugé.
            </li>
          </ol>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left">
              <thead>
                <tr class="border-b border-border text-xs text-muted-foreground">
                  <th class="py-1.5 pr-3 font-medium">Pilier</th>
                  <th class="py-1.5 pr-3 text-right font-medium">Poids</th>
                  <th class="py-1.5 pr-3 font-medium">Sous-composante</th>
                  <th class="py-1.5 pr-3 text-right font-medium">Poids dans le pilier</th>
                  <th class="py-1.5 font-medium">Seuil</th>
                </tr>
              </thead>
              <tbody>
                @for (p of m.piliers; track p.pilier) {
                  @for (sc of p.sousComposantes; track sc.sousComposante; let premiere = $first) {
                    <tr class="border-b border-border align-top">
                      <td class="py-1.5 pr-3">@if (premiere) { {{ p.pilier }} · {{ p.libelle }} }</td>
                      <td class="py-1.5 pr-3 text-right tabular-nums">@if (premiere) { {{ p.poidsPct | number: '1.0-1' }} % }</td>
                      <td class="py-1.5 pr-3">{{ sc.libelle }}</td>
                      <td class="py-1.5 pr-3 text-right tabular-nums">
                        @if (sc.retenue) {
                          {{ sc.poidsDansPilierPct | number: '1.0-1' }} %
                        } @else {
                          <span class="text-muted-foreground">non retenue</span>
                        }
                      </td>
                      <td class="py-1.5 tabular-nums">
                        {{ sc.sens === 'sup' ? '≥' : '≤' }} {{ sc.seuil | number: '1.0-1' }} %
                        @if (sc.tolerance !== null) {
                          <span class="text-muted-foreground">· tolérance produit {{ sc.tolerance | number: '1.0-1' }} %</span>
                        }
                        @if (sc.seuilDistrict !== null) {
                          <span class="text-muted-foreground">· district {{ sc.seuilDistrict | number: '1.0-1' }} %</span>
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else if (erreur()) {
        <p class="mt-3 text-muted-foreground">Méthode indisponible pour ce mois.</p>
      } @else {
        <p class="mt-3 text-muted-foreground">Chargement…</p>
      }
    </details>
  `,
})
export class MethodeCalculComponent {
  /** Mois affiché par l'écran hôte ; `null` : dernier mois mesuré. */
  readonly mois = input<string | null>(null);

  private readonly service = inject(MethodeCalculService);
  protected readonly methode = signal<MethodeCalcul | null>(null);
  protected readonly erreur = signal(false);

  /** « 3 derniers jours du mois ou 1er jour du mois suivant ». */
  protected fenetreCloture(m: MethodeCalcul): string {
    const fin = `${m.regles.joursClotureFinMois} derniers jours du mois`;
    const n = m.regles.joursClotureMoisSuivant;
    if (n === 0) return fin;
    return `${fin} ou ${n === 1 ? '1er jour' : `${n} premiers jours`} du mois suivant`;
  }

  constructor() {
    effect(() => {
      const mois = this.mois();
      this.erreur.set(false);
      this.service.methode(mois).then(
        (m) => this.methode.set(m),
        () => {
          this.methode.set(null);
          this.erreur.set(true);
        },
      );
    });
  }
}
