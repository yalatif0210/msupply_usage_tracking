# Guide du module `core/ressource`

## Rôle

Primitive d'affichage d'une donnée asynchrone **qui ne vide jamais la vue**
quand les filtres changent.

Le problème qu'elle résout : sur « Analyse fine » d'une fiche site, changer le
sélecteur de période rechargeait toute la page (garde ré-exécutée,
`loadComponent` rejoué, scroll remis à zéro), ce qui donnait l'impression d'un
« Actualiser » du navigateur. La règle transverse (`CLAUDE.md` §8,
`DESIGN_SYSTEM.md` §10) : un changement de `select` / onglet / case / champ de
recherche ne démonte jamais la vue, n'affiche jamais de spinner plein écran, et
reflète son état dans l'URL sans navigation.

Emplacement : `apps/web/src/app/core/ressource.ts`. Testée dans
`ressource.test.ts` (environnement node, un cas par règle).

## Contrat

`ressource<T, F>(options)` — fabrique à appeler dans un contexte d'injection
(initialiseur de champ de composant). `F extends Record<string, string>` : les
filtres sont toujours des chaînes, telles que les rend un `<select>` (chaîne
vide = filtre inactif).

| Option | Rôle |
|---|---|
| `charger: (filtres: F) => Promise<T>` | charge la donnée ; lever une erreur = échec **non bloquant** |
| `germe: T` | valeur affichée tant qu'aucun chargement n'a abouti |
| `filtresInitiaux: F` | filtres par défaut, avant lecture de l'URL |
| `clesUrl?` | sous-ensemble des clés de `F` à refléter dans l'URL (défaut : toutes) ; une clé absente reste locale |
| `apresChargement?: (donnee, filtres) => Partial<F> \| void` | réaligne les filtres sur ce que le serveur a servi (ex. le mois réellement disponible), **sans** relancer de chargement |

### Signaux exposés

| Signal | Sémantique |
|---|---|
| `valeur(): T` | dernière donnée connue ; **jamais** de retour au germe une fois qu'une donnée existe |
| `filtres(): F` | état de filtre courant |
| `enCours(): boolean` | un rafraîchissement est en vol (vrai dès l'appel, faux à l'arrivée comme sur échec) |
| `erreur(): unknown` | cause du dernier échec, remise à `null` à chaque nouvel appel ; non bloquante |
| `pret(): boolean` | au moins un chargement a abouti |
| `phase(): 'squelette' \| 'echec' \| 'prete'` | pour un `@switch` côté composant |

`phase()` : `squelette` tant qu'aucun chargement n'a abouti (premier rendu),
`echec` si le **premier** chargement a échoué (aucune donnée à montrer),
`prete` dès qu'une donnée existe — un rafraîchissement ultérieur en vol ou en
échec ne fait jamais retomber en `squelette` / `echec`.

### Méthodes

| Méthode | Effet |
|---|---|
| `demarrer()` | premier chargement, à appeler une fois quand les entrées externes sont prêtes (alias sémantique de `rafraichir`) |
| `definir(modif: Partial<F>)` | modifie des filtres, reflète l'URL, **puis rafraîchit en arrière-plan** |
| `definirLocal(modif: Partial<F>)` | modifie des filtres et reflète l'URL, **sans rafraîchir** : filtre satisfiable avec la donnée déjà chargée (filtrage client instantané) |
| `rafraichir()` | relance le chargement avec les filtres courants |

## Points d'entrée

Utilisée par `pages/detail-site.ts`, `pages/liste-sites.ts`,
`pages/synthese.ts`. Forme type :

```ts
protected readonly res = ressource({
  charger: (f) => this.api.charger(this.id, f),
  germe: { detail: null, historique: null },
  filtresInitiaux: { programme: '', de: '', a: '' },
  apresChargement: (v) => (v.detail ? { a: v.detail.moisPaqd } : undefined),
});
// dans le template : @switch (res.phase()) { @case ('squelette') … }
//   (ngModelChange)="res.definir({ de: versChaine($event) })"
```

Pendant un rafraîchissement, le panneau concerné porte `[attr.aria-busy]` et
une `<dqa-barre-attente [actif]="res.enCours()" />` (fine barre de progression,
seule affordance d'attente sanctionnée par `DESIGN_SYSTEM.md` §10) ; le contenu
courant reste monté et lisible.

## Décisions de conception

- **Pas de `Router.navigate`.** `ecrireUrl()` construit l'arbre d'URL avec
  `Router.createUrlTree` puis le pousse par `Location.replaceState` : aucune
  entrée d'historique, aucune ré-exécution de garde ou de `loadComponent`,
  aucun reset de scroll. C'est le cœur du correctif.
- **Jeton de requête monotone.** Chaque `charger()` incrémente un compteur ; une
  réponse dont le jeton est périmé est ignorée (course entre deux changements
  de filtre rapides).
- **L'URL prime au montage.** `lireUrl` lit `queryParamMap` par-dessus
  `filtresInitiaux` : un lien partagé restitue l'état de filtre.
- **Chaîne vide = paramètre retiré.** On écrit `?de=2026-03`, jamais `?de=`.
- **Échec non bloquant.** Sur erreur, `valeur()` est conservée et `erreur()`
  porte la cause ; à l'écran, un bandeau, jamais une page en erreur.
- **Pas de store tiers** (`CLAUDE.md` §7) : signals + service injecté.

## Pièges connus

- `ressource()` doit être appelée dans un **contexte d'injection** (elle fait
  `inject(Router)` etc.). Initialiseur de champ ou constructeur, pas plus tard.
- `demarrer()` n'est **pas** automatique : l'appeler une fois (typiquement dans
  `ngOnInit` ou après résolution de l'`id` de route).
- `definirLocal` ne recharge pas : ne l'utiliser que si `charger` renvoie déjà
  tout le nécessaire pour le nouveau filtre. Dans le doute, `definir`.
- `apresChargement` qui renvoie un partiel **non vide** déclenche une écriture
  d'URL mais **pas** un rechargement : ne pas y renvoyer un filtre qui exige
  d'autres données du serveur (boucle logique cassée, données incohérentes).
- Les deux `as` dans `lireUrl` / `clesUrl` sont bornés par
  `F extends Record<string, string>` et commentés sur place ; ne pas les
  généraliser.
