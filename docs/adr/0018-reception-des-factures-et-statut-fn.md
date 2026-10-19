# Une facture est réceptionnée quand elle est finalisée ; seul le statut fn compte

**Statut.** Accepté (2026-10-19).

**Contexte.** Le tableau de bord traitait le type mSupply `rc` comme une
réception de marchandises (nature `reception`) et le type `si` comme une
simple facture. Les données réelles (lot du 2026-10-14) montrent l'inverse :
les 1 712 `rc` portent tous le commentaire « Reçu pour facture(s) … », n'ont
ni programme ni ligne de produit, et aucun district n'en a : ce sont des
**reçus de paiement** (encaissements des ventes recouvrables). Les entrées de
stock passent par les factures fournisseur `si`, dont le cycle de vie dans
mSupply est `nw` (adressée) puis `cn` (confirmée) puis `fn` (finalisée).
Conséquence mesurée : P4 consommation ignorait toutes les entrées de stock
(conformes 30 au lieu de 59 en septembre) et P1 divisait des encaissements
par des factures (de 0 % à 3 250 %).

**Décision.**

- Une facture `si` est **réceptionnée** quand elle est au statut `fn`. Sa
  date de réception est sa date de finalisation. En Côte d'Ivoire, on ne peut
  prétendre consommer un produit qu'une fois sa réception admise.
- `rc` devient la nature `encaissement`, exclue de tous les piliers.
- Seules les transactions au statut `fn` entrent dans les calculs des
  piliers. Les autres restent en base, pour la traçabilité et pour le
  dénominateur des réceptions (ADR 0019).
- P4 consommation : les entrées de stock sont les lignes des `si`
  réceptionnées, hors ajustements d'inventaire.

**Pourquoi.** Compter un `rc` comme une réception mélange la trésorerie et le
stock. Compter une facture non finalisée comme une entrée revient à admettre
une consommation sur un produit dont la réception n'est pas confirmée.

**Conséquences.** L'extraction doit fournir la date de finalisation des
transactions et toutes les factures `si`, y compris non finalisées. Les
dispensations et lignes au statut `cn` (637 et 520 sur le lot du 2026-10-14)
sortent des calculs de P3 et P6.
