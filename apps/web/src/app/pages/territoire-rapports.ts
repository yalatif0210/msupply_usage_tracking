import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronRight } from '@ng-icons/lucide';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { LigneTerritoireRapports, SyntheseTerritoireRapports } from '@dqa/contracts';
import { cleZone, jourMois, lignesVisibles, taux } from '../core/arbre-territoire';
import { SyntheseService } from '../core/synthese.service';
import { BarreAttente } from '../ui/barre-attente';

/** Classe partagée des en-têtes de tableau (DESIGN_SYSTEM §6). */
const TH = 'text-xs font-medium text-muted-foreground';

/**
 * Rapports (réquisitions) et inventaires de fin de mois par territoire :
 * régions dépliables en zones de district, zones dépliables en sites (chargés
 * à la demande). Un changement de filtre recharge en arrière-plan, le contenu
 * courant reste affiché (CLAUDE.md §8).
 */
@Component({
  selector: 'dqa-territoire-rapports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideChevronDown, lucideChevronRight })],
  imports: [NgTemplateOutlet, RouterLink, NgIcon, BarreAttente, HlmTableImports],
  template: `
    <div [attr.aria-busy]="enCours()">
      <dqa-barre-attente [actif]="enCours()" />
      @if (donnees(); as d) {
        @if (!d.moisClos && d.echeance) {
          <p class="mb-2 text-sm text-muted-foreground" role="status">
            Mois en cours : les rapports et inventaires de {{ d.moisPaqd }} ne sont pas encore dus
            (échéance le {{ jourMois(d.echeance) }}).
          </p>
        }
        @if (d.lignes.length === 0) {
          @if (d.moisClos) {
            <p class="text-sm text-muted-foreground">Aucun compte figé pour ce mois avec ce filtre.</p>
          }
        } @else {
          <div hlmTableContainer>
            <table hlmTable>
              <thead hlmTHead>
                <tr hlmTr>
                  <th hlmTh [class]="TH" rowspan="2">Territoire</th>
                  <th hlmTh [class]="TH + ' text-right'" rowspan="2">Sites</th>
                  <th hlmTh [class]="TH + ' text-center'" colspan="5">Réquisitions</th>
                  <th hlmTh [class]="TH + ' text-center'" colspan="5">Inventaires de fin de mois</th>
                </tr>
                <tr hlmTr>
                  @for (bloc of [1, 2]; track bloc) {
                    <th hlmTh [class]="TH + ' text-right'">Attendus</th>
                    <th hlmTh [class]="TH + ' text-right'">Réalisés</th>
                    <th hlmTh [class]="TH + ' text-right'">% réalisés</th>
                    <th hlmTh [class]="TH + ' text-right'">À l'heure</th>
                    <th hlmTh [class]="TH + ' text-right'">% à l'heure</th>
                  }
                </tr>
              </thead>
              <tbody hlmTBody>
                @for (l of visibles(); track l.niveau + '|' + l.region + '|' + l.district) {
                  @if (l.niveau === 'region') {
                    <tr hlmTr class="cursor-pointer bg-muted/40 font-semibold" (click)="basculerRegion(l.region)">
                      <td hlmTd>
                        <span class="flex items-center gap-1">
                          <ng-icon [name]="regionsOuvertes().has(l.region) ? 'lucideChevronDown' : 'lucideChevronRight'" aria-hidden="true" />
                          <button type="button" class="text-left" [attr.aria-expanded]="regionsOuvertes().has(l.region)"
                                  (click)="$event.stopPropagation(); basculerRegion(l.region)">{{ l.region }}</button>
                        </span>
                      </td>
                      <ng-container *ngTemplateOutlet="cellules; context: { $implicit: l }" />
                    </tr>
                  } @else {
                    <tr hlmTr class="cursor-pointer" (click)="basculerZone(l)">
                      <td hlmTd>
                        <span class="flex items-center gap-1 pl-6">
                          <ng-icon [name]="zonesOuvertes().has(cle(l)) ? 'lucideChevronDown' : 'lucideChevronRight'" aria-hidden="true" />
                          <button type="button" class="text-left" [attr.aria-expanded]="zonesOuvertes().has(cle(l))"
                                  (click)="$event.stopPropagation(); basculerZone(l)">{{ l.district }}</button>
                        </span>
                      </td>
                      <ng-container *ngTemplateOutlet="cellules; context: { $implicit: l }" />
                    </tr>
                    @if (zonesOuvertes().has(cle(l))) {
                      @if (sites().get(cle(l)); as liste) {
                        @for (s of liste; track s.siteId) {
                          <tr hlmTr class="text-sm">
                            <td hlmTd>
                              <span class="block pl-14">
                                <a class="text-primary hover:underline" [routerLink]="['/sites', s.siteId]" [queryParams]="{ mois: d.moisPaqd }">{{ s.siteNom }}</a>
                                <span class="ml-2 text-xs text-muted-foreground">{{ s.typeStructure }}</span>
                              </span>
                            </td>
                            <ng-container *ngTemplateOutlet="cellules; context: { $implicit: s }" />
                          </tr>
                        } @empty {
                          <tr hlmTr><td hlmTd colspan="12" class="pl-14 text-sm text-muted-foreground">Aucun site avec des comptes pour ce filtre.</td></tr>
                        }
                      } @else {
                        <tr hlmTr><td hlmTd colspan="12" class="pl-14 text-sm text-muted-foreground">Chargement des sites…</td></tr>
                      }
                    }
                  }
                }
              </tbody>
            </table>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">
            Triés du plus faible taux de réquisitions à l'heure au plus élevé ; « s/o » : rien n'était attendu.
            Une zone de district compte tous ses sites, magasin du district sanitaire compris.
          </p>
        }
      } @else if (!enCours()) {
        <p class="text-sm text-muted-foreground">La lecture par territoire est indisponible.</p>
      }
    </div>

    <ng-template #cellules let-l>
      <td hlmTd class="text-right tabular-nums">{{ l.nbSites }}</td>
      <td hlmTd class="text-right tabular-nums">{{ l.requisitions.attendu }}</td>
      <td hlmTd class="text-right tabular-nums">{{ l.requisitions.realise }}</td>
      <td hlmTd class="text-right tabular-nums">{{ taux(l.requisitions.tauxRealise) }}</td>
      <td hlmTd class="text-right tabular-nums">{{ l.requisitions.aLHeure }}</td>
      <td hlmTd class="text-right tabular-nums font-medium">{{ taux(l.requisitions.tauxALHeure) }}</td>
      <td hlmTd class="text-right tabular-nums">{{ l.inventaires.attendu }}</td>
      <td hlmTd class="text-right tabular-nums">{{ l.inventaires.realise }}</td>
      <td hlmTd class="text-right tabular-nums">{{ taux(l.inventaires.tauxRealise) }}</td>
      <td hlmTd class="text-right tabular-nums">{{ l.inventaires.aLHeure }}</td>
      <td hlmTd class="text-right tabular-nums font-medium">{{ taux(l.inventaires.tauxALHeure) }}</td>
    </ng-template>
  `,
})
export class TerritoireRapports {
  private readonly service = inject(SyntheseService);

  readonly mois = input<string | null>(null);
  readonly programmeId = input('');
  readonly region = input('');
  readonly strate = input('');

  protected readonly TH = TH;
  protected readonly taux = taux;
  protected readonly jourMois = jourMois;
  protected readonly cle = cleZone;

  protected readonly donnees = signal<SyntheseTerritoireRapports | null>(null);
  protected readonly enCours = signal(false);
  protected readonly regionsOuvertes = signal<ReadonlySet<string>>(new Set());
  protected readonly zonesOuvertes = signal<ReadonlySet<string>>(new Set());
  protected readonly sites = signal<ReadonlyMap<string, LigneTerritoireRapports[]>>(new Map());
  private jeton = 0;

  protected readonly visibles = computed(() =>
    lignesVisibles(this.donnees()?.lignes ?? [], this.regionsOuvertes()));

  constructor() {
    effect(() => {
      const filtres = { mois: this.mois() ?? '', programmeId: this.programmeId(), region: this.region(), strate: this.strate() };
      untracked(() => void this.charger(filtres));
    });
  }

  private async charger(f: { mois: string; programmeId: string; region: string; strate: string }): Promise<void> {
    const jeton = ++this.jeton;
    this.enCours.set(true);
    try {
      const d = await this.service.territoireRapports(f);
      if (jeton !== this.jeton) return;
      this.donnees.set(d);
      this.sites.set(new Map());
      this.zonesOuvertes.set(new Set());
      // une région filtrée s'affiche seule, déjà dépliée
      if (f.region) this.regionsOuvertes.set(new Set([f.region]));
    } catch {
      // échec non bloquant : le contenu courant reste affiché
    } finally {
      if (jeton === this.jeton) this.enCours.set(false);
    }
  }

  protected basculerRegion(region: string): void {
    const s = new Set(this.regionsOuvertes());
    if (s.has(region)) s.delete(region);
    else s.add(region);
    this.regionsOuvertes.set(s);
  }

  protected async basculerZone(l: LigneTerritoireRapports): Promise<void> {
    const cle = cleZone(l);
    const s = new Set(this.zonesOuvertes());
    if (s.has(cle)) {
      s.delete(cle);
      this.zonesOuvertes.set(s);
      return;
    }
    s.add(cle);
    this.zonesOuvertes.set(s);
    const d = this.donnees();
    if (!d?.moisPaqd || this.sites().has(cle) || l.district === null) return;
    try {
      const liste = await this.service.sitesRapports({
        mois: d.moisPaqd, region: l.region, district: l.district,
        programmeId: this.programmeId(), strate: this.strate(),
      });
      this.sites.update((m) => new Map(m).set(cle, liste));
    } catch {
      this.sites.update((m) => new Map(m).set(cle, []));
    }
  }
}
