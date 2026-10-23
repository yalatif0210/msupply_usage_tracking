import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronRight } from '@ng-icons/lucide';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { LigneTerritoireScores, SyntheseTerritoireScores } from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { cleZone, lignesVisibles } from '../core/arbre-territoire';
import { SyntheseService } from '../core/synthese.service';
import { BadgeClassification } from '../ui/badge-classification';
import { BarreAttente } from '../ui/barre-attente';
import { RepartitionClassificationComponent } from '../ui/repartition-classification';

/** Classe partagée des en-têtes de tableau (DESIGN_SYSTEM §6). */
const TH = 'text-xs font-medium text-muted-foreground';

/**
 * Scores par territoire : régions dépliables en zones de district, zones
 * dépliables en sites (chargés à la demande). Remplace l'ancienne carte « Par
 * district » ; le nom de zone garde son lien vers la liste des sites filtrée.
 */
@Component({
  selector: 'dqa-territoire-scores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideChevronDown, lucideChevronRight })],
  imports: [DecimalPipe, RouterLink, NgIcon, BarreAttente, BadgeClassification, RepartitionClassificationComponent, HlmTableImports],
  template: `
    <div [attr.aria-busy]="enCours()">
      <dqa-barre-attente [actif]="enCours()" />
      @if (donnees(); as d) {
        @if (d.lignes.length === 0) {
          <p class="text-sm text-muted-foreground">Aucun territoire ne correspond à ce filtre.</p>
        } @else {
          <div hlmTableContainer>
            <table hlmTable>
              <thead hlmTHead>
                <tr hlmTr>
                  <th hlmTh [class]="TH">Territoire</th>
                  <th hlmTh [class]="TH + ' text-right'">Sites</th>
                  <th hlmTh [class]="TH + ' text-right'">Mesurés</th>
                  <th hlmTh [class]="TH + ' text-right'">Score moyen</th>
                  <th hlmTh [class]="TH">Répartition / classification</th>
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
                      <td hlmTd class="text-right tabular-nums">{{ l.nbSites }}</td>
                      <td hlmTd class="text-right tabular-nums">{{ l.nbMesures }}</td>
                      <td hlmTd class="text-right tabular-nums">{{ l.scoreCompositeMoyen === null ? absent : (l.scoreCompositeMoyen | number: '1.0-1') }}</td>
                      <td hlmTd class="whitespace-normal"><dqa-repartition-classification [repartition]="l.repartition" [compact]="true" /></td>
                    </tr>
                  } @else {
                    <tr hlmTr class="cursor-pointer" (click)="basculerZone(l)">
                      <td hlmTd>
                        <span class="flex items-center gap-1 pl-6">
                          <ng-icon [name]="zonesOuvertes().has(cle(l)) ? 'lucideChevronDown' : 'lucideChevronRight'" aria-hidden="true" />
                          <button type="button" class="text-left" [attr.aria-expanded]="zonesOuvertes().has(cle(l))"
                                  (click)="$event.stopPropagation(); basculerZone(l)">{{ l.district }}</button>
                          @if (l.district && l.district !== 'District non renseigné') {
                            <a class="ml-2 text-xs text-primary hover:underline" (click)="$event.stopPropagation()"
                               [routerLink]="['/sites']" [queryParams]="{ district: l.district }">liste des sites</a>
                          }
                        </span>
                      </td>
                      <td hlmTd class="text-right tabular-nums">{{ l.nbSites }}</td>
                      <td hlmTd class="text-right tabular-nums">{{ l.nbMesures }}</td>
                      <td hlmTd class="text-right tabular-nums">{{ l.scoreCompositeMoyen === null ? absent : (l.scoreCompositeMoyen | number: '1.0-1') }}</td>
                      <td hlmTd class="whitespace-normal"><dqa-repartition-classification [repartition]="l.repartition" [compact]="true" /></td>
                    </tr>
                    @if (zonesOuvertes().has(cle(l))) {
                      @if (sites().get(cle(l)); as liste) {
                        @for (s of liste; track s.siteId) {
                          <tr hlmTr class="cursor-pointer text-sm" (click)="ouvrirSite(s.siteId, d.moisPaqd)">
                            <td hlmTd>
                              <span class="block pl-14">
                                <a class="text-primary hover:underline" (click)="$event.stopPropagation()"
                                   [routerLink]="['/sites', s.siteId]" [queryParams]="{ mois: d.moisPaqd }">{{ s.siteNom }}</a>
                                <span class="ml-2 text-xs text-muted-foreground">{{ s.typeStructure }}</span>
                              </span>
                            </td>
                            <td hlmTd></td>
                            <td hlmTd class="text-right text-xs text-muted-foreground tabular-nums"
                                title="Piliers calculables ce mois">
                              {{ s.piliersCouverts === null ? absent : s.piliersCouverts + ' / 6 piliers' }}
                            </td>
                            <td hlmTd class="text-right tabular-nums">{{ s.scoreCompositeMoyen === null ? absent : (s.scoreCompositeMoyen | number: '1.0-1') }}</td>
                            <td hlmTd><dqa-badge-classification [classification]="s.classification" /></td>
                          </tr>
                        } @empty {
                          <tr hlmTr><td hlmTd colspan="5" class="pl-14 text-sm text-muted-foreground">Aucun site pour ce filtre.</td></tr>
                        }
                      } @else {
                        <tr hlmTr><td hlmTd colspan="5" class="pl-14 text-sm text-muted-foreground">Chargement des sites…</td></tr>
                      }
                    }
                  }
                }
              </tbody>
            </table>
          </div>
          <p class="mt-2 text-xs text-muted-foreground">
            Triés du plus faible score moyen au plus élevé. La moyenne d'un territoire porte sur ses seuls sites mesurés ;
            une zone de district compte tous ses sites, magasin du district sanitaire compris.
          </p>
        }
      } @else if (!enCours()) {
        <p class="text-sm text-muted-foreground">La lecture par territoire est indisponible.</p>
      }
    </div>
  `,
})
export class TerritoireScores {
  private readonly service = inject(SyntheseService);
  private readonly router = inject(Router);

  readonly mois = input<string | null>(null);
  readonly programmeId = input('');
  readonly region = input('');
  readonly strate = input('');

  protected readonly TH = TH;
  protected readonly absent = VALEUR_ABSENTE;
  protected readonly cle = cleZone;

  protected readonly donnees = signal<SyntheseTerritoireScores | null>(null);
  protected readonly enCours = signal(false);
  protected readonly regionsOuvertes = signal<ReadonlySet<string>>(new Set());
  protected readonly zonesOuvertes = signal<ReadonlySet<string>>(new Set());
  protected readonly sites = signal<ReadonlyMap<string, LigneTerritoireScores[]>>(new Map());
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
      const d = await this.service.territoireScores(f);
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

  protected async basculerZone(l: LigneTerritoireScores): Promise<void> {
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
      const liste = await this.service.sitesScores({
        mois: d.moisPaqd, region: l.region, district: l.district,
        programmeId: this.programmeId(), strate: this.strate(),
      });
      this.sites.update((m) => new Map(m).set(cle, liste));
    } catch {
      this.sites.update((m) => new Map(m).set(cle, []));
    }
  }

  protected ouvrirSite(siteId: string | null, mois: string | null): void {
    if (siteId) void this.router.navigate(['/sites', siteId], { queryParams: mois ? { mois } : {} });
  }
}
