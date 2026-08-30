-- ═══════════════════════════════════════════════════════════════════════════
--  Grille de paramètres PAQD (ADR 0003)
--  Jeu daté des poids de piliers et des seuils de sous-composantes. Éditée par
--  la coordination nationale ; une modification ne vaut que pour les cycles à
--  venir. Chaque score historisé référence sa grille et reste immuable.
--
--  `sens` : 'sup' → conforme si valeur >= seuil ; 'inf' → conforme si <= seuil.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE grille_parametre (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version           text        NOT NULL,
    effet_a_partir_de date        NOT NULL UNIQUE,
    cree_le           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE grille_poids_pilier (
    grille_id bigint       NOT NULL REFERENCES grille_parametre (id) ON DELETE CASCADE,
    pilier    text         NOT NULL CHECK (pilier IN ('P1', 'P2', 'P3', 'P4', 'P5', 'P6')),
    poids_pct numeric(5, 2) NOT NULL CHECK (poids_pct >= 0 AND poids_pct <= 100),
    PRIMARY KEY (grille_id, pilier)
);

CREATE TABLE grille_seuil_sous_composante (
    grille_id       bigint       NOT NULL REFERENCES grille_parametre (id) ON DELETE CASCADE,
    sous_composante text         NOT NULL,
    seuil           numeric(8, 2) NOT NULL,
    sens            text         NOT NULL CHECK (sens IN ('sup', 'inf')),
    unite           text         NOT NULL DEFAULT 'pct',
    PRIMARY KEY (grille_id, sous_composante)
);

-- ── Grille v1 : valeurs de CLAUDE.md §5 ────────────────────────────────────

INSERT INTO grille_parametre (version, effet_a_partir_de) VALUES ('v1', DATE '2026-01-01');

INSERT INTO grille_poids_pilier (grille_id, pilier, poids_pct)
SELECT g.id, v.pilier, v.poids
FROM grille_parametre g,
     (VALUES ('P1', 10.00), ('P2', 15.00), ('P3', 15.00),
             ('P4', 25.00), ('P5', 25.00), ('P6', 10.00)) AS v (pilier, poids)
WHERE g.version = 'v1';

INSERT INTO grille_seuil_sous_composante (grille_id, sous_composante, seuil, sens, unite)
SELECT g.id, v.sc, v.seuil, v.sens, 'pct'
FROM grille_parametre g,
     (VALUES
        ('completude_inventaires',   100.00, 'sup'),
        ('completude_requisitions',  100.00, 'sup'),
        ('completude_receptions',    100.00, 'sup'),
        ('promptitude_inventaires',   65.00, 'sup'),
        ('promptitude_requisitions',  65.00, 'sup'),
        ('regularite_saisie',         65.00, 'sup'),
        ('ecart_sdu',                  2.00, 'inf'),
        ('concordance',              100.00, 'sup'),
        ('ratio_ajustements',          5.00, 'inf')
     ) AS v (sc, seuil, sens)
WHERE g.version = 'v1';

-- Vue pratique : grille active pour une date donnée.
CREATE VIEW v_grille_active AS
SELECT g.*
FROM grille_parametre g
WHERE g.effet_a_partir_de = (
    SELECT max(effet_a_partir_de) FROM grille_parametre WHERE effet_a_partir_de <= CURRENT_DATE
);
