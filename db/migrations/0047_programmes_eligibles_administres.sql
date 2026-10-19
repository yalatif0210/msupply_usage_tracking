-- ═══════════════════════════════════════════════════════════════════════════
--  Programmes éligibles administrés dans l'application (ADR 0020).
--
--  Le statut actif d'un couple site x programme décide s'il est évalué (P1,
--  P2). Il venait seulement de SITE_PROGRAMME ; la coordination peut
--  désormais le changer dans la console. `origine` dit qui a fixé le statut
--  en dernier : la promotion ne touche plus jamais un couple « application »,
--  même si le fichier déclare l'inverse. Un couple nouveau du fichier entre
--  avec le statut du fichier.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO dqa, public;

ALTER TABLE dim_site_programme
    ADD COLUMN origine     text NOT NULL DEFAULT 'fichier'
        CHECK (origine IN ('fichier', 'application')),
    ADD COLUMN modifie_par text,
    ADD COLUMN modifie_le  timestamptz;

COMMENT ON COLUMN dim_site_programme.actif IS
    'Programme éligible à l''évaluation du site (P1, P2). Modifiable dans la console (ADR 0020).';
COMMENT ON COLUMN dim_site_programme.origine IS
    'fichier : statut repris de SITE_PROGRAMME ; application : fixé par la coordination, jamais écrasé par un import.';
