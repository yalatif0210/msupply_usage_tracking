import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LIBELLES_PILIER,
  PILIERS,
  type DetailP4Produits,
  type DetailSite,
  type HistoriqueSite,
  type Pilier,
  type Programme,
  type RaisonExclusionConso,
} from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { SitesService } from '../core/sites.service';
import { BadgeClassification } from '../ui/badge-classification';
import { BadgeStatut } from '../ui/badge-statut';
import { CourbeProgressionComponent } from '../ui/courbe-progression';
import { Entete } from '../ui/entete';

@Component({
  selector: 'dqa-detail-site',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink, Entete, BadgeStatut, BadgeClassification,
    CourbeProgressionComponent, DecimalPipe,
  ],
  template: `
    <dqa-entete />
    <main>
      <a routerLink="/" class="retour">← Tous les sites</a>

      @if (chargement()) {
        <p>Chargement…</p>
      } @else if (detail(); as d) {
        <h1>{{ d.site.siteNom }}</h1>
        <p class="meta">
          {{ d.site.district ?? absent }} · {{ d.site.region ?? absent }} ·
          {{ d.site.typeStructure ?? absent }}
        </p>

        <div class="controles">
          <label>
            Programme
            <select [(ngModel)]="programmeId" (ngModelChange)="recharger()">
              <option value="">Tous programmes</option>
              @for (p of programmes(); track p.programmeId) {
                <option [value]="p.programmeId">{{ p.programmeNom }}</option>
              }
            </select>
          </label>
          @if (d.moisDisponibles.length > 1) {
            <label>
              Mois PAQD
              <select [(ngModel)]="mois" (ngModelChange)="recharger()">
                @for (m of d.moisDisponibles; track m) {
                  <option [value]="m">{{ m }}</option>
                }
              </select>
            </label>
          } @else {
            <span class="mois">Mois PAQD : {{ d.moisPaqd ?? absent }}</span>
          }
        </div>

        @if (d.piliers.length === 0) {
          <p class="vide">
            Aucune mesure pour ce site. Le premier import contenant ce site alimentera l'écran.
          </p>
        } @else {
          <div class="composite">
            <div class="score">
              <div class="chiffre">
                {{ d.scoreComposite === null ? absent : (d.scoreComposite | number: '1.0-1') }}
              </div>
              <div class="sur">/ 100</div>
            </div>
            <div class="rang">
              <dqa-badge-classification [classification]="d.classification" />
              @if (d.piliersCouverts < d.piliersTotal) {
                <div class="partiel">
                  Score calculé sur {{ d.piliersCouverts }} pilier{{ d.piliersCouverts > 1 ? 's' : '' }}
                  sur {{ d.piliersTotal }}
                </div>
              }
            </div>
          </div>

          <div class="cartes">
            @for (pil of d.piliers; track pil.pilier) {
              <article class="carte">
                <h2>{{ pil.pilier }} · {{ pil.libelle }}</h2>
                @for (sc of pil.sousComposantes; track sc.sousComposante) {
                  <div class="mesure">
                    <dqa-badge-statut [statut]="sc.statut" />
                    <div>
                      <div class="valeur">
                        {{ sc.valeur === null ? absent : (sc.valeur | number: '1.0-1') }}
                        <span class="unite">%</span>
                      </div>
                      <div class="seuil">
                        seuil {{ sc.seuil === null ? absent : (sc.seuil | number: '1.0-1') }} %
                      </div>
                      @if (sc.raison) {
                        <div class="raison">{{ sc.raison }}</div>
                      }
                    </div>
                  </div>
                }
              </article>
            }
          </div>

          @if (p4Mesure(d) && p4Produits(); as p4) {
            @if (p4.produits.length > 0) {
              <details class="drill">
                <summary>P4 · détail par produit traceur ({{ p4.produits.length }})</summary>
                <div class="drill-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th class="num">Théo.</th>
                        <th class="num">Compté</th>
                        <th class="num">Écart SDU</th>
                        <th>SDU</th>
                        <th class="num">Début</th>
                        <th class="num">Récept.</th>
                        <th class="num">Fin</th>
                        <th class="num">Reconst.</th>
                        <th class="num">Déclarée</th>
                        <th class="num">Écart conso.</th>
                        <th>Conso.</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (pr of p4.produits; track pr.produitCode) {
                        <tr>
                          <td>{{ pr.libelle ?? pr.produitCode }}</td>
                          <td class="num">{{ pr.sdu.theorique === null ? absent : (pr.sdu.theorique | number: '1.0-0') }}</td>
                          <td class="num">{{ pr.sdu.comptee === null ? absent : (pr.sdu.comptee | number: '1.0-0') }}</td>
                          <td class="num">{{ pr.sdu.ecartPct === null ? '∞' : (pr.sdu.ecartPct | number: '1.0-1') + ' %' }}</td>
                          <td><dqa-badge-statut [statut]="pr.sdu.conforme ? 'CONFORME' : 'ALERTE'" /></td>
                          @if (pr.consommation; as c) {
                            @if (c.evaluable) {
                              <td class="num">{{ c.stockDebut | number: '1.0-0' }}</td>
                              <td class="num">{{ c.receptions | number: '1.0-0' }}</td>
                              <td class="num">{{ c.stockFin | number: '1.0-0' }}</td>
                              <td class="num">{{ c.reconstituee | number: '1.0-0' }}</td>
                              <td class="num">{{ c.declaree | number: '1.0-0' }}</td>
                              <td class="num">{{ c.ecartPct | number: '1.0-1' }} %</td>
                              <td><dqa-badge-statut [statut]="c.conforme ? 'CONFORME' : 'ALERTE'" /></td>
                            } @else {
                              <td class="non-eval" colspan="7">non évaluable : {{ raisonConso(c.raisonExclusion) }}</td>
                            }
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </details>
            }
          }
        }

        @if (historique(); as h) {
          @if (h.cyclesDisponibles.length > 0 && h.points.length > 1) {
            <section class="progression">
              <div class="entete-prog">
                <h2>Progression sur le cycle {{ h.cyclePaqd }}</h2>
                @if (h.cyclesDisponibles.length > 1) {
                  <label>
                    Cycle
                    <select [(ngModel)]="cycle" (ngModelChange)="recharger()">
                      @for (c of h.cyclesDisponibles; track c) {
                        <option [value]="c">{{ c }}</option>
                      }
                    </select>
                  </label>
                }
              </div>

              <dqa-courbe-progression [points]="h.points" />

              <p class="delta">
                M+{{ deltaBornes(h)[0] }} → M+{{ deltaBornes(h)[1] }} :
                <b [class]="'d-' + deltaSigne(h)">{{ deltaTexte(h) }}</b>
              </p>

              <table class="par-pilier">
                <thead>
                  <tr>
                    <th>Pilier</th>
                    @for (p of h.points; track p.rang) {
                      <th class="num">M+{{ p.rang }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (pil of piliers; track pil) {
                    <tr>
                      <td>{{ pil }} · {{ libellePilier(pil) }}</td>
                      @for (p of h.points; track p.rang) {
                        <td class="num">{{ scorePilier(p, pil) }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </section>
          }
        }
      } @else {
        <p class="vide">Site inconnu ou hors périmètre.</p>
      }
    </main>
  `,
  styles: `
    main { max-width: 60rem; margin: 0 auto; padding: 0 1rem; }
    .retour { color: #1f3d7a; font-size: 0.9rem; }
    h1 { font-size: 1.8rem; margin: 0.5rem 0 0; }
    .meta { color: #5b5b5b; margin-top: 0.25rem; }
    .controles { display: flex; gap: 1.5rem; align-items: center; margin: 1.5rem 0; flex-wrap: wrap; }
    label { display: grid; gap: 0.3rem; font-size: 0.85rem; }
    select { padding: 0.4rem; }
    .mois { color: #5b5b5b; font-size: 0.9rem; }
    .composite { display: flex; align-items: center; gap: 1.5rem; border: 1px solid #d9d9d6; background: #fff; padding: 1.2rem 1.5rem; margin-bottom: 1.5rem; }
    .composite .score { display: flex; align-items: baseline; gap: 0.5rem; }
    .composite .chiffre { font-size: 3.6rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
    .composite .sur { font-size: 1.1rem; color: #5b5b5b; }
    .composite .rang { display: grid; gap: 0.4rem; }
    .composite .partiel { color: #5b5b5b; font-size: 0.85rem; }
    .cartes { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); }
    .carte { border: 1px solid #d9d9d6; background: #fff; padding: 1.2rem; }
    .carte h2 { font-size: 1rem; margin: 0 0 1rem; }
    .mesure { display: flex; gap: 1rem; align-items: flex-start; }
    .valeur { font-size: 2.4rem; font-variant-numeric: tabular-nums; line-height: 1; }
    .unite { font-size: 1rem; color: #5b5b5b; }
    .seuil { color: #5b5b5b; font-size: 0.85rem; margin-top: 0.3rem; }
    .raison { color: #8a1c13; font-size: 0.85rem; margin-top: 0.3rem; }
    .vide { color: #5b5b5b; }
    .progression { margin-top: 2rem; border-top: 1px solid #d9d9d6; padding-top: 1.5rem; }
    .entete-prog { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .progression h2 { font-size: 1.1rem; margin: 0; }
    .delta { font-size: 0.9rem; color: #5b5b5b; margin: 0.6rem 0 1rem; }
    .delta b { font-variant-numeric: tabular-nums; }
    .delta .d-hausse { color: #1b5e20; }
    .delta .d-baisse { color: #8a1c13; }
    .delta .d-nul { color: #5b5b5b; }
    .par-pilier { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .par-pilier th, .par-pilier td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #d9d9d6; }
    .par-pilier th.num, .par-pilier td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .drill { margin-top: 1.5rem; }
    .drill summary { cursor: pointer; font-size: 0.9rem; color: #1f3d7a; }
    .drill-scroll { overflow-x: auto; margin-top: 0.8rem; }
    .drill table { width: 100%; border-collapse: collapse; font-size: 0.85rem; min-width: 44rem; }
    .drill th, .drill td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #d9d9d6; white-space: nowrap; }
    .drill th.num, .drill td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .drill .non-eval { color: #5b5b5b; font-size: 0.8rem; white-space: normal; }
  `,
})
export class DetailSitePage {
  readonly id = input.required<string>();
  protected readonly absent = VALEUR_ABSENTE;

  private readonly service = inject(SitesService);

  protected programmeId = '';
  protected mois = '';
  protected cycle = '';
  protected readonly piliers = PILIERS;
  protected readonly detail = signal<DetailSite | null>(null);
  protected readonly historique = signal<HistoriqueSite | null>(null);
  protected readonly p4Produits = signal<DetailP4Produits | null>(null);
  protected readonly programmes = signal<Programme[]>([]);
  protected readonly chargement = signal(true);

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    this.programmes.set(await this.service.programmes());
    await this.recharger();
  }

  protected async recharger(): Promise<void> {
    this.chargement.set(true);
    try {
      const [d, h, p4] = await Promise.all([
        this.service.detailSite(this.id(), {
          programmeId: this.programmeId || undefined,
          mois: this.mois || undefined,
        }),
        this.service.historique(this.id(), {
          programmeId: this.programmeId || undefined,
          cycle: this.cycle || undefined,
        }),
        this.service.p4Produits(this.id(), {
          programmeId: this.programmeId || undefined,
          mois: this.mois || undefined,
        }),
      ]);
      this.mois = d.moisPaqd ?? '';
      this.cycle = h.cyclePaqd ?? '';
      this.detail.set(d);
      this.historique.set(h);
      this.p4Produits.set(p4);
    } catch {
      this.detail.set(null);
      this.historique.set(null);
      this.p4Produits.set(null);
    }
    this.chargement.set(false);
  }

  protected libellePilier(pilier: Pilier): string {
    return LIBELLES_PILIER[pilier];
  }

  private readonly RAISONS_CONSO: Record<RaisonExclusionConso, string> = {
    un_seul_inventaire: 'un seul inventaire dans le mois',
    reconstituee_non_positive: 'consommation reconstituée ≤ 0',
  };

  protected raisonConso(raison: RaisonExclusionConso): string {
    return this.RAISONS_CONSO[raison];
  }

  /** Le pilier P4 a-t-il une valeur pour le mois affiché ? */
  protected p4Mesure(d: DetailSite): boolean {
    return d.piliers.find((p) => p.pilier === 'P4')?.score != null;
  }

  protected scorePilier(point: HistoriqueSite['points'][number], pilier: Pilier): string {
    const s = point.scoresPiliers.find((x) => x.pilier === pilier)?.score ?? null;
    return s === null ? VALEUR_ABSENTE : String(s);
  }

  private pointsMesures(h: HistoriqueSite): { rang: number; score: number }[] {
    return h.points
      .filter((p): p is HistoriqueSite['points'][number] & { scoreComposite: number } => p.scoreComposite !== null)
      .map((p) => ({ rang: p.rang, score: p.scoreComposite }));
  }

  private deltaValeur(h: HistoriqueSite): number | null {
    const m = this.pointsMesures(h);
    return m.length < 2 ? null : m[m.length - 1]!.score - m[0]!.score;
  }

  /** Rangs du premier et du dernier point mesuré (pour l'étiquette « M+a → M+b »). */
  protected deltaBornes(h: HistoriqueSite): [number | string, number | string] {
    const m = this.pointsMesures(h);
    return m.length === 0 ? [VALEUR_ABSENTE, VALEUR_ABSENTE] : [m[0]!.rang, m[m.length - 1]!.rang];
  }

  protected deltaSigne(h: HistoriqueSite): 'hausse' | 'baisse' | 'nul' {
    const v = this.deltaValeur(h);
    if (v === null || v === 0) return 'nul';
    return v > 0 ? 'hausse' : 'baisse';
  }

  protected deltaTexte(h: HistoriqueSite): string {
    const v = this.deltaValeur(h);
    if (v === null) return VALEUR_ABSENTE;
    const arrondi = Math.round(v * 10) / 10;
    if (arrondi > 0) return `+${arrondi} pts`;
    if (arrondi < 0) return `-${Math.abs(arrondi)} pts`;
    return '0 pt';
  }
}
