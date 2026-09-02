import { Location } from '@angular/common';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ressource, type OptionsRessource } from './ressource';

/** Une promesse dont on pilote la resolution depuis le test. */
function differe<T>() {
  let resoudre!: (v: T) => void;
  let rejeter!: (e: unknown) => void;
  const promesse = new Promise<T>((ok, ko) => {
    resoudre = ok;
    rejeter = ko;
  });
  return { promesse, resoudre, rejeter };
}

/** Laisse les microtaches en attente se vider. */
const tick = () => new Promise((r) => setTimeout(r, 0));

function monter<T, F extends Record<string, string>>(
  options: OptionsRessource<T, F>,
  queryParams: Record<string, string> = {},
) {
  const replaceState = vi.fn<(url: string, query?: string) => void>();
  const navigate = vi.fn();
  const navigateByUrl = vi.fn();
  const router = {
    navigate,
    navigateByUrl,
    createUrlTree: (_commandes: unknown[], extras: { queryParams: Record<string, string | null> }) => ({
      queryParams: extras.queryParams,
    }),
    serializeUrl: (arbre: { queryParams: Record<string, string | null> }) => {
      const p = new URLSearchParams(queryParams);
      for (const [k, v] of Object.entries(arbre.queryParams)) {
        if (v === null) p.delete(k);
        else p.set(k, v);
      }
      const qs = p.toString();
      return qs ? `/ecran?${qs}` : '/ecran';
    },
  };
  const location = { replaceState, path: () => '/ecran' };
  const route = { snapshot: { queryParamMap: convertToParamMap(queryParams) } };
  const injector = Injector.create({
    providers: [
      { provide: Router, useValue: router },
      { provide: Location, useValue: location },
      { provide: ActivatedRoute, useValue: route },
    ],
  });
  const res = runInInjectionContext(injector, () => ressource(options));
  return { res, replaceState, navigate, navigateByUrl };
}

describe('ressource : ne vide jamais la vue', () => {
  it('garde la valeur precedente pendant un refetch', async () => {
    let n = 0;
    const d = [differe<string>(), differe<string>()];
    const { res } = monter({
      charger: () => d[n++]!.promesse,
      germe: '',
      filtresInitiaux: { q: 'a' },
    });
    void res.demarrer();
    d[0]!.resoudre('premier');
    await tick();
    expect(res.valeur()).toBe('premier');

    res.definir({ q: 'b' });
    expect(res.valeur()).toBe('premier'); // refetch en vol : ancienne donnee conservee
  });

  it('expose la nouvelle valeur une fois le refetch arrive', async () => {
    let n = 0;
    const d = [differe<string>(), differe<string>()];
    const { res } = monter({
      charger: () => d[n++]!.promesse,
      germe: '',
      filtresInitiaux: { q: 'a' },
    });
    void res.demarrer();
    d[0]!.resoudre('premier');
    await tick();

    res.definir({ q: 'b' });
    d[1]!.resoudre('second');
    await tick();
    expect(res.valeur()).toBe('second');
  });

  it('enCours() est vrai pendant le vol', async () => {
    const d = differe<string>();
    const { res } = monter({ charger: () => d.promesse, germe: '', filtresInitiaux: { q: 'a' } });
    void res.demarrer();
    expect(res.enCours()).toBe(true);
  });

  it('enCours() repasse a faux a l\'arrivee', async () => {
    const d = differe<string>();
    const { res } = monter({ charger: () => d.promesse, germe: '', filtresInitiaux: { q: 'a' } });
    void res.demarrer();
    d.resoudre('ok');
    await tick();
    expect(res.enCours()).toBe(false);
  });

  it('enCours() repasse a faux sur echec', async () => {
    const d = differe<string>();
    const { res } = monter({ charger: () => d.promesse, germe: '', filtresInitiaux: { q: 'a' } });
    void res.demarrer();
    d.rejeter(new Error('boum'));
    await tick();
    expect(res.enCours()).toBe(false);
  });

  it('phase() : squelette avant tout chargement, prete apres succes', async () => {
    const d = differe<string>();
    const { res } = monter({ charger: () => d.promesse, germe: '', filtresInitiaux: { q: 'a' } });
    expect(res.phase()).toBe('squelette');
    void res.demarrer();
    d.resoudre('ok');
    await tick();
    expect(res.phase()).toBe('prete');
  });

  it('phase() : echec quand le premier chargement rate sans donnee', async () => {
    const d = differe<string>();
    const { res } = monter({ charger: () => d.promesse, germe: '', filtresInitiaux: { q: 'a' } });
    void res.demarrer();
    d.rejeter(new Error('boum'));
    await tick();
    expect(res.phase()).toBe('echec');
  });

  it('garde la valeur precedente sur echec et expose erreur()', async () => {
    let n = 0;
    const d = [differe<string>(), differe<string>()];
    const { res } = monter({
      charger: () => d[n++]!.promesse,
      germe: '',
      filtresInitiaux: { q: 'a' },
    });
    void res.demarrer();
    d[0]!.resoudre('premier');
    await tick();

    res.definir({ q: 'b' });
    d[1]!.rejeter(new Error('boum'));
    await tick();
    expect(res.valeur()).toBe('premier');
  });

  it('erreur() porte la cause du dernier echec', async () => {
    const d = differe<string>();
    const { res } = monter({ charger: () => d.promesse, germe: '', filtresInitiaux: { q: 'a' } });
    void res.demarrer();
    const cause = new Error('boum');
    d.rejeter(cause);
    await tick();
    expect(res.erreur()).toBe(cause);
  });
});

describe('ressource : synchro URL en place', () => {
  it('ecrit le query param via Location.replaceState', () => {
    const { res, replaceState } = monter({
      charger: () => Promise.resolve('x'),
      germe: '',
      filtresInitiaux: { mois: '' },
    });
    res.definir({ mois: '2026-05' });
    expect(replaceState).toHaveBeenCalledWith('/ecran?mois=2026-05');
  });

  it('ne declenche aucune navigation de route', () => {
    const { res, navigate, navigateByUrl } = monter({
      charger: () => Promise.resolve('x'),
      germe: '',
      filtresInitiaux: { mois: '' },
    });
    res.definir({ mois: '2026-05' });
    expect(navigate).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('un filtre client reflete l\'URL sans rafraichir', () => {
    const charger = vi.fn(() => Promise.resolve('x'));
    const { res, replaceState } = monter({
      charger,
      germe: '',
      filtresInitiaux: { district: '' },
    });
    res.definirLocal({ district: 'Cocody' });
    expect(replaceState).toHaveBeenCalledWith('/ecran?district=Cocody');
    expect(charger).not.toHaveBeenCalled();
  });

  it('restaure l\'etat de filtre depuis un query param au montage', () => {
    const { res } = monter(
      { charger: () => Promise.resolve('x'), germe: '', filtresInitiaux: { mois: '2026-01' } },
      { mois: '2026-07' },
    );
    expect(res.filtres().mois).toBe('2026-07');
  });
});
