# Le référentiel des structures administre l'échéance et le régime de scoring

**Statut.** Accepté.

**Contexte.** Le `type_structure` d'un site (`name.category3_id →
name_category3.description` dans mSupply) pilote trois choses :

- la **strate** d'affichage des agrégats nationaux (« Rapports & inventaires ») ;
- l'**échéance de soumission** d'une réquisition (jour de M+1 : P2 promptitude,
  `mois_est_clos`) ;
- le **régime de scoring** : un district mesure P3 sur les réquisitions de sa
  zone servies et P4 sur les quantités distribuées (ADR 0011, ADR 0012) ;
  un site de soins mesure P3 sur ses dispensations et P4 sur sa consommation.

Seule la strate était administrée (table `strate_structure`, écran
`/admin/strates`, migration 0031). L'échéance vivait dans un `CASE` recopié
au moins quatre fois (`mv_p2_promptitude`, `dqa.jour_limite_requisition`, le
repository, les migrations 0020 / 0028 / 0033 / 0038). Le régime était déduit
d'une comparaison de chaîne `dqa.strate_de(type_structure) = 'District'` : le
régime de calcul s'appuyait sur un libellé d'affichage, deux responsabilités
dans un seul champ. Ajouter un type (`CHU`, `INSTITUT`) ou corriger une
échéance imposait une migration **et** une reconstruction des vues
matérialisées.

Constat sur la donnée réelle : la feuille SITES du canevas ne porte que trois
valeurs de `type_structure` (`ESPC`, `Hôpital de référence`,
`District sanitaire`) alors que l'en-tête du gabarit en annonce six et plus
(`CHU, CHR, HG, CSU, CSR, ESPC…`). Le sous-type (CSU vs CSR, CHR vs HG) n'est
pas un champ : il vit dans `site_nom` et l'infixe de `site_code`. La
granularité de la colonne n'est pas garantie d'une extraction à l'autre.

**Décision.** Une seule table administrée, `strate_structure` (déjà l'objet de
`/admin/strates`), porte par `type_structure` : `strate`,
`jour_limite_requisition`, `est_district`. Tout consommateur la lit ; plus
aucun `CASE` ni comparaison de chaîne ailleurs.

1. **Colonnes ajoutées.** `jour_limite_requisition int NOT NULL`,
   `est_district boolean NOT NULL DEFAULT false`.

2. **Fonctions résolveuses.** `dqa.jour_limite_requisition(text)` (un seul
   argument désormais) renvoie la valeur de la table, sinon 10.
   `dqa.est_district(text)` renvoie la valeur de la table, sinon false.
   `dqa.strate_de(text)` est inchangée.

3. **Repli.** Un `type_structure` absent de la table (ou NULL) vaut strate
   « Non classé », `est_district` false, échéance 10 — le plus permissif,
   cohérent avec l'ancien `ELSE` et avec l'ADR 0012 (« comme un site de
   soins »). Un type non mappé présent dans le périmètre remonte dans
   l'onglet « à classer » de l'écran : il n'est jamais scoré en silence.

4. **`dim_site.jour_limite_requisition` supprimé.** Le canevas le déclarait
   déjà « dérivé du `type_structure` » ; il n'a jamais de valeur propre. La
   colonne quitte `stg_sites`, `dim_site`, la promotion et le contrat
   d'extraction.

5. **Seed du référentiel.**

   | `type_structure` | `strate` | `jour_limite_requisition` | `est_district` |
   |---|---|---|---|
   | `ESPC` | ESPC | 5 | false |
   | `Hôpital de référence` | Hôpital de référence | 7 | false |
   | `District sanitaire` | District | 10 | true |
   | `CHU` | CHU | 10 | false |
   | `INSTITUT` | Institut | 10 | false |

   Les lignes sous-type de la migration 0031 (`CSU`, `CSR`, `HG`, `CHR`) sont
   retirées : la table porte le niveau `name_category3`, pas le sous-type.
   `CHU` et `INSTITUT` sont absents des 40 sites actuels — semés pour être
   prêts.

**Ce qui ne change pas.**

- La strate reste un regroupement d'affichage non historisé (ADR 0005) : un
  changement prend effet à la consultation suivante.
- Le **seuil** district de P3 vient toujours de la grille
  (`grille_seuil_sous_composante.seuil_district`, ADR 0011). Le référentiel
  dit **qui** est un district ; la grille dit **quel seuil** lui appliquer.
- Les scores gelés (ADR 0003, ADR 0010) : non recalculés.
- Sur le périmètre réel actuel, **aucun score ne bouge** : les trois valeurs
  présentes donnent exactement le comportement des anciens `CASE`
  (`ESPC → 5`, `Hôpital de référence → 7`, `District sanitaire → 10 / district`).

**Conséquences.**

- Migration unique : colonnes, seed, fonctions, puis reconstruction en cascade
  `mv_p2_promptitude → mv_p3_regularite → mv_p4_ecart_produit → mv_p4_ecart →
  mv_score_pilier`, close par `rafraichir_et_geler(NULL)`.
- Ajouter un `type_structure` ou corriger une échéance : une ligne dans
  `/admin/strates`, effet au prochain rafraîchissement, zéro migration.
- `dqa.mois_est_clos` lit `max(jour_limite_requisition)` de la table au lieu du
  10 codé en dur.
- L'écran `/admin/strates` gagne deux colonnes éditables ; son titre passe de
  « Strates de structure » à « Types de structure » (la table ne fait plus que
  des strates).

**Alternatives écartées.**

- *Garder le `CASE` et y ajouter `CHU` / `INSTITUT`.* Rejeté : le problème
  revient au type suivant, et une échéance reste non administrable.
- *Table clé = sous-type (`CSU`, `CSR`, `CHR`, `HG`…).* Rejeté : la donnée
  réelle porte le palier, pas le sous-type ; le mapping n'aurait jamais de
  correspondance à faire. Si une extraction future descend au sous-type, la
  ligne se crée dans l'écran d'admin sans migration.
- *Garder `dim_site.jour_limite_requisition` comme override par site.* Rejeté :
  deux sources de vérité pour une valeur qui n'a jamais divergé du type.
- *`est_district` en union `regime ∈ {district, soins}`.* Envisagé ; booléen
  retenu : la distinction est binaire et stable, aucun appétit pour un
  troisième régime.
