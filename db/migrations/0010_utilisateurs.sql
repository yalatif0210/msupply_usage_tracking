-- ═══════════════════════════════════════════════════════════════════════════
--  Authentification (ADR 0004)
--  Tout accès à l'application est authentifié. Trois rôles ; comptes
--  provisionnés ici, pas d'auto-inscription.
--
--  Mots de passe de seed (à changer avant toute mise en service réelle) :
--    lecteur       / lecteur-2026
--    coordination  / coordination-2026
--    admin         / admin-2026
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

CREATE TABLE utilisateur (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    identifiant        text        NOT NULL UNIQUE,
    nom                text        NOT NULL,
    role               text        NOT NULL CHECK (role IN ('lecteur', 'coordination', 'admin')),
    mot_de_passe_hash  text        NOT NULL,
    actif              boolean     NOT NULL DEFAULT true,
    cree_le            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id uuid        NOT NULL REFERENCES utilisateur (id) ON DELETE CASCADE,
    cree_le        timestamptz NOT NULL DEFAULT now(),
    expire_le      timestamptz NOT NULL
);

CREATE INDEX idx_session_expire ON session (expire_le);

INSERT INTO utilisateur (identifiant, nom, role, mot_de_passe_hash) VALUES
    ('lecteur', 'Lecteur (compte de démonstration)', 'lecteur',
     'scrypt$7afdfe7eb1827390c39a01400834e78d$abb0e078ce508b6700d3d06cf57054d1a05eb0bca7cd483353c5eeb7c58eabe2'),
    ('coordination', 'Coordination nationale (compte de démonstration)', 'coordination',
     'scrypt$5eadaf1e798435216a21f23bd810b221$59654ac009b923639adb18a534e16d94d08f2b77c63a3746332325686576b62b'),
    ('admin', 'Administration (compte de démonstration)', 'admin',
     'scrypt$de00cf286e86ca62b95b2d7d7cc6fb30$67f49df229816010c8e1ff3bb423dadfcd199a590dc0462742c7aa4621ed13b3')
ON CONFLICT (identifiant) DO NOTHING;
