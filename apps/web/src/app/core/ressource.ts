import { Location } from '@angular/common';
import { computed, inject, signal, type Signal, type WritableSignal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Phase d'affichage d'une {@link Ressource} :
 * - `squelette` : aucun chargement n'a encore abouti (premier rendu) ;
 * - `echec` : le premier chargement a échoué, aucune donnée à montrer ;
 * - `prete` : une donnée existe (un rafraîchissement ultérieur peut être en
 *   vol ou avoir échoué sans que la vue se vide).
 */
export type PhaseRessource = 'squelette' | 'echec' | 'prete';

/**
 * Primitive de donnee asynchrone qui ne vide jamais la vue.
 *
 * Enveloppe un chargeur `(filtres) => Promise<T>` dont les entrees sont un jeu
 * de filtres (des chaines, tel que les rend un `<select>`). Regles :
 *
 * - `valeur()` garde la derniere donnee connue tant qu'un rafraichissement est
 *   en vol : on ne repasse jamais au germe une fois qu'une donnee existe ;
 * - `enCours()` passe a vrai des l'appel, faux a l'arrivee comme sur echec ;
 * - sur echec `valeur()` est conservee et `erreur()` porte la cause, non
 *   bloquante ;
 * - l'etat de filtre est reflete dans l'URL **en place** : on construit l'arbre
 *   d'URL avec le `Router` (sans naviguer, donc sans re-run de garde, sans
 *   re-execution du `loadComponent`, sans reset de scroll) et on le pousse par
 *   `Location.replaceState`, ce qui n'ajoute aucune entree d'historique ;
 * - au montage, les filtres presents dans l'URL priment sur les valeurs par
 *   defaut.
 */
export interface OptionsRessource<T, F extends Record<string, string>> {
  /** Charge la donnee pour un jeu de filtres. Lever une erreur = echec non bloquant. */
  readonly charger: (filtres: F) => Promise<T>;
  /** Valeur affichee tant qu'aucun chargement n'a abouti. */
  readonly germe: T;
  /** Filtres par defaut, avant lecture de l'URL. */
  readonly filtresInitiaux: F;
  /**
   * Cles de filtre a refleter dans l'URL. Par defaut, toutes.
   * Une cle absente de cette liste reste locale (jamais dans l'URL).
   */
  readonly clesUrl?: readonly (keyof F & string)[];
  /**
   * Ajustement des filtres apres un chargement reussi (ex. aligner le mois
   * affiche sur celui que le serveur a effectivement servi). Le partiel
   * renvoye est applique ; il ne declenche un nouveau chargement que si
   * `rechargerApresAjustement` est vrai ET qu'au moins une valeur change.
   */
  readonly apresChargement?: (donnee: T, filtres: F) => Partial<F> | void;
  /**
   * Si vrai, un ajustement `apresChargement` qui change reellement un filtre
   * relance un chargement (ex. elargir la plage servie par defaut). La
   * fonction `apresChargement` doit alors etre idempotente : appelee sur sa
   * propre sortie, elle ne doit plus rien changer, sinon boucle.
   */
  readonly rechargerApresAjustement?: boolean;
}

export class Ressource<T, F extends Record<string, string>> {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  private readonly _valeur: WritableSignal<T>;
  private readonly _filtres: WritableSignal<F>;
  private readonly _enCours = signal(false);
  private readonly _erreur = signal<unknown>(null);
  private readonly _pret = signal(false);
  /** Numero de la requete courante : une reponse d'un jeton perime est ignoree. */
  private jeton = 0;

  /** Derniere donnee connue, ou le germe tant qu'aucun chargement n'a abouti. */
  readonly valeur: Signal<T>;
  /** Un rafraichissement est en vol. */
  readonly enCours = this._enCours.asReadonly();
  /** Cause du dernier echec, remise a `null` a chaque nouvel appel. */
  readonly erreur = this._erreur.asReadonly();
  /** Au moins un chargement a abouti : autorise a sortir du squelette. */
  readonly pret = this._pret.asReadonly();
  /** Etat de filtre courant. */
  readonly filtres: Signal<F>;
  /** Phase d'affichage, pour un `@switch` cote composant. */
  readonly phase: Signal<PhaseRessource>;

  constructor(private readonly options: OptionsRessource<T, F>) {
    this._valeur = signal(options.germe);
    this._filtres = signal(this.lireUrl(options.filtresInitiaux));
    this.valeur = this._valeur.asReadonly();
    this.filtres = this._filtres.asReadonly();
    this.phase = computed(() =>
      this._pret() ? 'prete' : this._erreur() !== null ? 'echec' : 'squelette',
    );
  }

  /**
   * Premier chargement, a appeler une fois quand les entrees externes sont
   * pretes. Identique a {@link rafraichir} ; le nom distinct documente
   * l'intention au point d'appel (init vs. relance manuelle).
   */
  demarrer(): Promise<void> {
    return this.charger();
  }

  /** Modifie des filtres, reflete l'URL, puis rafraichit en arriere-plan. */
  definir(modif: Partial<F>): void {
    this._filtres.update((f) => ({ ...f, ...modif }));
    this.ecrireUrl();
    void this.charger();
  }

  /**
   * Modifie des filtres et reflete l'URL, **sans** rafraichir : pour un filtre
   * satisfiable avec la donnee deja chargee (filtrage client instantane).
   */
  definirLocal(modif: Partial<F>): void {
    this._filtres.update((f) => ({ ...f, ...modif }));
    this.ecrireUrl();
  }

  /** Relance le chargement avec les filtres courants. */
  rafraichir(): Promise<void> {
    return this.charger();
  }

  private async charger(): Promise<void> {
    const jeton = ++this.jeton;
    this._enCours.set(true);
    this._erreur.set(null);
    try {
      const donnee = await this.options.charger(this._filtres());
      if (jeton !== this.jeton) return;
      this._valeur.set(donnee);
      this._pret.set(true);
      const ajuste = this.options.apresChargement?.(donnee, this._filtres());
      if (ajuste && Object.keys(ajuste).length > 0) {
        const courant = this._filtres();
        const change = (Object.entries(ajuste) as [keyof F, F[keyof F]][]).some(
          ([cle, val]) => courant[cle] !== val,
        );
        if (change) {
          this._filtres.update((f) => ({ ...f, ...ajuste }));
          this.ecrireUrl();
          if (this.options.rechargerApresAjustement) void this.charger();
        }
      }
    } catch (cause) {
      if (jeton !== this.jeton) return;
      this._erreur.set(cause);
    } finally {
      if (jeton === this.jeton) this._enCours.set(false);
    }
  }

  private clesUrl(): readonly (keyof F & string)[] {
    // `filtresInitiaux` est un `F` : ses clés SONT `keyof F & string`. Seule la
    // signature trop large de `Object.keys` (`string[]`) impose la restriction.
    return this.options.clesUrl ?? (Object.keys(this.options.filtresInitiaux) as (keyof F & string)[]);
  }

  private lireUrl(base: F): F {
    const params = this.route.snapshot.queryParamMap;
    const out: F = { ...base };
    for (const cle of this.clesUrl()) {
      const valeur = params.get(cle);
      // `F` étend `Record<string, string>` : une valeur de filtre est toujours
      // une chaîne. TS ne peut pas le prouver pour une écriture générique
      // (`F` pourrait être une union littérale), d'où la restriction, bornée ici.
      if (valeur !== null) out[cle] = valeur as F[keyof F & string];
    }
    return out;
  }

  private ecrireUrl(): void {
    const filtres = this._filtres();
    const queryParams: Record<string, string | null> = {};
    for (const cle of this.clesUrl()) {
      const valeur = filtres[cle];
      // chaine vide = filtre inactif : on retire le parametre plutot que ?x=
      queryParams[cle] = valeur ? valeur : null;
    }
    const arbre = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
    this.location.replaceState(this.router.serializeUrl(arbre));
  }
}

/**
 * Fabrique de {@link Ressource}. A appeler dans un contexte d'injection
 * (initialiseur de champ ou constructeur de composant).
 */
export function ressource<T, F extends Record<string, string>>(
  options: OptionsRessource<T, F>,
): Ressource<T, F> {
  return new Ressource(options);
}
