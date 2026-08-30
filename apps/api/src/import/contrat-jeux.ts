/**
 * Contrat des 9 jeux de données du classeur d'extraction V2.
 * Source unique pour la validation (colonnes attendues, champs requis,
 * références croisées) et le staging (table cible).
 */

export interface DefinitionJeu {
  onglet: string;
  table: string; // table stg_* (schéma dqa)
  colonnes: readonly string[]; // noms attendus en ligne 5, dans l'ordre
  requis: readonly string[]; // colonnes qui ne doivent pas être vides
  /** Références croisées : colonne de ce jeu -> jeu de référence + sa colonne clé. */
  references?: readonly { colonne: string; jeu: string; cle: string }[];
  dates?: readonly string[];
  nombres?: readonly string[];
  booleens?: readonly string[];
}

export const JEUX: readonly DefinitionJeu[] = [
  {
    onglet: 'SITES',
    table: 'stg_sites',
    colonnes: [
      'site_id', 'site_code', 'site_nom', 'district', 'region',
      'type_structure', 'actif', 'dans_perimetre_dqa', 'jour_limite_requisition',
    ],
    requis: ['site_id', 'site_nom', 'actif', 'dans_perimetre_dqa'],
    booleens: ['actif', 'dans_perimetre_dqa'],
    nombres: ['jour_limite_requisition'],
  },
  {
    onglet: 'SITE_PROGRAMME',
    table: 'stg_site_programme',
    colonnes: ['site_id', 'programme_id', 'programme_code', 'programme_nom', 'actif'],
    requis: ['site_id', 'programme_id', 'programme_nom', 'actif'],
    references: [{ colonne: 'site_id', jeu: 'SITES', cle: 'site_id' }],
    booleens: ['actif'],
  },
  {
    onglet: 'PRODUITS',
    table: 'stg_produits',
    colonnes: ['produit_id', 'produit_code', 'produit_nom', 'unite', 'programmes'],
    requis: ['produit_id', 'produit_nom'],
  },
  {
    onglet: 'TRANSACTIONS',
    table: 'stg_transactions',
    colonnes: [
      'transaction_id', 'site_id', 'nature', 'programme_id', 'type_transaction',
      'mode', 'statut', 'annulation', 'date_saisie', 'date_confirmation',
      'date_livraison', 'requisition_id', 'goods_received_id', 'commentaire',
    ],
    requis: ['transaction_id', 'site_id', 'nature', 'statut'],
    references: [{ colonne: 'site_id', jeu: 'SITES', cle: 'site_id' }],
    dates: ['date_saisie', 'date_confirmation', 'date_livraison'],
    booleens: ['annulation'],
  },
  {
    onglet: 'LIGNES_TRANSACTIONS',
    table: 'stg_lignes_transactions',
    colonnes: [
      'ligne_id', 'transaction_id', 'produit_id', 'programme_id', 'lot',
      'quantite', 'taille_conditionnement', 'type_ligne', 'issu_ajustement', 'date_peremption',
    ],
    requis: ['ligne_id', 'transaction_id', 'produit_id', 'quantite', 'taille_conditionnement'],
    references: [
      { colonne: 'transaction_id', jeu: 'TRANSACTIONS', cle: 'transaction_id' },
      { colonne: 'produit_id', jeu: 'PRODUITS', cle: 'produit_id' },
    ],
    nombres: ['quantite', 'taille_conditionnement'],
    booleens: ['issu_ajustement'],
    dates: ['date_peremption'],
  },
  {
    onglet: 'STOCK_ACTUEL',
    table: 'stg_stock_actuel',
    colonnes: ['site_id', 'produit_id', 'lot', 'quantite_disponible', 'date_peremption', 'date_photo'],
    requis: ['site_id', 'produit_id', 'quantite_disponible', 'date_photo'],
    references: [
      { colonne: 'site_id', jeu: 'SITES', cle: 'site_id' },
      { colonne: 'produit_id', jeu: 'PRODUITS', cle: 'produit_id' },
    ],
    nombres: ['quantite_disponible'],
    dates: ['date_peremption', 'date_photo'],
  },
  {
    onglet: 'INVENTAIRES',
    table: 'stg_inventaires',
    colonnes: [
      'inventaire_id', 'site_id', 'programme_id', 'date_inventaire',
      'statut', 'invad_additions_id', 'invad_reductions_id',
    ],
    requis: ['inventaire_id', 'site_id', 'date_inventaire', 'statut'],
    references: [{ colonne: 'site_id', jeu: 'SITES', cle: 'site_id' }],
    dates: ['date_inventaire'],
  },
  {
    onglet: 'INVENTAIRE_LIGNES',
    table: 'stg_inventaire_lignes',
    colonnes: ['inventaire_id', 'produit_id', 'lot', 'quantite_theorique', 'quantite_comptee'],
    requis: ['inventaire_id', 'produit_id', 'quantite_theorique', 'quantite_comptee'],
    references: [
      { colonne: 'inventaire_id', jeu: 'INVENTAIRES', cle: 'inventaire_id' },
      { colonne: 'produit_id', jeu: 'PRODUITS', cle: 'produit_id' },
    ],
    nombres: ['quantite_theorique', 'quantite_comptee'],
  },
  {
    onglet: 'REQUISITIONS',
    table: 'stg_requisitions',
    colonnes: [
      'requisition_id', 'site_id', 'programme_id', 'periode_id',
      'mois_couvert_debut', 'mois_couvert_fin', 'date_soumission',
      'date_inventaire_ref', 'date_reception', 'statut', 'statut_autorisation', 'type_requisition',
    ],
    requis: ['requisition_id', 'site_id', 'mois_couvert_debut', 'date_soumission', 'statut'],
    references: [{ colonne: 'site_id', jeu: 'SITES', cle: 'site_id' }],
    dates: ['mois_couvert_debut', 'mois_couvert_fin', 'date_soumission', 'date_inventaire_ref', 'date_reception'],
  },
] as const;

/** Vocabulaire contrôlé de `nature` (canevas §4.5). */
export const NATURES = [
  'dispensation', 'distribution', 'facture_fournisseur', 'reception',
  'ajustement_positif', 'ajustement_negatif', 'retour_fournisseur',
  'retour_client', 'cession_sortie', 'cession_entree', 'autre',
] as const;

export const COMPTEURS_METADATA: Record<string, string> = {
  SITES: 'nb_lignes_SITES',
  SITE_PROGRAMME: 'nb_lignes_SITE_PROGRAMME',
  PRODUITS: 'nb_lignes_PRODUITS',
  TRANSACTIONS: 'nb_lignes_TRANSACTIONS',
  LIGNES_TRANSACTIONS: 'nb_lignes_LIGNES_TRANSACTIONS',
  STOCK_ACTUEL: 'nb_lignes_STOCK_ACTUEL',
  INVENTAIRES: 'nb_lignes_INVENTAIRES',
  INVENTAIRE_LIGNES: 'nb_lignes_INVENTAIRE_LIGNES',
  REQUISITIONS: 'nb_lignes_REQUISITIONS',
};
