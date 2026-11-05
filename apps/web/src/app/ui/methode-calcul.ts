import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import type { MethodeCalcul } from '@dqa/contracts';
import { MethodeCalculService } from '../core/methode-calcul.service';
import { fenetreCloture, margeJugement, seuilLisible } from '../core/regles-calcul';

type Etat =
  | { etat: 'ferme' }
  | { etat: 'chargement' }
  | { etat: 'pret'; methode: MethodeCalcul }
  | { etat: 'erreur' };

/**
 * Dépliable « Comment ces scores sont calculés » des écrans de liste et de
 * synthèse : la grille du mois affiché, telle que la base l'applique. Il ne
 * porte aucune valeur de site ; la fiche site déplie le calcul d'un score.
 * La grille n'est demandée qu'à l'ouverture, puis à chaque changement de mois
 * tant que le dépliable reste ouvert.
 */
@Component({
  selector: 'dqa-methode-calcul',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe],
  template: `
    <details class="rounded-md border border-border bg-card px-4 py-3 text-sm" #dt (toggle)="ouvert.set(dt.open)">
      <summary class="cursor-pointer font-medium">Comment ces scores sont calculés</summary>
      @if (methodePrete(); as m) {
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
              P4 et P5 lisent l'inventaire de clôture, fait dans {{ fenetreCloture(m.regles) }} ; l'ouverture d'un
              mois est la clôture du mois précédent. Un produit est identifié par son code.
            </li>
            <li>
              Le mois est jugé quand les imports couvrent sa fenêtre de clôture, {{ margeJugement(m.regles) }}.
              Un mois jugé sans clôture vaut une note de sanction de
              {{ m.regles.noteSanction | number: '1.0-1' }} en P4 et P5 ; sans ouverture, ou sans produit commun aux
              deux inventaires, la conformité consommation reçoit la même note.
            </li>
          </ol>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left">
              <caption class="sr-only">Composition des piliers et seuils de la grille {{ m.grille.version }}</caption>
              <thead>
                <tr class="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" class="py-1.5 pr-3 font-medium">Pilier</th>
                  <th scope="col" class="py-1.5 pr-3 text-right font-medium">Poids</th>
                  <th scope="col" class="py-1.5 pr-3 font-medium">Sous-composante</th>
                  <th scope="col" class="py-1.5 pr-3 text-right font-medium">Poids dans le pilier</th>
                  <th scope="col" class="py-1.5 font-medium">Seuil</th>
                </tr>
              </thead>
              <tbody>
                @for (p of m.piliers; track p.pilier) {
                  @for (sc of p.sousComposantes; track sc.sousComposante; let premiere = $first) {
                    <tr class="border-b border-border align-top">
                      @if (premiere) {
                        <th scope="rowgroup" class="py-1.5 pr-3 text-left font-normal" [attr.rowspan]="p.sousComposantes.length">
                          {{ p.pilier }} · {{ p.libelle }}
                        </th>
                        <td class="py-1.5 pr-3 text-right tabular-nums" [attr.rowspan]="p.sousComposantes.length">
                          {{ p.poidsPct | number: '1.0-1' }} %
                        </td>
                      }
                      <td class="py-1.5 pr-3">{{ sc.libelle }}</td>
                      <td class="py-1.5 pr-3 text-right tabular-nums">
                        @if (sc.retenue) {
                          {{ sc.poidsDansPilierPct | number: '1.0-1' }} %
                        } @else {
                          <span class="text-muted-foreground">non retenue</span>
                        }
                      </td>
                      <td class="py-1.5 tabular-nums">
                        {{ seuilLisible(sc) }}
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
      } @else if (etat().etat === 'erreur') {
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
  protected readonly ouvert = signal(false);
  protected readonly etat = signal<Etat>({ etat: 'ferme' });
  /** Numéro de la dernière demande : une réponse plus ancienne arrivée après est ignorée. */
  private demande = 0;

  protected readonly fenetreCloture = fenetreCloture;
  protected readonly margeJugement = margeJugement;
  protected readonly seuilLisible = seuilLisible;

  protected methodePrete(): MethodeCalcul | null {
    const e = this.etat();
    return e.etat === 'pret' ? e.methode : null;
  }

  constructor() {
    effect(() => {
      const mois = this.mois();
      if (!this.ouvert()) {
        // refermé : la prochaine ouverture relira la grille du mois alors affiché
        this.demande++;
        this.etat.set({ etat: 'ferme' });
        return;
      }
      const numero = ++this.demande;
      this.etat.set({ etat: 'chargement' });
      this.service.methode(mois).then(
        (methode) => {
          if (numero === this.demande) this.etat.set({ etat: 'pret', methode });
        },
        () => {
          if (numero === this.demande) this.etat.set({ etat: 'erreur' });
        },
      );
    });
  }
}
