-- ═══════════════════════════════════════════════════════════════════════════
--  Produits traceurs (ADR 0005)
--  Liste de référence administrée dans l'application, pas dérivée de mSupply.
--  Clé = code produit (item.code), apparié à dim_produit au moment du calcul.
--  Le seed ci-dessous est un PLACEHOLDER : à remplacer par la liste réelle
--  fournie par la mission DQA, revue à chaque cycle.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE dim_produit_traceur (
    produit_code text PRIMARY KEY,
    libelle      text,
    actif        boolean     NOT NULL DEFAULT true,
    maj_le       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dim_produit_traceur IS
    'Panier traceur DQA. Filtre P4 (écart SDU) et P5 (concordance). Édité via la console web (à venir).';

INSERT INTO dim_produit_traceur (produit_code, libelle) VALUES
    ('__PLACEHOLDER_TRACEUR_1__', 'À remplacer par la liste de la mission'),
    ('__PLACEHOLDER_TRACEUR_2__', 'À remplacer par la liste de la mission')
ON CONFLICT (produit_code) DO NOTHING;
