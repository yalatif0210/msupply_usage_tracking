# Le silence d'un site de soins est un signal, pas un état vide

**Statut.** Accepté.

**Contexte.** Le tableau de bord doit anticiper au jour le jour une mauvaise
utilisation de mSupply, pas seulement photographier un mois clos. Or plusieurs
sous-composantes rendaient NON_CALCULABLE (donc invisibles, exclues des
agrégats) des situations qui sont en réalité des manquements :

- un centre de santé sans aucune sortie de stock du mois n'avait pas de P3 ;
- un site sans inventaire finalisé du mois n'avait ni écart SDU (P4) ni
  concordance (P5) ;
- l'écart consommation exigeait **deux** inventaires dans le même mois : un site
  qui fait un seul inventaire de fin de mois (le cas normal) n'était jamais
  évalué ;
- l'inventaire de complétude P1 comptait quelle que soit sa date, alors que la
  promptitude P2 exige les trois derniers jours du mois — un inventaire de
  milieu de mois « complétait » sans jamais valoir inventaire de fin de mois.

**Décision.** Un site du périmètre est attendu actif chaque mois. Ne rien
transmettre est **0 %** (ALERTE), plus NON_CALCULABLE.

1. **P1 complétude des inventaires** ne compte l'inventaire que s'il est daté
   dans les trois derniers jours du mois — exactement la fenêtre de la
   promptitude P2. Les deux sous-composantes deviennent identiques : c'est
   assumé, l'échéance de fin de mois pèse alors 10 % (P1) + 15 % (P2).

2. **P3 régularité** est un compteur au fil des jours écoulés, borné au mois
   (dénominateur = jours du 1er à aujourd'hui, plafonné au nombre de jours du
   mois ; il se stabilise de lui-même à la clôture). Pour tout site non-district
   du périmètre, une ligne « tous programmes » existe pour chaque mois couvert
   par un import, même sans aucune sortie : 0 jour ⇒ 0 %. Les districts gardent
   leur mesure propre (ADR 0011) et restent NON_CALCULABLE sans réquisition de
   zone à évaluer.

3. **P4 écart SDU** et **P5 concordance** valent 0 % quand le site n'a aucun
   inventaire finalisé daté dans le mois. NON_CALCULABLE se réserve au cas où
   le site a bien inventorié mais sans produit traceur exploitable.

4. **P4 écart consommation** prend des bornes inter-mois : ouverture = dernier
   inventaire finalisé du mois M-1, clôture = dernier inventaire finalisé du
   mois M. Fallback sur le premier / dernier inventaire de M si M-1 n'a aucun
   inventaire et que M en a deux. Un traceur inventorié sans borne d'ouverture
   exploitable (M-1 sans inventaire et M avec un seul) ⇒ 0 %. NON_CALCULABLE
   seulement si des bornes existent mais qu'aucune consommation reconstituée
   n'est positive (donnée douteuse), ou si aucun traceur n'est inventorié.
   Pour un district, la consommation déclarée compte les quantités
   **distribuées** ;
   la sous-composante se lit « écart distribution » (comme P3 se lit
   « régularité de saisie (distribution) »). Règle générale : partout où un
   site de soins parle de dispensation / consommation, un district parle de
   distribution.

Le durcissement porte sur le grain « tous programmes » (le score de site). Le
détail par programme reste calculé là où le site a effectivement rapporté ce
programme.

**Ce qui ne change pas.** P2 (promptitude) et P6 (ratio d'ajustements) :
inchangés. P6 « aucun mouvement » reste NON_CALCULABLE. Les bornes de l'écart
SDU et de la concordance (dernier inventaire du mois) : inchangées ; un
inventaire hors des trois derniers jours reste un relevé physique valable pour
P4/P5. L'immutabilité des cycles clos (ADR 0003, ADR 0010) : inchangée, elle
tient à la règle de validation `MOIS_PAQD_TROP_ANCIEN`.

**Conséquences.**

- Les scores baissent, surtout pour les sites peu réguliers et pour le mois en
  cours. C'est l'effet recherché : le tableau de bord montre qui décroche
  pendant que le mois court, sans attendre sa clôture.
- La règle « un mois vide reste un état vide » (P1) ne vaut plus pour un site
  de soins du périmètre : il n'y a plus de mois « vide », le silence est scoré.
- `mv_p3_regularite` dépend de `CURRENT_DATE` (dénominateur au fil de l'eau) :
  un rafraîchissement fait évoluer le P3 d'un mois non clos. C'est cohérent
  avec le repère « score provisoire » (`mois_est_clos`).
- Migration `0037` : reconstruit tous les mois trouvables dans le core via
  `rafraichir_et_geler(NULL)`, y compris les nouveaux grains (site silencieux
  à 0 %).
- Le jeu de démonstration a été refait : les inventaires mensuels, réceptions
  et dispensations se réconcilient sur des fenêtres d'un mois complet.

**Alternatives écartées.**

- *Garder NON_CALCULABLE et tout miser sur le badge « score provisoire ».*
  Rejeté : un site invisible dans les agrégats n'alerte personne.
- *Retirer la sous-composante inventaire de P2 puisqu'elle double P1.* Rejeté :
  le doublon est une sévérité voulue sur l'échéance de fin de mois.
- *Dénominateur P3 = tous les jours du mois même en cours.* Rejeté : au 5 du
  mois, tout le monde est à ~15 %, le score ne distingue plus rien.
