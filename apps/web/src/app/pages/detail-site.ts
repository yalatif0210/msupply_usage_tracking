import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  type WritableSignal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LIBELLES_PILIER,
  LIBELLES_SOUS_COMPOSANTE,
  PILIER_DE_SOUS_COMPOSANTE,
  PILIERS,
  SOUS_COMPOSANTES_DU_PILIER,
  type DetailP4Produits,
  type DetailSite,
  type HistoriqueSite,
  type Pilier,
  type Programme,
  type RaisonExclusionConso,
  type SousComposante,
  type SousComposanteBref,
} from '@dqa/contracts';
import { VALEUR_ABSENTE } from '../core/affichage';
import { SitesService } from '../core/sites.service';
import { BadgeClassification } from '../ui/badge-classification';
import { BadgeStatut } from '../ui/badge-statut';
import { CourbeSeries, type SerieCourbe } from '../ui/courbe-series';
import { Coquille } from '../ui/coquille';
import { Radar, type AxeRadar } from '../ui/radar';

type Granularite = 'composite' | 'pilier' | 'sousComposante';
type ModeRadar = '6' | '10';
type TriSc = 'sousComposante' | 'pilier' | 'valeur' | 'seuil' | 'ecart' | 'tauxAtteinte' | 'statut';

/** Nombre de forces / faiblesses saillantes listées sous le radar. */
const NB_SAILLANTS = 3;
/** Longueur max d'une étiquette d'axe radar en mode 10 sous-composantes. */
const LONGUEUR_ETIQUETTE_RADAR = 14;
/** Fenêtre du préréglage « 12 derniers mois » (bornes incluses). */
const MOIS_FENETRE_ANNEE = 11;

/** `AAAA-MM` moins `n` mois, sur le calendrier grégorien. */
function reculerMois(mois: string, n: number): string {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(a ?? 0, (m ?? 1) - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'dqa-detail-site',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Coquille, BadgeStatut, BadgeClassification, CourbeSeries, Radar, DecimalPipe],
  template: `
    <dqa-coquille />
    <main>
      <a routerLink="/sites" class="retour">← Tous les sites</a>

      @if (chargement()) {
        <p>Chargement…</p>
      } @else if (detail(); as d) {
        <h1>{{ d.site.siteNom }}</h1>
        <p class="meta">
          {{ d.site.district ?? absent }} · {{ d.site.region ?? absent }} · {{ d.site.typeStructure ?? absent }}
        </p>

        <div class="controles">
          <label>
            Programme
            <select [ngModel]="programmeId()" (ngModelChange)="definirEtRecharger(programmeId, $event)">
              <option value="">Tous programmes</option>
              @for (p of programmes(); track p.programmeId) {
                <option [value]="p.programmeId">{{ p.programmeNom }}</option>
              }
            </select>
          </label>
          <span class="mois">Mois affiché : {{ d.moisPaqd ?? absent }}</span>
        </div>

        @if (d.piliers.length === 0) {
          <p class="vide">Aucune mesure pour ce site. Le premier import contenant ce site alimentera l'écran.</p>
        } @else {
          <div class="composite">
            <div class="score">
              <div class="chiffre">{{ d.scoreComposite === null ? absent : (d.scoreComposite | number: '1.0-1') }}</div>
              <div class="sur">/ 100</div>
            </div>
            <div class="rang">
              <dqa-badge-classification [classification]="d.classification" />
              @if (d.piliersCouverts < d.piliersTotal) {
                <div class="partiel">
                  Score calculé sur {{ d.piliersCouverts }} pilier{{ d.piliersCouverts > 1 ? 's' : '' }} sur {{ d.piliersTotal }}
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
                        {{ sc.valeur === null ? absent : (sc.valeur | number: '1.0-1') }} <span class="unite">%</span>
                      </div>
                      <div class="seuil">seuil {{ sc.seuil === null ? absent : (sc.seuil | number: '1.0-1') }} %</div>
                      @if (sc.raison) { <div class="raison">{{ sc.raison }}</div> }
                    </div>
                  </div>
                }
              </article>
            }
          </div>

          @if (p4Mesure() && p4Produits(); as p4) {
            @if (p4.produits.length > 0) {
              <details class="drill">
                <summary>P4 · détail par produit traceur ({{ p4.produits.length }})</summary>
                <div class="drill-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Produit</th><th class="num">Théo.</th><th class="num">Compté</th><th class="num">Écart SDU</th><th>SDU</th>
                        <th class="num">Début</th><th class="num">Récept.</th><th class="num">Fin</th><th class="num">Reconst.</th>
                        <th class="num">Déclarée</th><th class="num">Écart conso.</th><th>Conso.</th>
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

          @if (d.sousComposantes.length > 0) {
            <section class="analyse">
              <div class="entete-analyse">
                <h2>Analyse fine</h2>
                <div class="plage">
                  <label>De
                    <select [ngModel]="de()" (ngModelChange)="definirEtRecharger(de, $event)">
                      @for (m of moisDisponibles(); track m) { <option [value]="m">{{ m }}</option> }
                    </select>
                  </label>
                  <label>à
                    <select [ngModel]="a()" (ngModelChange)="definirEtRecharger(a, $event)">
                      @for (m of moisDisponibles(); track m) { <option [value]="m">{{ m }}</option> }
                    </select>
                  </label>
                  <button type="button" (click)="preset('cycle')">Cycle courant</button>
                  <button type="button" (click)="preset('12m')">12 derniers mois</button>
                  <button type="button" (click)="preset('tout')">Tout</button>
                </div>
              </div>

              <details class="drill" open>
                <summary>Sous-composantes au {{ d.moisPaqd }}</summary>
                <div class="drill-scroll">
                  <table class="a-plat">
                    <thead>
                      <tr>
                        <th (click)="trierSc('sousComposante')">Sous-composante{{ fleche('sousComposante') }}</th>
                        <th (click)="trierSc('pilier')">Pilier{{ fleche('pilier') }}</th>
                        <th class="num" (click)="trierSc('valeur')">Valeur{{ fleche('valeur') }}</th>
                        <th class="num" (click)="trierSc('seuil')">Seuil{{ fleche('seuil') }}</th>
                        <th class="num" (click)="trierSc('ecart')">Écart au seuil{{ fleche('ecart') }}</th>
                        <th class="num" (click)="trierSc('tauxAtteinte')">Taux d'atteinte{{ fleche('tauxAtteinte') }}</th>
                        <th (click)="trierSc('statut')">Statut{{ fleche('statut') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (sc of scTriees(); track sc.sousComposante) {
                        <tr>
                          <td>{{ libelleSc(sc.sousComposante) }}</td>
                          <td>{{ pilierDe(sc.sousComposante) }}</td>
                          <td class="num">{{ sc.valeur === null ? absent : (sc.valeur | number: '1.0-1') }}</td>
                          <td class="num">{{ sc.seuil === null ? absent : (sc.seuil | number: '1.0-1') }}</td>
                          <td class="num">{{ ecartAuSeuil(sc) }}</td>
                          <td class="num">{{ sc.tauxAtteinte === null ? absent : (sc.tauxAtteinte | number: '1.0-1') }}</td>
                          <td><dqa-badge-statut [statut]="sc.statut" /></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </details>

              <div class="radar-bloc">
                <div class="entete-bloc">
                  <h3>Forces et faiblesses au {{ d.moisPaqd }}</h3>
                  <div class="bascule">
                    <label><input type="radio" name="axes" [checked]="axes() === '6'" (change)="axes.set('6')" /> 6 piliers</label>
                    <label><input type="radio" name="axes" [checked]="axes() === '10'" (change)="axes.set('10')" /> 10 sous-composantes</label>
                  </div>
                </div>
                <dqa-radar [axes]="axesRadar()" />
                <div class="forces">
                  <div>
                    <h4>Forces</h4>
                    <ul>@for (f of forces(); track f.sousComposante) { <li>{{ libelleSc(f.sousComposante) }} · {{ f.tauxAtteinte | number: '1.0-0' }}</li> }</ul>
                  </div>
                  <div>
                    <h4>Faiblesses</h4>
                    <ul>@for (f of faiblesses(); track f.sousComposante) { <li>{{ libelleSc(f.sousComposante) }} · {{ f.tauxAtteinte | number: '1.0-0' }}</li> }</ul>
                  </div>
                </div>
              </div>

              @if (historique(); as h) {
                @if (h.points.length > 1) {
                  <div class="courbe-bloc">
                    <div class="entete-bloc">
                      <h3>Évolution</h3>
                      <div class="bascule">
                        <select [ngModel]="granularite()" (ngModelChange)="granularite.set($event)">
                          <option value="composite">Score composite</option>
                          <option value="pilier">Par pilier</option>
                          <option value="sousComposante">Par sous-composante</option>
                        </select>
                        @if (granularite() === 'sousComposante') {
                          <select [ngModel]="pilierCourbe()" (ngModelChange)="pilierCourbe.set($event)">
                            @for (p of piliers; track p) { <option [value]="p">{{ p }} · {{ libellePilier(p) }}</option> }
                          </select>
                        }
                      </div>
                    </div>
                    <dqa-courbe-series
                      [etiquettes]="etiquettesCourbe()"
                      [series]="seriesCourbe()"
                      [seuils]="granularite() === 'composite' ? [75, 90] : [65, 75, 90]"
                    />
                    @if (granularite() === 'composite') {
                      <p class="delta">{{ deltaComposite() }}</p>
                    }
                  </div>
                }
              }
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
    .retour { color: var(--accent); font-size: 0.9rem; }
    h1 { font-size: 1.8rem; margin: 0.5rem 0 0; }
    .meta { color: var(--texte-doux); margin-top: 0.25rem; }
    .controles { display: flex; gap: 1.5rem; align-items: center; margin: 1.5rem 0; flex-wrap: wrap; }
    label { display: grid; gap: 0.3rem; font-size: 0.85rem; }
    select { padding: 0.4rem; }
    .mois { color: var(--texte-doux); font-size: 0.9rem; }
    .composite { display: flex; align-items: center; gap: 1.5rem; border: 1px solid var(--bordure); background: var(--surface); padding: 1.2rem 1.5rem; margin-bottom: 1.5rem; }
    .composite .score { display: flex; align-items: baseline; gap: 0.5rem; }
    .composite .chiffre { font-size: 3.6rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
    .composite .sur { font-size: 1.1rem; color: var(--texte-doux); }
    .composite .rang { display: grid; gap: 0.4rem; }
    .composite .partiel { color: var(--texte-doux); font-size: 0.85rem; }
    .cartes { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); }
    .carte { border: 1px solid var(--bordure); background: var(--surface); padding: 1.2rem; }
    .carte h2 { font-size: 1rem; margin: 0 0 1rem; }
    .mesure { display: flex; gap: 1rem; align-items: flex-start; }
    .valeur { font-size: 2.4rem; font-variant-numeric: tabular-nums; line-height: 1; }
    .unite { font-size: 1rem; color: var(--texte-doux); }
    .seuil { color: var(--texte-doux); font-size: 0.85rem; margin-top: 0.3rem; }
    .raison { color: var(--alerte-texte); font-size: 0.85rem; margin-top: 0.3rem; }
    .vide { color: var(--texte-doux); }
    .analyse { margin-top: 2rem; border-top: 1px solid var(--bordure); padding-top: 1.5rem; }
    .analyse h2 { font-size: 1.2rem; margin: 0; }
    .analyse h3 { font-size: 1rem; margin: 0; }
    .entete-analyse, .entete-bloc { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
    .plage { display: flex; gap: 0.6rem; align-items: end; flex-wrap: wrap; }
    .plage label { flex-direction: row; align-items: center; gap: 0.3rem; }
    button { padding: 0.4rem 0.7rem; background: none; border: 1px solid var(--bordure); color: var(--accent); cursor: pointer; font-size: 0.8rem; }
    button:hover { border-color: var(--accent); }
    .bascule { display: flex; gap: 0.8rem; align-items: center; font-size: 0.85rem; }
    .bascule label { flex-direction: row; align-items: center; gap: 0.3rem; }
    .radar-bloc, .courbe-bloc { margin-top: 1.5rem; }
    .forces { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1rem; font-size: 0.9rem; }
    .forces h4 { margin: 0 0 0.4rem; font-size: 0.9rem; }
    .forces ul { list-style: none; margin: 0; padding: 0; }
    .forces li { padding: 0.15rem 0; font-variant-numeric: tabular-nums; }
    .delta { font-size: 0.9rem; color: var(--texte-doux); margin: 0.4rem 0 0; }
    table { width: 100%; border-collapse: collapse; }
    .a-plat { font-size: 0.9rem; }
    .a-plat th, .a-plat td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--bordure); }
    .a-plat th.num, .a-plat td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .a-plat thead th { cursor: pointer; white-space: nowrap; }
    .a-plat thead th:hover { color: var(--accent); }
    .drill { margin-top: 1.5rem; }
    .drill summary { cursor: pointer; font-size: 0.9rem; color: var(--accent); }
    .drill-scroll { overflow-x: auto; margin-top: 0.8rem; }
    .drill table { border-collapse: collapse; font-size: 0.85rem; }
    .drill th, .drill td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--bordure); white-space: nowrap; }
    .drill th.num, .drill td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .drill .non-eval { color: var(--texte-doux); font-size: 0.8rem; white-space: normal; }
  `,
})
export class DetailSitePage {
  readonly id = input.required<string>();
  protected readonly absent = VALEUR_ABSENTE;
  protected readonly piliers = PILIERS;

  private readonly service = inject(SitesService);

  protected readonly programmeId = signal('');
  protected readonly de = signal('');
  protected readonly a = signal('');
  protected readonly granularite = signal<Granularite>('composite');
  protected readonly pilierCourbe = signal<Pilier>(PILIERS[0]);
  protected readonly axes = signal<ModeRadar>('6');
  protected readonly triSc = signal<{ colonne: TriSc; sens: 1 | -1 }>({ colonne: 'tauxAtteinte', sens: 1 });

  protected readonly detail = signal<DetailSite | null>(null);
  protected readonly historique = signal<HistoriqueSite | null>(null);
  protected readonly p4Produits = signal<DetailP4Produits | null>(null);
  protected readonly programmes = signal<Programme[]>([]);
  protected readonly chargement = signal(true);

  protected readonly moisDisponibles = computed(() => this.historique()?.moisDisponibles ?? []);

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
      const h = await this.service.historique(this.id(), {
        programmeId: this.programmeId() || undefined,
        de: this.de() || undefined,
        a: this.a() || undefined,
      });
      // aligne la plage sur ce que l'historique a réellement renvoyé
      if (h.points.length) {
        this.de.set(h.points[0]!.moisPaqd);
        this.a.set(h.points.at(-1)!.moisPaqd);
      }
      const moisFiche = this.a() || h.points.at(-1)?.moisPaqd || undefined;
      const [d, p4] = await Promise.all([
        this.service.detailSite(this.id(), { programmeId: this.programmeId() || undefined, mois: moisFiche }),
        this.service.p4Produits(this.id(), { programmeId: this.programmeId() || undefined, mois: moisFiche }),
      ]);
      this.historique.set(h);
      this.detail.set(d);
      this.p4Produits.set(p4);
    } catch {
      this.detail.set(null);
      this.historique.set(null);
      this.p4Produits.set(null);
    }
    this.chargement.set(false);
  }

  /** Écrit un filtre (programme, borne de plage) puis relance le chargement. */
  protected definirEtRecharger(cible: WritableSignal<string>, valeur: string): void {
    cible.set(valeur);
    void this.recharger();
  }

  protected preset(quoi: 'cycle' | '12m' | 'tout'): void {
    const mois = this.moisDisponibles(); // décroissant
    if (quoi === 'cycle') {
      this.de.set('');
      this.a.set('');
    } else if (quoi === 'tout' && mois.length) {
      this.de.set(mois.at(-1)!);
      this.a.set(mois[0]!);
    } else if (quoi === '12m' && mois.length) {
      // 12 mois calendaires en arrière depuis le dernier mois connu, et non les
      // 12 derniers mois *mesurés* : l'API borne ensuite à l'historique réel.
      const fin = mois[0]!;
      this.a.set(fin);
      this.de.set(reculerMois(fin, MOIS_FENETRE_ANNEE));
    }
    void this.recharger();
  }

  protected libellePilier = (p: Pilier) => LIBELLES_PILIER[p];
  protected libelleSc = (sc: SousComposante) => LIBELLES_SOUS_COMPOSANTE[sc];
  protected pilierDe = (sc: SousComposante) => PILIER_DE_SOUS_COMPOSANTE[sc];

  /** Écart signé valeur - seuil, arrondi au dixième ; `null` si non calculable. */
  private ecartNum(sc: SousComposanteBref): number | null {
    if (sc.valeur === null || sc.seuil === null) return null;
    return Math.round((sc.valeur - sc.seuil) * 10) / 10;
  }

  protected ecartAuSeuil(sc: SousComposanteBref): string {
    const e = this.ecartNum(sc);
    if (e === null) return VALEUR_ABSENTE;
    return e > 0 ? `+${e}` : String(e);
  }

  private readonly RAISONS_CONSO: Record<RaisonExclusionConso, string> = {
    un_seul_inventaire: 'un seul inventaire dans le mois',
    reconstituee_non_positive: 'consommation reconstituée ≤ 0',
  };
  protected raisonConso = (r: RaisonExclusionConso) => this.RAISONS_CONSO[r];

  protected readonly p4Mesure = computed(
    () => this.detail()?.piliers.find((p) => p.pilier === 'P4')?.score != null,
  );

  // ── tableau à plat ─────────────────────────────────────────────────────
  protected trierSc(colonne: TriSc): void {
    const t = this.triSc();
    this.triSc.set({ colonne, sens: t.colonne === colonne ? ((t.sens * -1) as 1 | -1) : 1 });
  }

  protected fleche(colonne: TriSc): string {
    const t = this.triSc();
    return t.colonne === colonne ? (t.sens === 1 ? ' ▲' : ' ▼') : '';
  }

  protected readonly scTriees = computed<SousComposanteBref[]>(() => {
    const d = this.detail();
    if (!d) return [];
    const { colonne, sens } = this.triSc();
    const cle = (s: SousComposanteBref): string | number | null => {
      switch (colonne) {
        case 'sousComposante':
          return this.libelleSc(s.sousComposante);
        case 'pilier':
          return this.pilierDe(s.sousComposante);
        case 'statut':
          return s.statut;
        case 'ecart':
          return this.ecartNum(s);
        default:
          return s[colonne]; // valeur | seuil | tauxAtteinte
      }
    };
    return [...d.sousComposantes].sort((x, y) => {
      const [a, b] = [cle(x), cle(y)];
      if (a === b) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a < b ? -1 : 1) * sens;
    });
  });

  // ── radar ──────────────────────────────────────────────────────────────
  protected readonly axesRadar = computed<AxeRadar[]>(() => {
    const d = this.detail();
    if (!d) return [];
    if (this.axes() === '10') {
      return d.sousComposantes.map((s) => ({
        etiquette:
          s.sousComposante === 'ratio_ajustements'
            ? 'ratio ajust.'
            : this.libelleSc(s.sousComposante).slice(0, LONGUEUR_ETIQUETTE_RADAR),
        valeur: s.tauxAtteinte,
        statut: s.statut,
      }));
    }
    return this.piliers.map((p) => {
      const scs = d.sousComposantes.filter((s) => this.pilierDe(s.sousComposante) === p);
      const vals = scs.map((s) => s.tauxAtteinte).filter((v): v is number => v !== null);
      const alerte = scs.some((s) => s.statut === 'ALERTE');
      return {
        etiquette: p,
        valeur: vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : null,
        statut: vals.length === 0 ? 'NON_CALCULABLE' : alerte ? 'ALERTE' : 'CONFORME',
      };
    });
  });

  /** Les sous-composantes calculables, du plus faible taux d'atteinte au plus fort. */
  private readonly classees = computed<(SousComposanteBref & { tauxAtteinte: number })[]>(() => {
    const d = this.detail();
    if (!d) return [];
    return d.sousComposantes
      .filter((s): s is SousComposanteBref & { tauxAtteinte: number } => s.tauxAtteinte !== null)
      .sort((x, y) => x.tauxAtteinte - y.tauxAtteinte);
  });
  protected readonly faiblesses = computed(() =>
    this.classees()
      .filter((s) => s.tauxAtteinte < 100)
      .slice(0, NB_SAILLANTS),
  );
  protected readonly forces = computed(() => this.classees().slice(-NB_SAILLANTS).reverse());

  // ── courbes ────────────────────────────────────────────────────────────
  protected readonly etiquettesCourbe = computed(() =>
    (this.historique()?.points ?? []).map((p) => p.moisPaqd),
  );

  protected readonly seriesCourbe = computed<SerieCourbe[]>(() => {
    const points = this.historique()?.points ?? [];
    const g = this.granularite();
    if (g === 'composite') {
      return [{ nom: 'Score composite', points: points.map((p) => p.scoreComposite) }];
    }
    if (g === 'pilier') {
      return this.piliers.map((pil) => ({
        nom: pil,
        points: points.map((p) => p.scoresPiliers.find((s) => s.pilier === pil)?.score ?? null),
      }));
    }
    return SOUS_COMPOSANTES_DU_PILIER[this.pilierCourbe()].map((sc) => ({
      nom: this.libelleSc(sc),
      points: points.map((p) => p.sousComposantes.find((s) => s.sousComposante === sc)?.tauxAtteinte ?? null),
    }));
  });

  protected readonly deltaComposite = computed(() => {
    const points = this.historique()?.points ?? [];
    const m = points.filter((p): p is (typeof p) & { scoreComposite: number } => p.scoreComposite !== null);
    if (m.length < 2) return '';
    const v = Math.round((m.at(-1)!.scoreComposite - m[0]!.scoreComposite) * 10) / 10;
    const signe = v > 0 ? `+${v}` : String(v);
    return `${m[0]!.moisPaqd} → ${m.at(-1)!.moisPaqd} : ${signe} pts`;
  });
}
