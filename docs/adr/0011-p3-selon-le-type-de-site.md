# P3 se mesure différemment pour un district

**Contexte.** P3 (régularité de saisie) compte les jours du mois où le site a
enregistré au moins une sortie de stock (`dispensation` ou `distribution`),
divisé par les jours calendaires, seuil 65 %. Cette mesure suppose une
activité de sortie quasi quotidienne : elle décrit un centre de santé qui
dispense à des patients. Un district sanitaire ne dispense pas ; il **répond
aux réquisitions** de ses sites rattachés par des factures (distributions),
quelques fois par mois. Mesuré comme les autres, un district est
systématiquement en alerte sur P3 alors que sa régularité se joue ailleurs.

**Décision.** Pour un district (`strate_de(type_structure) = 'District'`), P3
mesure sa capacité à honorer les réquisitions de sa zone :

```
              réquisitions DISTINCTES de la zone du district couvrant M-1,
              servies par une distribution du district (liée par
              requisition_id) datée dans le mois PAQD M
taux(D, M) = ──────────────────────────────────────────────────────────────
              réquisitions DISTINCTES de la zone du district couvrant M-1
```

- **Zone du district** = sites du périmètre dont `dim_site.district` est celui
  du district. Proxy géographique : l'extraction ne capture pas le lien
  fournisseur (`requisition.type = 'request'` uniquement, `v_dqa_requisitions`).
- **Mois évalué** : P3 du mois PAQD M porte sur les réquisitions couvrant M-1
  (soumises début M, à servir pendant M).
- **Réponse** : une distribution du district rattachée à la réquisition
  (`fact_transaction.requisition_id`), datée entre le 1er et le dernier jour de
  M. Plusieurs distributions pour une réquisition comptent pour une
  (`count(DISTINCT requisition_id)`).
- **Seuil ≥ 80 %**, plus exigeant que les 65 % du cas dispensation.
- NON_CALCULABLE si la zone n'a aucune réquisition couvrant M-1.

**Modèle.** Une seule sous-composante `regularite_saisie` (le modèle de score
reste à dix). Sa valeur, son seuil et son libellé s'adaptent au type de site.
Le seuil district vit dans la grille : colonne `seuil_district` sur
`grille_seuil_sous_composante`, renseignée sur la seule ligne
`regularite_saisie`, éditable par la coordination comme le reste de la grille
(ADR 0003). Pas de onzième sous-composante : l'énum `SousComposante`, le radar,
la synthèse et les dix colonnes `sc_*` de `hist_score_site` sont inchangés.

**Pourquoi pas deux sous-composantes.** `regularite_dispensation` +
`regularite_distribution` aurait donné à chaque site une sous-composante
mesurée et une autre en permanence NON_CALCULABLE, fait passer « dix
sous-composantes » à onze partout (schéma, contrats, radar, synthèse), sans
bénéfice : un district n'a pas de régularité de dispensation à afficher.

**Conséquence.** `mv_p3_regularite` porte une branche `UNION ALL` (dispensation
pour les non-districts, réponse aux réquisitions pour les districts) et une
colonne `est_district`. `mv_score_pilier` et `v_sous_composante_atteinte`
choisissent `seuil` ou `seuil_district` selon cette colonne ; la synthèse en
hérite. Le détail ligne à ligne de P3 d'un district montre le couple
`réquisitions de la zone (couvrant M-1)` / `servies dans M`, pas le bandeau
calendaire. Le libellé affiché est « Régularité de saisie (distribution) » sur
les écrans d'un district, « (dispensation) » ailleurs, neutre dans les
agrégats nationaux.
